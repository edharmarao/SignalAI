"""ORB (Opening Range Breakout) strategy endpoints.

POST /orb/backtest         — Run ORB backtest over a date range
GET  /orb/signal           — Fetch today's live ORB signals for a list of symbols
POST /orb/live             — Scan signals and optionally place live/paper orders
GET  /orb/chart-data       — Fetch OHLCV from stock_data_<timeframe> for charting
GET  /orb/stocks           — List distinct stock codes available in a timeframe table

Strategy rules:
  • Opening Range  = first candle at or after 09:15 IST
  • Volume filter  = breakout candle volume ≥ 2× 20-candle rolling average
  • Entry (LONG)   = close > OR-high  →  enter at close
  • Entry (SHORT)  = close < OR-low   →  enter at close
  • Stop-loss      = low of breakout candle (LONG) / high (SHORT)
  • Target         = 1:1 risk-reward (entry ± risk)
  • Trailing SL    = activates once target hit; trails 1× risk behind price
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query

from ..config import get_settings
from ..db import db_insert, new_id
from ..deps import get_current_user
from ..models import ORBBacktestRequest, ORBLiveRequest, ORBSignalResponse
from ..services.orb import (
    fetch_orb_data,
    get_live_orb_signals,
    run_orb_backtest,
    TIMEFRAME_TABLE,
)
from ..db import db_query, db_insert, new_id
from ..services.redis_client import get_upstox_token
from ..services.upstox import UpstoxClient

router = APIRouter(prefix="/orb", tags=["orb"])
logger = logging.getLogger("signal_ai")


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


# ── Backtest ──────────────────────────────────────────────────────────────────

@router.post("/backtest")
def orb_backtest(req: ORBBacktestRequest, user=Depends(get_current_user)):
    """Run the ORB strategy backtest.

    Supply ``candles`` in the request body to use custom OHLCV data instead of
    fetching from the database.
    """
    try:
        if req.candles:
            df = pd.DataFrame(req.candles)
            df["time"] = pd.to_datetime(df["time"])
            for col in ("open", "high", "low", "close"):
                df[col] = df[col].astype(float)
            df["volume"] = df["volume"].astype(float)
            df = df.sort_values("time").reset_index(drop=True)
        else:
            df = None

        result = run_orb_backtest(
            symbol=req.symbol.upper(),
            timeframe=req.timeframe,
            from_date=req.from_date,
            to_date=req.to_date,
            qty=req.qty,
            df=df,
            or_candles=req.or_candles,
            market_open=req.market_open,
            volume_multiplier=req.volume_multiplier,
            volume_lookback=req.volume_lookback,
            direction=req.direction,
            risk_reward=req.risk_reward,
            trailing_sl=req.trailing_sl,
            trail_factor=req.trail_factor,
            eod_exit=req.eod_exit,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        logger.exception("ORB backtest error for %s", req.symbol)
        raise HTTPException(500, f"Backtest error: {e}")

    return {
        "symbol": result.symbol,
        "timeframe": result.timeframe,
        "from_date": result.from_date,
        "to_date": result.to_date,
        "totalTrades": result.total_trades,
        "wins": result.wins,
        "losses": result.losses,
        "winRate": result.win_rate,
        "totalPnl": result.total_pnl,
        "maxDrawdown": result.max_drawdown,
        "trades": [
            {
                "date": t.date,
                "side": t.side,
                "entryTime": t.entry_time,
                "entryPrice": t.entry_price,
                "stopLoss": t.stop_loss,
                "target": t.target,
                "risk": t.risk,
                "exitTime": t.exit_time,
                "exitPrice": t.exit_price,
                "pnl": t.pnl,
                "exitReason": t.exit_reason,
                "trailingActive": t.trailing_active,
            }
            for t in result.trades
        ],
        "signals": [
            {
                "date": s.date,
                "orHigh": s.or_high,
                "orLow": s.or_low,
                "triggered": s.triggered,
                "breakoutType": s.breakout_type,
                "entryPrice": s.entry_price,
                "stopLoss": s.stop_loss,
                "target": s.target,
                "risk": s.risk,
                "volumeOk": s.volume_ok,
                "breakoutCandleTime": s.breakout_candle_time,
            }
            for s in result.signals
        ],
    }


# ── Live signals ──────────────────────────────────────────────────────────────

@router.get("/signal")
def orb_signal(
    symbols: str = Query(..., description="Comma-separated symbol list e.g. RELIANCE,TCS"),
    timeframe: str = Query("5min", description="1min|5min|15min|30min|1h|eod"),
    user=Depends(get_current_user),
):
    """Return today's ORB signals for the requested symbols.

    Data is read from the DB (``stock_data_<timeframe>`` or ``candle_data``).
    Make sure today's intraday data has been imported before calling this.
    """
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        raise HTTPException(400, "Provide at least one symbol.")

    return get_live_orb_signals(symbol_list, timeframe)


# ── Live / paper order placement ──────────────────────────────────────────────

@router.post("/live")
async def orb_live(req: ORBLiveRequest, user=Depends(get_current_user)):
    """Scan current ORB signals and place paper or live orders.

    Live trading requires:
      - ALLOW_LIVE_TRADING=true in .env
      - ``confirm_live: true`` in the request body
      - An active Upstox broker connection (POST /api/v1/broker/upstox/connect)
    """
    settings = get_settings()

    if req.mode == "live":
        if not settings.allow_live_trading:
            raise HTTPException(403, "Live trading is disabled (ALLOW_LIVE_TRADING=false).")
        if not req.confirm_live:
            raise HTTPException(400, "Set confirm_live=true to confirm live order placement.")
        token = get_upstox_token()
        if not token:
            raise HTTPException(
                403,
                "No active Upstox connection. Connect via POST /api/v1/broker/upstox/connect",
            )

    symbols = [s.strip().upper() for s in req.symbols]
    signals = get_live_orb_signals(symbols, req.timeframe)

    placed_orders: list[dict] = []

    for sig in signals:
        if sig.get("error") or not sig.get("triggered"):
            continue

        side = "BUY" if sig["breakout_type"] == "long" else "SELL"
        symbol = sig["symbol"]
        entry_price = float(sig["entry_price"])

        order_row = {
            "id": new_id(),
            "user_id": user["id"],
            "strategy_id": "orb",
            "trade_id": None,
            "symbol": symbol,
            "side": side,
            "quantity": req.qty,
            "price": entry_price,
            "order_type": "MARKET",
            "mode": req.mode,
            "status": "filled",
            "broker_order_id": None,
            "created_at": _now(),
        }

        if req.mode == "live":
            try:
                client = UpstoxClient(token)  # type: ignore[arg-type]
                broker_resp = await client.place_order(
                    {
                        "quantity": req.qty,
                        "product": "I",
                        "validity": "DAY",
                        "price": 0,
                        "tag": "signalai_orb",
                        "instrument_token": symbol,
                        "order_type": "MARKET",
                        "transaction_type": side,
                        "disclosed_quantity": 0,
                        "trigger_price": 0,
                        "is_amo": False,
                    }
                )
                order_row["broker_order_id"] = (broker_resp.get("data") or {}).get("order_id")
                order_row["status"] = "pending"
            except Exception as e:
                logger.error("ORB live order failed for %s: %s", symbol, e)
                placed_orders.append({"symbol": symbol, "status": "failed", "error": str(e)})
                continue

        db_insert("orders", order_row)
        placed_orders.append({
            "symbol": symbol,
            "side": side,
            "entryPrice": entry_price,
            "stopLoss": sig["stop_loss"],
            "target": sig["target"],
            "risk": sig["risk"],
            "orderId": order_row["id"],
            "brokerOrderId": order_row["broker_order_id"],
            "mode": req.mode,
            "status": order_row["status"],
        })

    return {
        "scanned": len(signals),
        "triggered": len([s for s in signals if s.get("triggered")]),
        "ordersPlaced": len(placed_orders),
        "mode": req.mode,
        "orders": placed_orders,
        "allSignals": signals,
    }


# ── Chart data from stock_data_<timeframe> ────────────────────────────────────

@router.get("/chart-data")
def orb_chart_data(
    symbol: str = Query(..., description="Stock code e.g. RELIANCE"),
    timeframe: str = Query("5min", description="1min|5min|15min|25min|daily|weekly"),
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
    limit: int = Query(5000, ge=1, le=10000),
    user=Depends(get_current_user),
):
    """Fetch OHLCV candles directly from stock_data_<timeframe> for charting.

    Returns candles sorted ascending by time, capped at *limit*.
    """
    tf = symbol  # avoid shadowing — reuse local
    tf = timeframe.strip().lower()
    table = TIMEFRAME_TABLE.get(tf)
    if not table:
        raise HTTPException(400, f"Unknown timeframe '{timeframe}'. Supported: {list(TIMEFRAME_TABLE.keys())}")

    try:
        rows = db_query(
            f"SELECT candle_time as time, open, high, low, close, volume "
            f"FROM `{table}` "
            f"WHERE stock_code=%s AND candle_time >= %s AND candle_time <= %s "
            f"ORDER BY candle_time ASC LIMIT %s",
            (symbol.upper(), f"{from_date} 00:00:00", f"{to_date} 23:59:59", limit),
        )
    except Exception as e:
        logger.error("ORB chart-data error for %s/%s: %s", symbol, timeframe, e)
        raise HTTPException(500, f"DB error: {e}")

    candles = [
        {
            "time": str(r["time"]),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "volume": int(r["volume"]),
        }
        for r in rows
    ]
    return {"symbol": symbol.upper(), "timeframe": timeframe, "candles": candles}


@router.get("/stocks")
def orb_stocks(
    timeframe: str = Query("5min", description="Timeframe to query"),
    q: str = Query("", description="Optional search filter"),
    user=Depends(get_current_user),
):
    """List distinct stock codes available in a stock_data_<timeframe> table."""
    tf = timeframe.strip().lower()
    table = TIMEFRAME_TABLE.get(tf)
    if not table:
        raise HTTPException(400, f"Unknown timeframe '{timeframe}'")

    try:
        filter_sql = " WHERE stock_code LIKE %s" if q else ""
        args = (f"%{q.upper()}%",) if q else ()
        rows = db_query(
            f"SELECT DISTINCT stock_code FROM `{table}`{filter_sql} ORDER BY stock_code LIMIT 200",
            args,
        )
    except Exception as e:
        raise HTTPException(500, f"DB error: {e}")

    return [r["stock_code"] for r in rows]


@router.get("/nse-symbols")
def orb_nse_symbols(
    q: str = Query("", description="Search by symbol or company name"),
    user=Depends(get_current_user),
):
    """Return all NSE EQ symbols from nse_eq_symbols table.

    Each item has: symbol, company_name, industry.
    Optional ``q`` filters by symbol prefix or company name (case-insensitive).
    """
    try:
        if q:
            q_upper = f"%{q.upper()}%"
            q_any   = f"%{q}%"
            rows = db_query(
                "SELECT symbol, company_name, industry FROM `nse_eq_symbols` "
                "WHERE symbol LIKE %s OR company_name LIKE %s "
                "ORDER BY symbol LIMIT 100",
                (q_upper, q_any),
            )
        else:
            rows = db_query(
                "SELECT symbol, company_name, industry FROM `nse_eq_symbols` "
                "ORDER BY symbol",
                (),
            )
    except Exception as e:
        raise HTTPException(500, f"DB error: {e}")

    return [
        {
            "symbol":       r["symbol"],
            "company_name": r["company_name"] or "",
            "industry":     r["industry"] or "",
        }
        for r in rows
    ]


