"""Opening Range Breakout (ORB) Strategy Engine.

Price-action strategy that:
  1. Identifies the Opening Range — the first candle(s) of the trading day.
  2. Applies a volume filter — breakout candle volume must be > 2x the rolling
     20-candle average volume (strong breakout confirmation).
  3. Enters LONG when price breaks above the OR high / SHORT when it breaks below
     the OR low.
  4. Sets stop-loss at the low of the breakout candle (LONG) or its high (SHORT).
  5. Targets a 1:1 risk-reward ratio.
  6. Activates a trailing stop once the 1:1 target is hit (trails at 1× risk).

Data source: MySQL table ``stock_data_<timeframe>``
  Expected columns: symbol, time (datetime), open, high, low, close, volume
  Falls back to the shared ``candle_data`` table if the timeframe-specific table
  does not exist.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from ..db import db_query

logger = logging.getLogger("signal_ai")

# ── Timeframe → candle table map ──────────────────────────────────────────────
# Canonical timeframe labels used in API / table names
# ── Timeframe → candle table map ──────────────────────────────────────────────
# Maps UI timeframe labels → actual MySQL table names
TIMEFRAME_TABLE: dict[str, str] = {
    "1min":   "stock_data_1min",
    "5min":   "stock_data_5min",
    "15min":  "stock_data_15min",
    "25min":  "stock_data_25min",
    "75min":  "stock_data_75min",
    "125min": "stock_data_125min",
    "daily":  "stock_data_daily",
    "eod":    "stock_data_daily",
    "weekly": "stock_data_weekly",
    "monthly":"stock_data_monthly",
    # legacy / alias keys
    "1h":     "stock_data_75min",
    "1hour":  "stock_data_75min",
    "30min":  "stock_data_25min",
}

# Upstox interval_value used as fallback lookup in candle_data
TIMEFRAME_INTERVAL: dict[str, tuple[str, str]] = {
    "1min":  ("minutes", "1"),
    "5min":  ("minutes", "5"),
    "15min": ("minutes", "15"),
    "30min": ("minutes", "30"),
    "1h":    ("hours", "1"),
    "1hour": ("hours", "1"),
    "eod":   ("days", "1"),
}

VOLUME_AVG_PERIODS = 20       # candles used to compute average volume
VOLUME_MULTIPLIER  = 2.0      # breakout candle must have >= this × avg volume
MARKET_OPEN        = "09:15"  # IST market open (string HH:MM)


# ── Data fetching ─────────────────────────────────────────────────────────────

def _normalise_timeframe(tf: str) -> str:
    return tf.strip().lower().replace(" ", "")


def fetch_orb_data(
    symbol: str,
    timeframe: str,
    from_date: str | None = None,
    to_date: str | None = None,
) -> pd.DataFrame:
    """Return OHLCV DataFrame for *symbol* from the appropriate MySQL table.

    Tries ``stock_data_<timeframe>`` first; falls back to ``candle_data``.
    Raises ``ValueError`` if no data is found.
    """
    tf = _normalise_timeframe(timeframe)
    table = TIMEFRAME_TABLE.get(tf)

    # date filter for stock_data_* tables (column: candle_time)
    stock_date_filter = ""
    stock_args: list[Any] = [symbol.upper()]
    if from_date:
        stock_date_filter += " AND candle_time >= %s"
        stock_args.append(from_date)
    if to_date:
        stock_date_filter += " AND candle_time <= %s"
        stock_args.append(f"{to_date} 23:59:59")

    # Attempt timeframe-specific table (stock_data_<tf> uses stock_code + candle_time columns)
    if table:
        try:
            rows = db_query(
                f"SELECT candle_time as time, open, high, low, close, volume FROM `{table}` "
                f"WHERE stock_code=%s{stock_date_filter} ORDER BY candle_time ASC",
                stock_args,
            )
            if rows:
                return _to_df(rows)
        except Exception as e:
            logger.warning("ORB: table %s not found or error (%s), trying candle_data", table, e)

    # Fallback: candle_data table (shared, used by Upstox import)
    iv_type, iv_val = TIMEFRAME_INTERVAL.get(tf, ("minutes", "5"))
    fallback_args: list[Any] = [symbol.upper(), iv_type, iv_val]

    fb_date = ""
    if from_date:
        fb_date += " AND time >= %s"
        fallback_args.append(from_date)
    if to_date:
        fb_date += " AND time <= %s"
        fallback_args.append(f"{to_date} 23:59:59")

    rows = db_query(
        f"SELECT time, open, high, low, close, volume FROM candle_data "
        f"WHERE symbol=%s AND interval_type=%s AND interval_value=%s{fb_date} "
        f"ORDER BY time ASC",
        fallback_args,
    )
    if not rows:
        raise ValueError(
            f"No data for symbol '{symbol}' timeframe '{timeframe}'. "
            "Import data first via POST /api/v1/upstox/historical-data-import."
        )
    return _to_df(rows)


def _to_df(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    df["time"] = pd.to_datetime(df["time"])
    df = df.sort_values("time").reset_index(drop=True)
    for col in ("open", "high", "low", "close"):
        df[col] = df[col].astype(float)
    df["volume"] = df["volume"].astype(float)
    return df


# ── ORB signal logic ──────────────────────────────────────────────────────────

@dataclass
class ORBSignal:
    """A single-day ORB setup."""
    date: str
    symbol: str
    timeframe: str
    or_high: float
    or_low: float
    breakout_candle_time: str = ""
    breakout_type: str = ""       # "long" | "short" | ""
    entry_price: float = 0.0
    stop_loss: float = 0.0
    target: float = 0.0
    risk: float = 0.0
    volume_ok: bool = False
    triggered: bool = False


@dataclass
class ORBTrade:
    date: str
    symbol: str
    side: str             # BUY | SELL
    entry_time: str
    entry_price: float
    stop_loss: float
    target: float
    risk: float
    exit_time: str = ""
    exit_price: float = 0.0
    pnl: float = 0.0
    exit_reason: str = ""
    trailing_active: bool = False


@dataclass
class ORBBacktestResult:
    symbol: str
    timeframe: str
    from_date: str
    to_date: str
    trades: list[ORBTrade] = field(default_factory=list)
    signals: list[ORBSignal] = field(default_factory=list)
    total_pnl: float = 0.0
    max_drawdown: float = 0.0

    @property
    def total_trades(self) -> int:
        return len(self.trades)

    @property
    def wins(self) -> int:
        return sum(1 for t in self.trades if t.pnl > 0)

    @property
    def losses(self) -> int:
        return sum(1 for t in self.trades if t.pnl <= 0)

    @property
    def win_rate(self) -> float:
        return round(self.wins / self.total_trades, 4) if self.trades else 0.0


def _hhmm(ts: pd.Timestamp) -> str:
    return ts.strftime("%H:%M")


def _compute_avg_volume(series: pd.Series, idx: int) -> float:
    """Rolling average of prior VOLUME_AVG_PERIODS candles before *idx*."""
    start = max(0, idx - VOLUME_AVG_PERIODS)
    window = series.iloc[start:idx]
    return float(window.mean()) if len(window) > 0 else 0.0


def detect_orb_signals(df: pd.DataFrame, symbol: str, timeframe: str) -> list[ORBSignal]:
    """Scan all trading days in *df* and build ORBSignal objects.

    The Opening Range is the FIRST candle of each day at or after MARKET_OPEN.
    """
    signals: list[ORBSignal] = []
    df = df.copy()
    df["date"] = df["time"].dt.date

    for date, day_df in df.groupby("date"):
        day_df = day_df.sort_values("time").reset_index(drop=True)

        # First candle = the opening range
        open_candles = day_df[day_df["time"].dt.strftime("%H:%M") >= MARKET_OPEN]
        if open_candles.empty:
            continue

        or_candle = open_candles.iloc[0]
        or_high = float(or_candle["high"])
        or_low  = float(or_candle["low"])

        sig = ORBSignal(
            date=str(date),
            symbol=symbol,
            timeframe=timeframe,
            or_high=or_high,
            or_low=or_low,
        )

        # Look for breakout in subsequent candles of the same day
        subsequent = open_candles.iloc[1:]
        for idx, row in subsequent.iterrows():
            global_idx = df.index.get_loc(idx) if idx in df.index else int(idx)
            avg_vol = _compute_avg_volume(df["volume"], global_idx)
            vol_ok = avg_vol > 0 and float(row["volume"]) >= VOLUME_MULTIPLIER * avg_vol
            sig.volume_ok = vol_ok

            # Breakout conditions
            if float(row["close"]) > or_high and vol_ok:
                sig.triggered = True
                sig.breakout_type = "long"
                sig.breakout_candle_time = str(row["time"])
                sig.entry_price = float(row["close"])   # entry at close of breakout candle
                sig.stop_loss = float(row["low"])
                sig.risk = sig.entry_price - sig.stop_loss
                sig.target = sig.entry_price + sig.risk  # 1:1 R:R
                break
            elif float(row["close"]) < or_low and vol_ok:
                sig.triggered = True
                sig.breakout_type = "short"
                sig.breakout_candle_time = str(row["time"])
                sig.entry_price = float(row["close"])
                sig.stop_loss = float(row["high"])
                sig.risk = sig.stop_loss - sig.entry_price
                sig.target = sig.entry_price - sig.risk  # 1:1 R:R
                break

        signals.append(sig)

    return signals


# ── Backtesting ───────────────────────────────────────────────────────────────

def run_orb_backtest(
    symbol: str,
    timeframe: str,
    from_date: str,
    to_date: str,
    qty: int = 1,
    df: pd.DataFrame | None = None,
) -> ORBBacktestResult:
    """Run a full ORB backtest over the given date range.

    *df* can be supplied directly (useful for unit tests / API endpoints that
    pass their own candle data). Otherwise data is fetched from DB.
    """
    if df is None:
        df = fetch_orb_data(symbol, timeframe, from_date, to_date)

    result = ORBBacktestResult(
        symbol=symbol, timeframe=timeframe, from_date=from_date, to_date=to_date
    )
    signals = detect_orb_signals(df, symbol, timeframe)
    result.signals = signals

    df = df.copy()
    df["date"] = df["time"].dt.date
    equity = 0.0
    peak = 0.0

    for sig in signals:
        if not sig.triggered:
            continue

        side       = "BUY" if sig.breakout_type == "long" else "SELL"
        entry      = sig.entry_price
        sl         = sig.stop_loss
        tp         = sig.target
        risk       = sig.risk
        trail_sl   = sl          # trailing stop starts at original SL
        trailing   = False
        entry_time = sig.breakout_candle_time

        trade = ORBTrade(
            date=sig.date,
            symbol=symbol,
            side=side,
            entry_time=entry_time,
            entry_price=entry,
            stop_loss=sl,
            target=tp,
            risk=risk,
        )

        # Simulate candle-by-candle from entry point until EOD
        day_df = df[df["date"] == pd.Timestamp(sig.date).date()].sort_values("time")
        past_entry = False
        exit_reason = "eod"
        exit_price  = 0.0
        exit_time   = ""

        for _, row in day_df.iterrows():
            if str(row["time"]) <= entry_time:
                continue
            past_entry = True
            price = float(row["close"])

            if side == "BUY":
                # Trailing: once TP hit, activate trailing at 1× risk behind current high
                if price >= tp and not trailing:
                    trailing = True
                    trail_sl = price - risk  # trail 1× risk below current price
                if trailing:
                    new_trail = price - risk
                    trail_sl = max(trail_sl, new_trail)
                    if price <= trail_sl:
                        exit_reason = "trailing_stop"
                        exit_price  = price
                        exit_time   = str(row["time"])
                        break
                else:
                    if price <= sl:
                        exit_reason = "stop_loss"
                        exit_price  = price
                        exit_time   = str(row["time"])
                        break
                    if price >= tp:
                        exit_reason = "target"
                        exit_price  = price
                        exit_time   = str(row["time"])
                        break
            else:  # SELL
                if price <= tp and not trailing:
                    trailing = True
                    trail_sl = price + risk
                if trailing:
                    new_trail = price + risk
                    trail_sl = min(trail_sl, new_trail)
                    if price >= trail_sl:
                        exit_reason = "trailing_stop"
                        exit_price  = price
                        exit_time   = str(row["time"])
                        break
                else:
                    if price >= sl:
                        exit_reason = "stop_loss"
                        exit_price  = price
                        exit_time   = str(row["time"])
                        break
                    if price <= tp:
                        exit_reason = "target"
                        exit_price  = price
                        exit_time   = str(row["time"])
                        break

        if not past_entry or not exit_time:
            # Exit at last candle of day
            last = day_df.iloc[-1]
            exit_price = float(last["close"])
            exit_time  = str(last["time"])
            exit_reason = "eod"

        pnl = (exit_price - entry) * qty if side == "BUY" else (entry - exit_price) * qty

        trade.exit_time    = exit_time
        trade.exit_price   = exit_price
        trade.pnl          = round(pnl, 2)
        trade.exit_reason  = exit_reason
        trade.trailing_active = trailing

        result.trades.append(trade)
        result.total_pnl = round(result.total_pnl + pnl, 2)
        equity += pnl
        peak = max(peak, equity)
        dd   = peak - equity
        if dd > result.max_drawdown:
            result.max_drawdown = round(dd, 2)

    return result


# ── Live signal (today) ───────────────────────────────────────────────────────

def get_live_orb_signals(symbols: list[str], timeframe: str) -> list[dict]:
    """Return current-day ORB signals for a list of symbols.

    Fetches today's candles from DB (if available) and runs the ORB detector.
    Returns a list of signal dicts ready for JSON serialisation.
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    results: list[dict] = []

    for symbol in symbols:
        try:
            df = fetch_orb_data(symbol, timeframe, from_date=today, to_date=today)
            sigs = detect_orb_signals(df, symbol, timeframe)
            today_sig = sigs[-1] if sigs else None
            if today_sig:
                results.append({
                    "symbol": symbol,
                    "date": today_sig.date,
                    "timeframe": timeframe,
                    "or_high": today_sig.or_high,
                    "or_low": today_sig.or_low,
                    "triggered": today_sig.triggered,
                    "breakout_type": today_sig.breakout_type,
                    "entry_price": today_sig.entry_price,
                    "stop_loss": today_sig.stop_loss,
                    "target": today_sig.target,
                    "risk": today_sig.risk,
                    "volume_ok": today_sig.volume_ok,
                    "breakout_candle_time": today_sig.breakout_candle_time,
                })
            else:
                results.append({
                    "symbol": symbol,
                    "date": today,
                    "timeframe": timeframe,
                    "triggered": False,
                    "breakout_type": "",
                    "message": "No ORB signal yet today",
                })
        except ValueError as e:
            results.append({"symbol": symbol, "error": str(e)})
        except Exception as e:
            logger.error("ORB live signal error for %s: %s", symbol, e)
            results.append({"symbol": symbol, "error": "Internal error fetching signal"})

    return results
