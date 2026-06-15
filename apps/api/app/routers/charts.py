"""Charts endpoints — OHLCV data served from stock_data_* MySQL tables.

GET /charts/symbols   — list all NSE EQ symbols from nse_eq_symbols
GET /charts/candles   — OHLCV for a symbol+timeframe from stock_data_* (DB primary, Upstox optional)
GET /charts/summary   — latest price + 52w high/low from stock_data_daily
POST /charts/indicator-backtest — server-side technical indicator backtest on real DB data
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def _ist_to_ms(dt: datetime) -> int:
    """Convert a naive datetime (already in IST) to epoch milliseconds."""
    return int(dt.replace(tzinfo=IST).timestamp() * 1000)
from typing import Any, Literal, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..db import db_query
from ..deps import optional_user, get_current_user
from ..services.upstox import TIMEFRAME_TO_UPSTOX, UpstoxClient


logger = logging.getLogger("signal_ai")
router = APIRouter(prefix="/charts", tags=["charts"])

Timeframe = Literal["5m", "15m", "1D", "1W", "1M", "1Y"]

# ── Timeframe → stock_data_* table ───────────────────────────────────────────
_TF_TABLE: dict[str, str] = {
    "5m":  "stock_data_5min",
    "15m": "stock_data_15min",
    "1D":  "stock_data_daily",
    "1W":  "stock_data_weekly",
    "1M":  "stock_data_monthly",
    "1Y":  "stock_data_daily",
}

# ── NSE symbol → ISIN mapping (dynamic, loaded from Upstox instrument CSV) ───
# Accessed via get_isin() / get_instrument_map() from instrument_map service.
# NIFTY500_ISIN kept as a proxy dict for backward-compat imports in upstox.py.
from ..services.instrument_map import get_instrument_map as _get_instrument_map

class _DynamicISINMap(dict):
    """Proxy dict that delegates lookups to the live instrument map."""
    def get(self, key, default=None):
        return _get_instrument_map().get(key.upper() if key else key, default)
    def __contains__(self, key):
        return key.upper() in _get_instrument_map() if key else False
    def __getitem__(self, key):
        val = self.get(key)
        if val is None:
            raise KeyError(key)
        return val

NIFTY500_ISIN: dict[str, str] = _DynamicISINMap()

_DEFAULT_EXCHANGE = "NSE_EQ"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_date(raw: str | None, fallback: date) -> date:
    if not raw:
        return fallback
    return datetime.strptime(raw, "%Y-%m-%d").date()


def _get_upstox_token() -> Optional[str]:
    try:
        from ..services.redis_client import get_upstox_token
        return get_upstox_token()
    except Exception as exc:
        logger.debug("Upstox token unavailable: %s", exc)
        return None


def _candles_from_upstox_raw(raw: list[dict]) -> list[dict]:
    result = []
    for c in raw:
        ts_str = c.get("time", "")
        try:
            dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            try:
                dt = datetime.strptime(ts_str[:10], "%Y-%m-%d")
            except ValueError:
                continue
        result.append({
            "t": _ist_to_ms(dt),
            "o": round(float(c["open"]), 2),
            "h": round(float(c["high"]), 2),
            "l": round(float(c["low"]), 2),
            "c": round(float(c["close"]), 2),
            "v": int(c["volume"]),
        })
    return result


def _fetch_db_candles(symbol: str, timeframe: str, from_date: str, to_date: str, limit: int) -> list[dict]:
    """Query stock_data_<timeframe> and return Highstock-compatible candles."""
    table = _TF_TABLE.get(timeframe)
    if not table:
        return []
    try:
        rows = db_query(
            f"SELECT candle_time, open, high, low, close, volume "
            f"FROM `{table}` "
            f"WHERE stock_code = %s AND candle_time BETWEEN %s AND %s "
            f"ORDER BY candle_time ASC LIMIT %s",
            (symbol.upper(), f"{from_date} 00:00:00", f"{to_date} 23:59:59", limit),
        )
    except Exception as exc:
        logger.warning("DB candle fetch failed for %s/%s: %s", symbol, timeframe, exc)
        return []

    candles = []
    for r in rows:
        ct = r["candle_time"]
        if isinstance(ct, datetime):
            dt = ct
        else:
            try:
                dt = datetime.strptime(str(ct), "%Y-%m-%d %H:%M:%S")
            except ValueError:
                dt = datetime.strptime(str(ct)[:10], "%Y-%m-%d")
        candles.append({
            "t": _ist_to_ms(dt),
            "o": round(float(r["open"]), 2),
            "h": round(float(r["high"]), 2),
            "l": round(float(r["low"]), 2),
            "c": round(float(r["close"]), 2),
            "v": int(r["volume"]),
        })
    return candles


# ── Indicator helpers (pure numpy/pandas — no external TA lib required) ───────

def _sma(s: pd.Series, p: int) -> pd.Series:
    return s.rolling(p).mean()

def _ema(s: pd.Series, p: int) -> pd.Series:
    return s.ewm(span=p, adjust=False).mean()

def _wma(s: pd.Series, p: int) -> pd.Series:
    w = np.arange(1, p + 1, dtype=float)
    return s.rolling(p).apply(lambda x: float(np.dot(x, w) / w.sum()), raw=True)

def _rsi(s: pd.Series, p: int = 14) -> pd.Series:
    d = s.diff()
    gain = d.clip(lower=0).ewm(alpha=1 / p, adjust=False).mean()
    loss = (-d.clip(upper=0)).ewm(alpha=1 / p, adjust=False).mean()
    rs = gain / loss.replace(0, float("nan"))
    return 100 - 100 / (1 + rs)

def _macd_line(s: pd.Series, fast: int = 12, slow: int = 26) -> pd.Series:
    return _ema(s, fast) - _ema(s, slow)

def _vwap(df: pd.DataFrame) -> pd.Series:
    tp = (df["high"] + df["low"] + df["close"]) / 3
    cumvol = df["volume"].cumsum()
    cumtp  = (tp * df["volume"]).cumsum()
    return cumvol.where(cumvol == 0, cumtp / cumvol.replace(0, float("nan")))

def _bb_upper(s: pd.Series, p: int = 20, mult: float = 2.0) -> pd.Series:
    return s.rolling(p).mean() + mult * s.rolling(p).std()

def _supertrend(df: pd.DataFrame, p: int = 10, mult: float = 3.0) -> pd.Series:
    hl2 = (df["high"] + df["low"]) / 2
    tr  = pd.concat([
        df["high"] - df["low"],
        (df["high"] - df["close"].shift()).abs(),
        (df["low"]  - df["close"].shift()).abs(),
    ], axis=1).max(axis=1)
    atr = tr.ewm(span=p, adjust=False).mean()
    upper = hl2 + mult * atr
    lower = hl2 - mult * atr
    supertrend = pd.Series(index=df.index, dtype=float)
    direction  = pd.Series(1, index=df.index, dtype=int)
    for i in range(1, len(df)):
        if df["close"].iloc[i] > upper.iloc[i - 1]:
            direction.iloc[i] = 1
        elif df["close"].iloc[i] < lower.iloc[i - 1]:
            direction.iloc[i] = -1
        else:
            direction.iloc[i] = direction.iloc[i - 1]
        supertrend.iloc[i] = lower.iloc[i] if direction.iloc[i] == 1 else upper.iloc[i]
    return supertrend


def _get_series(df: pd.DataFrame, kind: str, src: str, period: int) -> pd.Series:
    base = df[src] if src in df.columns else df["close"]
    if kind == "price":   return df["close"]
    if kind == "value":   return pd.Series(dtype=float)   # handled separately
    if kind == "SMA":     return _sma(base, period)
    if kind == "EMA":     return _ema(base, period)
    if kind == "WMA":     return _wma(base, period)
    if kind == "RSI":     return _rsi(base, period)
    if kind == "MACD":    return _macd_line(base)
    if kind == "VWAP":    return _vwap(df)
    if kind == "BBANDS":  return _bb_upper(base, period)
    if kind == "SUPERTREND": return _supertrend(df, period)
    return base


def _evaluate_condition(df: pd.DataFrame, cond: dict) -> pd.Series:
    """Returns a boolean Series for when the condition is True."""
    lhs_def = cond.get("lhs", {})
    rhs_def = cond.get("rhs", {})
    op      = cond.get("op", ">")

    lhs_val = lhs_def.get("value")
    rhs_val = rhs_def.get("value")

    if lhs_def.get("kind") == "value":
        lhs = pd.Series(float(lhs_val or 0), index=df.index)
    else:
        lhs = _get_series(df, lhs_def.get("kind","price"), lhs_def.get("src","close"), lhs_def.get("period",14))

    if rhs_def.get("kind") == "value":
        rhs = pd.Series(float(rhs_val or 0), index=df.index)
    else:
        rhs = _get_series(df, rhs_def.get("kind","price"), rhs_def.get("src","close"), rhs_def.get("period",14))

    if op == ">":            return lhs > rhs
    if op == "<":            return lhs < rhs
    if op == ">=":           return lhs >= rhs
    if op == "<=":           return lhs <= rhs
    if op == "==":           return lhs == rhs
    if op == "crosses above": return (lhs > rhs) & (lhs.shift(1) <= rhs.shift(1))
    if op == "crosses below": return (lhs < rhs) & (lhs.shift(1) >= rhs.shift(1))
    return pd.Series(False, index=df.index)


def _run_indicator_backtest(
    df: pd.DataFrame,
    symbol: str,
    conditions: list[dict],
    action: str,
    sl_pct: float,
    tp_pct: float,
    tsl_pct: float,
    qty: int,
    max_hold_days: int,
) -> dict:
    if df.empty or not conditions:
        return {"symbol": symbol, "totalTrades": 0, "winTrades": 0, "losses": 0,
                "winRate": 0, "totalPnl": 0, "maxDD": 0, "sharpe": 0, "trades": []}

    # Compute entry signals: ALL conditions must be True simultaneously
    entry_mask = pd.Series(True, index=df.index)
    for cond in conditions:
        entry_mask &= _evaluate_condition(df, cond)

    trades: list[dict] = []
    in_pos = False
    entry_price = 0.0
    entry_date  = ""
    sl_price    = 0.0
    tp_price    = 0.0
    tsl_price   = 0.0
    tsl_active  = False

    for i, (idx, row) in enumerate(df.iterrows()):
        price = float(row["close"])
        date_str = str(idx)[:10] if not isinstance(idx, str) else idx[:10]

        if not in_pos:
            if entry_mask.iloc[i]:
                in_pos = True
                entry_price = price
                entry_date  = date_str
                sl_price  = price * (1 - sl_pct / 100) if sl_pct else 0
                tp_price  = price * (1 + tp_pct / 100) if tp_pct else float("inf")
                tsl_price = 0.0
                tsl_active = False
        else:
            # Trailing SL activation
            if tp_pct and tsl_pct and not tsl_active and price >= tp_price:
                tsl_active = True
                tsl_price  = price * (1 - tsl_pct / 100)
            if tsl_active:
                new_tsl = price * (1 - tsl_pct / 100)
                tsl_price = max(tsl_price, new_tsl)

            # Exit conditions
            hold = (pd.Timestamp(date_str) - pd.Timestamp(entry_date)).days
            exit_reason = ""
            exit_price  = price

            if sl_pct and price <= sl_price:
                exit_reason = "SL"; exit_price = sl_price
            elif tsl_active and price <= tsl_price:
                exit_reason = "TSL"; exit_price = tsl_price
            elif tp_pct and not tsl_pct and price >= tp_price:
                exit_reason = "TP"; exit_price = tp_price
            elif max_hold_days and hold >= max_hold_days:
                exit_reason = "END"

            if exit_reason:
                pnl = (exit_price - entry_price) * qty if action == "BUY" else (entry_price - exit_price) * qty
                pnl_pct = ((exit_price - entry_price) / entry_price * 100) if action == "BUY" else ((entry_price - exit_price) / entry_price * 100)
                trades.append({
                    "entryDate": entry_date, "entryPrice": round(entry_price, 2),
                    "exitDate": date_str,    "exitPrice":  round(exit_price, 2),
                    "exitReason": exit_reason,
                    "pnl": round(pnl, 2),   "pnlPct": round(pnl_pct, 2),
                    "holdDays": hold,
                })
                in_pos = False

    wins     = sum(1 for t in trades if t["pnl"] > 0)
    total    = len(trades)
    total_pnl = sum(t["pnl"] for t in trades)
    pnl_series = [t["pnl"] for t in trades]

    # Max drawdown
    cumulative = np.cumsum([0.0] + pnl_series)
    peak = np.maximum.accumulate(cumulative)
    dd   = float(np.max(peak - cumulative)) if len(cumulative) > 1 else 0.0

    # Sharpe (annualised, assuming daily data ≈ 252 days)
    if len(pnl_series) > 1:
        arr  = np.array(pnl_series, dtype=float)
        sharpe = float(np.mean(arr) / (np.std(arr) + 1e-9) * np.sqrt(252))
    else:
        sharpe = 0.0

    return {
        "symbol": symbol,
        "totalTrades": total,
        "winTrades": wins,
        "losses": total - wins,
        "winRate": round(wins / total * 100, 1) if total else 0,
        "totalPnl": round(total_pnl, 2),
        "maxDD": round(dd, 2),
        "sharpe": round(sharpe, 2),
        "trades": trades,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/symbols")
def list_chart_symbols():
    """Return all NSE EQ symbols from nse_eq_symbols table."""
    try:
        rows = db_query(
            "SELECT symbol, company_name, industry FROM nse_eq_symbols ORDER BY symbol LIMIT 750"
        )
        return [
            {"symbol": r["symbol"], "name": r.get("company_name", ""), "sector": r.get("industry", "")}
            for r in rows
        ]
    except Exception as exc:
        logger.error("Failed to fetch symbols from DB: %s", exc)
        return []


@router.get("/candles")
async def get_candles(
    symbol: str    = Query("RELIANCE"),
    timeframe: Timeframe = Query("1D"),
    from_: str | None = Query(None, alias="from"),
    to: str | None    = Query(None),
    limit: int        = Query(500, ge=1, le=2000),
    user=Depends(optional_user),
):
    """Fetch OHLCV candles. Primary source: stock_data_* DB tables.
    Falls back to Upstox live API if a connected broker token is available.
    """
    sym   = symbol.upper()
    end   = _parse_date(to,   date.today())
    start = _parse_date(from_, end - timedelta(days=365))

    # ── Primary: local DB ────────────────────────────────────────────────────
    candles = _fetch_db_candles(sym, timeframe, start.isoformat(), end.isoformat(), limit)
    if candles:
        logger.info("Serving DB candles for %s [%s] — %d bars", sym, timeframe, len(candles))
        return {"symbol": sym, "timeframe": timeframe,
                "from": start.isoformat(), "to": end.isoformat(),
                "count": len(candles), "source": "db", "candles": candles}

    # ── Fallback: Upstox if broker is connected ───────────────────────────────
    if user:
        token = _get_upstox_token()
        isin  = NIFTY500_ISIN.get(sym)
        if token and isin:
            interval_type, interval_value = TIMEFRAME_TO_UPSTOX.get(timeframe, ("days", "1"))
            try:
                client  = UpstoxClient(access_token=token)
                raw     = await client.historical_candles_v3(
                    exchange=_DEFAULT_EXCHANGE, isin=isin,
                    interval_type=interval_type, interval_value=interval_value,
                    from_date=start.isoformat(), to_date=end.isoformat(),
                )
                candles = _candles_from_upstox_raw(raw)
                if candles:
                    logger.info("Serving Upstox candles for %s [%s]", sym, timeframe)
                    return {"symbol": sym, "timeframe": timeframe,
                            "from": start.isoformat(), "to": end.isoformat(),
                            "count": len(candles), "source": "upstox", "candles": candles}
            except Exception as exc:
                logger.warning("Upstox fetch failed for %s: %s", sym, exc)

    logger.warning("No candle data available for %s [%s]", sym, timeframe)
    return {"symbol": sym, "timeframe": timeframe,
            "from": start.isoformat(), "to": end.isoformat(),
            "count": 0, "source": "none", "candles": []}


@router.get("/summary")
async def get_summary(
    symbol: str = Query("RELIANCE"),
    user=Depends(optional_user),
):
    """Return latest price + 52-week stats from stock_data_daily."""
    sym   = symbol.upper()
    end   = date.today()
    start = end - timedelta(days=400)

    # ── Primary: DB daily table ───────────────────────────────────────────────
    candles = _fetch_db_candles(sym, "1D", start.isoformat(), end.isoformat(), 400)
    if candles:
        closes  = [c["c"] for c in candles]
        volumes = [c["v"] for c in candles]
        latest  = candles[-1]
        latest_date = datetime.fromtimestamp(latest["t"] / 1000, tz=IST).date().isoformat()
        return {
            "symbol": sym,
            "latestClose": latest["c"],
            "latestDate":  latest_date,
            "high52w":     round(max(closes), 2),
            "low52w":      round(min(closes), 2),
            "avgVolume":   round(sum(volumes) / len(volumes), 2),
            "source":      "db",
        }

    # ── Fallback: Upstox ─────────────────────────────────────────────────────
    if user:
        token = _get_upstox_token()
        isin  = NIFTY500_ISIN.get(sym)
        if token and isin:
            try:
                client = UpstoxClient(access_token=token)
                raw    = await client.historical_candles_v3(
                    exchange=_DEFAULT_EXCHANGE, isin=isin,
                    interval_type="days", interval_value="1",
                    from_date=start.isoformat(), to_date=end.isoformat(),
                )
                if raw:
                    closes  = [float(c["close"])  for c in raw]
                    volumes = [int(c["volume"])    for c in raw]
                    latest  = raw[-1]
                    return {
                        "symbol": sym,
                        "latestClose": round(float(latest["close"]), 2),
                        "latestDate":  latest["time"][:10],
                        "high52w":     round(max(closes), 2),
                        "low52w":      round(min(closes), 2),
                        "avgVolume":   round(sum(volumes) / len(volumes), 2),
                        "source":      "upstox",
                    }
            except Exception as exc:
                logger.warning("Upstox summary failed for %s: %s", sym, exc)

    return {"symbol": sym, "latestClose": 0, "latestDate": None,
            "high52w": 0, "low52w": 0, "avgVolume": 0, "source": "none"}


# ── Bulk indicator backtest ───────────────────────────────────────────────────

class BacktestSymbolRequest(BaseModel):
    symbol: str
    timeframe: str = "1D"
    from_date: str = ""
    to_date: str   = ""
    conditions: list[dict] = []
    action: str    = "BUY"
    sl_pct: float  = 2.0
    tp_pct: float  = 4.0
    tsl_pct: float = 0.0
    qty: int       = 100
    max_hold_days: int = 30


class BulkBacktestRequest(BaseModel):
    symbols: list[str]
    timeframe: str = "1D"
    from_date: str = ""
    to_date: str   = ""
    conditions: list[dict] = []
    action: str    = "BUY"
    sl_pct: float  = 2.0
    tp_pct: float  = 4.0
    tsl_pct: float = 0.0
    qty: int       = 100
    max_hold_days: int = 30


@router.post("/indicator-backtest")
def indicator_backtest(req: BulkBacktestRequest, user=Depends(get_current_user)):
    """Run a technical-indicator strategy backtest on real DB OHLCV data.

    Accepts a list of symbols and returns per-symbol results including trade list,
    win rate, P&L, and max drawdown. All data sourced from stock_data_<timeframe>.
    """
    end_date   = req.to_date   or date.today().isoformat()
    days       = 365
    start_date = req.from_date or (date.today() - timedelta(days=days)).isoformat()

    results: list[dict] = []
    for sym in req.symbols:
        candles = _fetch_db_candles(sym, req.timeframe, start_date, end_date, 2000)
        if not candles:
            results.append({
                "symbol": sym, "totalTrades": 0, "winTrades": 0, "losses": 0,
                "winRate": 0, "totalPnl": 0, "maxDD": 0, "sharpe": 0,
                "trades": [], "error": "No data in DB",
            })
            continue

        df = pd.DataFrame([{
            "open": c["o"], "high": c["h"], "low": c["l"],
            "close": c["c"], "volume": c["v"],
        } for c in candles])
        df.index = pd.to_datetime([
            datetime.fromtimestamp(c["t"] / 1000, tz=IST).strftime("%Y-%m-%d")
            for c in candles
        ])

        result = _run_indicator_backtest(
            df, sym, req.conditions, req.action,
            req.sl_pct, req.tp_pct, req.tsl_pct, req.qty, req.max_hold_days,
        )
        results.append(result)
        logger.info("Indicator backtest %s: %d trades, PnL=%.0f", sym, result["totalTrades"], result["totalPnl"])

    return {"results": results, "symbolCount": len(results)}
