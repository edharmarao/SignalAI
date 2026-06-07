"""Upstox market data endpoints.

GET  /upstox/historical-candle           — OHLCV by ISIN
GET  /upstox/historical-candle-by-symbol — OHLCV by stock symbol (resolves ISIN from NIFTY500_ISIN map)
POST /upstox/historical-data-import      — bulk historical import → candle_data table
POST /upstox/intraday-data-import        — today's intraday import → candle_data table

All endpoints require an active Upstox broker connection (POST /api/v1/broker/upstox/connect).
Missing broker → HTTP 403. Upstox API error → HTTP 502.

Symbols must be in NIFTY500_ISIN (charts.py). Candle data is stored globally (not user-scoped)
since market OHLCV data is shared. The candle_data table must exist in Supabase
(see supabase/schema.sql).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Body, Depends, HTTPException, Query

from ..deps import get_current_user
from ..models import (
    BulkHistoricalImportRequest,
    CandleData,
    HistoricalCandleResponse,
    IntradayImportRequest,
)
from ..services.upstox import UpstoxClient
from ..db import db_one, db_upsert
from .charts import NIFTY500_ISIN

router = APIRouter(prefix="/upstox", tags=["upstox"])
logger = logging.getLogger("signal_ai")

_INTRADAY_INTERVAL_TYPES = frozenset({"minutes", "hours"})


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _active_upstox_token(user_id: str) -> str | None:
    """Return the most recently updated active Upstox token for this user."""
    row = db_one(
        "SELECT access_token FROM broker_accounts "
        "WHERE user_id=%s AND broker='upstox' AND is_active=1 "
        "ORDER BY updated_at DESC LIMIT 1",
        (user_id,),
    )
    return row["access_token"] if row else None


def _require_token(user: dict) -> str:
    token = _active_upstox_token(user["id"])
    if not token:
        raise HTTPException(
            403,
            "No active Upstox connection. Connect via POST /api/v1/broker/upstox/connect",
        )
    return token


# ── Date-range splitting ──────────────────────────────────────────────────────

def _split_date_range(
    from_date: str, to_date: str, interval_type: str, interval_value: str
) -> list[tuple[str, str]]:
    """Chunk a date range to stay within Upstox per-request limits.

    Upstox limits:
      minutes (1-15):         1 month per call
      minutes (>15) / hours:  3 months per call
      days / weeks / months:  no limit
    """
    if interval_type in ("days", "weeks", "months"):
        return [(from_date, to_date)]

    start = datetime.strptime(from_date, "%Y-%m-%d")
    end = datetime.strptime(to_date, "%Y-%m-%d")
    val = int(interval_value)

    delta = (
        relativedelta(months=1)
        if interval_type == "minutes" and val <= 15
        else relativedelta(months=3)
    )

    chunks: list[tuple[str, str]] = []
    cur = start
    while cur <= end:
        chunk_end = min(cur + delta - timedelta(days=1), end)
        chunks.append((cur.strftime("%Y-%m-%d"), chunk_end.strftime("%Y-%m-%d")))
        cur = chunk_end + timedelta(days=1)
    return chunks


# ── DB helpers ────────────────────────────────────────────────────────────────

def _upsert_candles(
    candles: list[dict],
    symbol: str,
    exchange: str,
    isin: str,
    interval_type: str,
    interval_value: str,
) -> int:
    """Upsert formatted candle dicts into candle_data table. Returns row count."""
    if not candles:
        return 0
    rows = [
        {
            "symbol": symbol,
            "exchange": exchange,
            "isin": isin,
            "interval_type": interval_type,
            "interval_value": interval_value,
            "time": f"{c['time']}+05:30",
            "open": c["open"],
            "high": c["high"],
            "low": c["low"],
            "close": c["close"],
            "volume": c["volume"],
            "oi": c["oi"],
        }
        for c in candles
    ]
    return db_upsert(
        "candle_data",
        rows,
        unique_cols=["symbol", "exchange", "interval_type", "interval_value", "time"],
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/historical-candle", response_model=HistoricalCandleResponse)
async def get_historical_candle(
    exchange: str = Query(..., description="NSE_EQ | BSE_EQ | NSE_FO | BSE_FO | MCX_FO"),
    isin: str = Query(..., description="Instrument ISIN e.g. INE848E01016"),
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
    interval_type: str = Query(..., description="minutes | hours | days | weeks | months"),
    interval_value: str = Query(..., description="e.g. 1, 5, 15, 30"),
    user: dict = Depends(get_current_user),
) -> HistoricalCandleResponse:
    """Fetch historical OHLCV candles by exchange + ISIN."""
    if not UpstoxClient.validate_symbol(exchange, isin):
        raise HTTPException(400, f"Invalid exchange '{exchange}' or ISIN '{isin}'")
    if not UpstoxClient.validate_interval(interval_type, interval_value):
        raise HTTPException(400, f"Invalid interval {interval_type}/{interval_value}")
    token = _require_token(user)
    try:
        candles = await UpstoxClient(token).historical_candles_v3(
            exchange, isin, interval_type, interval_value, from_date, to_date
        )
    except Exception as e:
        logger.error("Upstox historical fetch failed: %s", e)
        raise HTTPException(502, f"Upstox API error: {e}")
    return HistoricalCandleResponse(
        status="success", candles=[CandleData(**c) for c in candles]
    )


@router.get("/historical-candle-by-symbol", response_model=HistoricalCandleResponse)
async def get_historical_candle_by_symbol(
    symbol: str = Query(..., description="Stock symbol e.g. RELIANCE"),
    exchange: str = Query("NSE_EQ", description="NSE_EQ | BSE_EQ | NSE_FO | BSE_FO | MCX_FO"),
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
    interval_type: str = Query(..., description="minutes | hours | days | weeks | months"),
    interval_value: str = Query(..., description="e.g. 1, 5, 15, 30"),
    user: dict = Depends(get_current_user),
) -> HistoricalCandleResponse:
    """Fetch historical OHLCV candles by stock symbol (resolves ISIN internally)."""
    isin = NIFTY500_ISIN.get(symbol.upper())
    if not isin:
        raise HTTPException(
            404,
            f"Symbol '{symbol}' not in instrument map. "
            "Use GET /upstox/historical-candle with an explicit ISIN, "
            "or check /equity/stocks for supported symbols.",
        )
    if not UpstoxClient.validate_interval(interval_type, interval_value):
        raise HTTPException(400, f"Invalid interval {interval_type}/{interval_value}")
    token = _require_token(user)
    try:
        candles = await UpstoxClient(token).historical_candles_v3(
            exchange, isin, interval_type, interval_value, from_date, to_date
        )
    except Exception as e:
        logger.error("Upstox historical-by-symbol fetch failed for %s: %s", symbol, e)
        raise HTTPException(502, f"Upstox API error: {e}")
    return HistoricalCandleResponse(
        status="success", candles=[CandleData(**c) for c in candles]
    )


@router.post("/historical-data-import")
async def historical_data_import(
    request: BulkHistoricalImportRequest = Body(...),
    user: dict = Depends(get_current_user),
) -> dict:
    """Bulk-import historical OHLCV data for multiple symbols into the candle_data table.

    Date ranges are automatically split to respect Upstox per-request limits:
    - minutes (1-15): 1-month chunks
    - minutes (>15) / hours: 3-month chunks
    - days / weeks / months: no splitting

    Requires candle_data table in Supabase (see supabase/schema.sql).
    """
    if not UpstoxClient.validate_interval(request.interval_type, request.interval_value):
        raise HTTPException(
            400, f"Invalid interval {request.interval_type}/{request.interval_value}"
        )

    token = _require_token(user)
    client = UpstoxClient(token)
    results: list[dict] = []
    total_records = 0

    for code in request.stock_codes:
        sym = code.upper()
        isin = NIFTY500_ISIN.get(sym)
        if not isin:
            results.append({"symbol": sym, "status": "failed", "error": "ISIN not found in instrument map", "records": 0})
            continue
        try:
            chunks = _split_date_range(
                request.from_date, request.to_date, request.interval_type, request.interval_value
            )
            symbol_records = 0
            for chunk_from, chunk_to in chunks:
                candles = await client.historical_candles_v3(
                    request.exchange, isin,
                    request.interval_type, request.interval_value,
                    chunk_from, chunk_to,
                )
                symbol_records += _upsert_candles(
                    candles, sym, request.exchange, isin,
                    request.interval_type, request.interval_value,
                )
            total_records += symbol_records
            results.append({"symbol": sym, "status": "success", "records": symbol_records})
            logger.info("Imported %d candles for %s", symbol_records, sym)
        except Exception as e:
            logger.error("Import failed for %s: %s", sym, e)
            results.append({"symbol": sym, "status": "failed", "error": str(e), "records": 0})

    successful = sum(1 for r in results if r["status"] == "success")
    return {
        "status": "success",
        "total_symbols": len(request.stock_codes),
        "successful_imports": successful,
        "failed_imports": len(request.stock_codes) - successful,
        "total_records_imported": total_records,
        "details": results,
    }


@router.post("/intraday-data-import")
async def intraday_data_import(
    request: IntradayImportRequest = Body(...),
    user: dict = Depends(get_current_user),
) -> dict:
    """Import today's intraday OHLCV data for multiple symbols into the candle_data table.

    Only minute and hour intervals are supported (intraday endpoint constraint).
    Requires candle_data table in Supabase (see supabase/schema.sql).
    """
    if request.interval_type not in _INTRADAY_INTERVAL_TYPES:
        raise HTTPException(
            400,
            f"Intraday endpoint only supports interval_type in {sorted(_INTRADAY_INTERVAL_TYPES)}",
        )
    if not UpstoxClient.validate_interval(request.interval_type, request.interval_value):
        raise HTTPException(
            400, f"Invalid interval {request.interval_type}/{request.interval_value}"
        )

    token = _require_token(user)
    client = UpstoxClient(token)
    results: list[dict] = []
    total_records = 0

    for code in request.stock_codes:
        sym = code.upper()
        isin = NIFTY500_ISIN.get(sym)
        if not isin:
            results.append({"symbol": sym, "status": "failed", "error": "ISIN not found in instrument map", "records": 0})
            continue
        try:
            candles = await client.intraday_candles_v3(
                request.exchange, isin, request.interval_type, request.interval_value
            )
            n = _upsert_candles(
                candles, sym, request.exchange, isin,
                request.interval_type, request.interval_value,
            )
            total_records += n
            results.append({"symbol": sym, "status": "success", "records": n})
            logger.info("Intraday import: %d candles for %s", n, sym)
        except Exception as e:
            logger.error("Intraday import failed for %s: %s", sym, e)
            results.append({"symbol": sym, "status": "failed", "error": str(e), "records": 0})

    successful = sum(1 for r in results if r["status"] == "success")
    return {
        "status": "success",
        "total_symbols": len(request.stock_codes),
        "successful_imports": successful,
        "failed_imports": len(request.stock_codes) - successful,
        "total_records_imported": total_records,
        "details": results,
    }
