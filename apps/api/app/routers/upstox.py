"""Upstox market data endpoints.

GET  /upstox/historical-candle           — OHLCV by ISIN
GET  /upstox/historical-candle-by-symbol — OHLCV by stock symbol (resolves ISIN from NIFTY500_ISIN map)
POST /upstox/historical-data-import      — bulk historical import → candle_data table
POST /upstox/intraday-data-import        — today's intraday import → candle_data table
GET  /upstox/intraday-candle             — today's intraday candles for a single symbol (no DB write)
POST /upstox/intraday-candles/multi      — today's intraday candles for multiple symbols (no DB write)

Upstox v3 historical/intraday endpoints are public — no real access token required.
If a token is stored in Redis (via POST /api/v1/broker/upstox/connect) it will be used;
otherwise requests fall back to a placeholder Bearer token which Upstox still accepts.
Upstox API error → HTTP 502.

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
    IntradayCandleRequest,
    IntradayCandleResponse,
    IntradayImportRequest,
    SymbolIntradayResult,
)
from ..services.upstox import UpstoxClient
from ..services.redis_client import get_upstox_token
from ..services.instrument_map import get_instrument_map, refresh_instrument_map
from ..utils.database_util import DatabaseUtil
from .charts import NIFTY500_ISIN

router = APIRouter(prefix="/upstox", tags=["upstox"])
logger = logging.getLogger("signal_ai")

_INTRADAY_INTERVAL_TYPES = frozenset({"minutes", "hours", "days"})


# ── Auth helpers ──────────────────────────────────────────────────────────────

_UPSTOX_TOKEN_PLACEHOLDER = "{your_access_token}"


def _get_upstox_token(user_id: str) -> str:
    """Return the active Upstox token from Redis, or a placeholder.

    Upstox v3 historical/intraday endpoints are public and accept any Bearer value,
    so we never block the request when no real token is stored.
    """
    return get_upstox_token() or _UPSTOX_TOKEN_PLACEHOLDER


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
    table_name: str = "stock_data_5min",
) -> int:
    """Bulk-insert candles into the specified table using DatabaseUtil.

    stock_data_* schema: (stock_code, candle_time, open, high, low, close, volume)
    candle_data schema:  (symbol, exchange, isin, interval_type, interval_value, time, open, high, low, close, volume, oi)
    """
    if not candles:
        return 0

    with DatabaseUtil() as db:
        if table_name == "candle_data":
            sql = """
                INSERT INTO candle_data
                    (symbol, exchange, isin, interval_type, interval_value, time, open, high, low, close, volume, oi)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    open=VALUES(open), high=VALUES(high), low=VALUES(low),
                    close=VALUES(close), volume=VALUES(volume), oi=VALUES(oi)
            """
            params = [
                (
                    symbol, exchange, isin, interval_type, interval_value,
                    f"{c['time']}+05:30",
                    c["open"], c["high"], c["low"], c["close"],
                    c["volume"], c.get("oi", 0),
                )
                for c in candles
            ]
        else:
            # stock_data_5min / stock_data_15min / stock_data_daily etc.
            sql = """
                INSERT IGNORE INTO `{table}` (stock_code, candle_time, open, high, low, close, volume)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """.format(table=table_name)
            params = [
                (symbol, c["time"], c["open"], c["high"], c["low"], c["close"], c["volume"])
                for c in candles
            ]

        return db.execute_many(sql, params)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/historical-candle", response_model=HistoricalCandleResponse)
def get_historical_candle(
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
    token = _get_upstox_token(user["id"])
    try:
        candles = UpstoxClient(token).historical_candles_v3(
            exchange, isin, interval_type, interval_value, from_date, to_date
        )
    except Exception as e:
        logger.error("Upstox historical fetch failed: %s", e)
        raise HTTPException(502, f"Upstox API error: {e}")
    return HistoricalCandleResponse(
        status="success", candles=[CandleData(**c) for c in candles]
    )


@router.get("/historical-candle-by-symbol", response_model=HistoricalCandleResponse)
def get_historical_candle_by_symbol(
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
    token = _get_upstox_token(user["id"])
    try:
        candles = UpstoxClient(token).historical_candles_v3(
            exchange, isin, interval_type, interval_value, from_date, to_date
        )
    except Exception as e:
        logger.error("Upstox historical-by-symbol fetch failed for %s: %s", symbol, e)
        raise HTTPException(502, f"Upstox API error: {e}")
    return HistoricalCandleResponse(
        status="success", candles=[CandleData(**c) for c in candles]
    )


@router.post("/historical-data-import")
def historical_data_import(
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

    token = _get_upstox_token(user["id"])
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
                candles = client.historical_candles_v3(
                    request.exchange, isin,
                    request.interval_type, request.interval_value,
                    chunk_from, chunk_to,
                )
                symbol_records += _upsert_candles(
                    candles, sym, request.exchange, isin,
                    request.interval_type, request.interval_value,
                    table_name=request.table_name,
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
def intraday_data_import(
    request: IntradayImportRequest = Body(...),
    user: dict = Depends(get_current_user),
) -> dict:
    """Import today's intraday OHLCV data for multiple symbols into the candle_data table.

    Supports minutes, hours, and days intervals ('days'/'1' fetches today's EOD candle).
    Requires candle_data table in Supabase (see supabase/schema.sql).
    """
    if request.interval_type not in _INTRADAY_INTERVAL_TYPES:
        raise HTTPException(
            400,
            f"Intraday endpoint only supports interval_type in {sorted(_INTRADAY_INTERVAL_TYPES)}. "
            "Use 'days'/'1' to fetch today's EOD candle.",
        )
    if not UpstoxClient.validate_interval(request.interval_type, request.interval_value):
        raise HTTPException(
            400, f"Invalid interval {request.interval_type}/{request.interval_value}"
        )

    token = _get_upstox_token(user["id"])
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
            candles = client.intraday_candles_v3(
                request.exchange, isin, request.interval_type, request.interval_value
            )
            n = _upsert_candles(
                candles, sym, request.exchange, isin,
                request.interval_type, request.interval_value,
                table_name=request.table_name,
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


# ── Intraday candle fetch (no DB write) ───────────────────────────────────────

@router.get("/intraday-candle", response_model=HistoricalCandleResponse)
def get_intraday_candle(
    symbol: str = Query(..., description="NSE trading symbol e.g. RELIANCE"),
    exchange: str = Query("NSE_EQ", description="NSE_EQ | BSE_EQ | NSE_FO | BSE_FO | MCX_FO"),
    interval_type: str = Query("minutes", description="minutes | hours | days"),
    interval_value: str = Query("1", description="Candle interval value e.g. 1, 5, 15"),
    user: dict = Depends(get_current_user),
) -> HistoricalCandleResponse:
    """Fetch today's intraday OHLCV candles for a **single** symbol.

    Calls the Upstox v3 intraday endpoint:
      GET /v3/historical-candle/intraday/{instrument_key}/{interval_type}/{interval_value}

    No data is written to the database — results are returned directly.
    Symbol is resolved to an ISIN via the instrument map (NIFTY500_ISIN).
    """
    sym = symbol.upper()

    # Resolve ISIN — try static map first, then live instrument map
    isin = NIFTY500_ISIN.get(sym) or get_instrument_map().get(sym)
    if not isin:
        raise HTTPException(
            404,
            f"Symbol '{sym}' not found in instrument map. "
            "Use GET /upstox/instruments/lookup to verify the symbol, "
            "or POST /upstox/instruments/refresh to reload the map.",
        )

    if interval_type not in _INTRADAY_INTERVAL_TYPES:
        raise HTTPException(
            400,
            f"interval_type must be one of {sorted(_INTRADAY_INTERVAL_TYPES)}",
        )
    if not UpstoxClient.validate_interval(interval_type, interval_value):
        raise HTTPException(400, f"Invalid interval {interval_type}/{interval_value}")

    token = _get_upstox_token(user["id"])
    try:
        candles = UpstoxClient(token).intraday_candles_v3(
            exchange, isin, interval_type, interval_value
        )
    except Exception as e:
        logger.error("Intraday candle fetch failed for %s: %s", sym, e)
        raise HTTPException(502, f"Upstox API error: {e}")

    logger.info("Intraday candle fetch: %d candles for %s (%s/%s)", len(candles), sym, interval_type, interval_value)
    return HistoricalCandleResponse(
        status="success", candles=[CandleData(**c) for c in candles]
    )


@router.post("/intraday-candles/multi", response_model=IntradayCandleResponse)
def get_intraday_candles_multi(
    request: IntradayCandleRequest = Body(...),
    user: dict = Depends(get_current_user),
) -> IntradayCandleResponse:
    """Fetch today's intraday OHLCV candles for **multiple** symbols in one call.

    Calls the Upstox v3 intraday endpoint for each symbol:
      GET /v3/historical-candle/intraday/{instrument_key}/{interval_type}/{interval_value}

    No data is written to the database — all results are returned directly.
    Symbols are resolved to ISINs via the instrument map (NIFTY500_ISIN + live map).
    Failures for individual symbols are captured per-symbol; the overall request
    always returns HTTP 200 with per-symbol status fields.

    **Request body example:**
    ```json
    {
      "symbols": ["RELIANCE", "TCS", "INFY"],
      "exchange": "NSE_EQ",
      "interval_type": "minutes",
      "interval_value": "1"
    }
    ```
    """
    if request.interval_type not in _INTRADAY_INTERVAL_TYPES:
        raise HTTPException(
            400,
            f"interval_type must be one of {sorted(_INTRADAY_INTERVAL_TYPES)}",
        )
    if not UpstoxClient.validate_interval(request.interval_type, request.interval_value):
        raise HTTPException(
            400, f"Invalid interval {request.interval_type}/{request.interval_value}"
        )

    token = _get_upstox_token(user["id"])
    client = UpstoxClient(token)

    # Merge static NIFTY500 map with live instrument map for broadest coverage
    live_map = get_instrument_map()
    results: list[SymbolIntradayResult] = []

    for raw_sym in request.symbols:
        sym = raw_sym.upper()
        isin = NIFTY500_ISIN.get(sym) or live_map.get(sym)

        if not isin:
            logger.warning("Intraday multi: ISIN not found for %s", sym)
            results.append(
                SymbolIntradayResult(
                    symbol=sym,
                    status="failed",
                    error="ISIN not found in instrument map",
                )
            )
            continue

        try:
            candles = client.intraday_candles_v3(
                request.exchange, isin, request.interval_type, request.interval_value
            )
            results.append(
                SymbolIntradayResult(
                    symbol=sym,
                    isin=isin,
                    status="success",
                    candles=[CandleData(**c) for c in candles],
                    candle_count=len(candles),
                )
            )
            logger.info(
                "Intraday multi: %d candles for %s (%s/%s)",
                len(candles), sym, request.interval_type, request.interval_value,
            )
        except Exception as e:
            logger.error("Intraday multi fetch failed for %s: %s", sym, e)
            results.append(
                SymbolIntradayResult(
                    symbol=sym,
                    isin=isin,
                    status="failed",
                    error=str(e),
                )
            )

    successful = sum(1 for r in results if r.status == "success")
    return IntradayCandleResponse(
        status="success",
        exchange=request.exchange,
        interval_type=request.interval_type,
        interval_value=request.interval_value,
        total_symbols=len(request.symbols),
        successful=successful,
        failed=len(request.symbols) - successful,
        results=results,
    )


@router.post("/instruments/refresh", tags=["upstox"])
def refresh_instruments(user: dict = Depends(get_current_user)):
    """Force-refresh the NSE instrument map from Upstox CSV."""
    count = refresh_instrument_map()
    return {"status": "refreshed", "symbols_loaded": count}


@router.get("/instruments/lookup", tags=["upstox"])
def lookup_instrument(symbol: str = Query(..., description="NSE trading symbol e.g. 360ONE"), user: dict = Depends(get_current_user)):
    """Look up ISIN for a given NSE symbol."""
    m = get_instrument_map()
    isin = m.get(symbol.upper())
    if not isin:
        raise HTTPException(404, f"Symbol {symbol!r} not found in instrument map")
    return {"symbol": symbol.upper(), "isin": isin, "total_symbols": len(m)}

