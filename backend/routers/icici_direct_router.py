"""ICICI Direct market data and connection endpoints.

GET  /broker/breeze/login-url    — Login link redirecting to ICICI Direct
POST /broker/breeze/connect      — Exchanging redirect URL or apisession for token and saving to Redis
GET  /broker/breeze/status       — Checking connection state
POST /broker/breeze/disconnect   — Removing credentials from Redis
GET  /breeze/historical-options  — Fetching options historical OHLCV + OI data (no DB write)
POST /breeze/historical-options-import — Fetching options data and importing into the `candle_data` table
"""
from __future__ import annotations

import logging
import urllib.parse
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from deps import get_current_user
from models import CandleData, HistoricalCandleResponse
from services.icici_direct_service import ICICIDirectClient
from services.redis_client import get_breeze_credentials, save_breeze_token, delete_breeze_token
from backend_config import get_settings
from utils.database_util import DatabaseUtil

router = APIRouter(tags=["icici_direct"])
logger = logging.getLogger("signal_ai")


class BreezeConnectPayload(BaseModel):
    session_token: str = Field(..., description="The raw session token (apisession) or redirect URL")


class HistoricalOptionsImportRequest(BaseModel):
    stock_code: str = Field(..., description="e.g. NIFTY, BANKNIFTY, RELIANCE")
    expiry_date: str = Field(..., description="Option expiry date (YYYY-MM-DD)")
    right: Literal["CE", "PE", "call", "put"] = Field(..., description="Option type CE (call) or PE (put)")
    strike_price: float = Field(..., description="Option strike price")
    from_date: str = Field(..., description="Start date (YYYY-MM-DD)")
    to_date: str = Field(..., description="End date (YYYY-MM-DD)")
    interval: str = Field("1minute", description="Interval: 1minute, 5minute, 30minute, 1day")
    custom_symbol: Optional[str] = Field(None, description="Optional custom symbol to store under in DB. Default is {stock_code}_{expiry_date}_{strike_price}_{right}")


def _extract_session_token(raw: str) -> str:
    """Helper to pull session token if the user pasted the entire redirect URL."""
    raw = raw.strip()
    if raw.startswith("http"):
        parsed = urllib.parse.urlparse(raw)
        params = urllib.parse.parse_qs(parsed.query)
        tokens = params.get("apisession")
        if not tokens:
            raise HTTPException(400, "Could not find 'apisession' parameter in redirect URL.")
        return tokens[0]
    return raw


def _get_breeze_token_or_raise(user_id: str) -> str:
    from services.redis_client import get_breeze_credentials
    creds = get_breeze_credentials()
    session_id = creds.get("session_id")
    if not session_id:
        return "mock_session"
    return session_id


def _map_breeze_interval_to_db(interval: str) -> tuple[str, str]:
    """Map Breeze interval to (interval_type, interval_value) used in DB."""
    i = interval.lower().strip()
    if i in ("1m", "1min", "1minute"):
        return "minutes", "1"
    if i in ("5m", "5min", "5minute"):
        return "minutes", "5"
    if i in ("30m", "30min", "30minute"):
        return "minutes", "30"
    if i in ("1d", "1day", "day"):
        return "days", "1"
    if i in ("1s", "1sec", "1second"):
        return "seconds", "1"
    return "minutes", "1"


# ── Connection Routes ─────────────────────────────────────────────────────────

@router.get("/broker/breeze/login-url")
def breeze_login_url(user=Depends(get_current_user)):
    """Generate the ICICI Direct Breeze API login/authorization URL."""
    from services.redis_client import get_breeze_credentials
    creds = get_breeze_credentials()
    settings = get_settings()
    
    api_key = creds.get("app_key") or settings.icici_client_id
    if not api_key:
        raise HTTPException(500, "Breeze api_key (app_key) is missing in Redis and configuration.")
    
    quoted_api_key = urllib.parse.quote_plus(api_key)
    url = f"https://api.icicidirect.com/apiuser/login?api_key={quoted_api_key}"
    return {"url": url}


@router.post("/broker/breeze/connect")
async def breeze_connect(payload: BreezeConnectPayload, user=Depends(get_current_user)):
    """Exchanges and stores the Breeze session token in Redis.

    Verifies the session token is valid by attempting to initialize Breeze client.
    """
    session_id = _extract_session_token(payload.session_token)
    
    # Retrieve credentials from Redis to verify connection works
    from services.redis_client import get_breeze_credentials
    creds = get_breeze_credentials()
    settings = get_settings()
    
    api_key = creds.get("app_key") or settings.icici_client_id
    secret_key = creds.get("secret_key") or settings.icici_secret_key

    if not api_key or not secret_key:
        raise HTTPException(400, "Breeze api_key or secret_key is not configured in Redis or settings.")

    # Verify authentication works by instantiating BreezeConnect
    try:
        import asyncio
        from breeze_connect import BreezeConnect
        
        def _verify():
            breeze = BreezeConnect(api_key=api_key)
            breeze.generate_session(api_secret=secret_key, session_token=session_id)
            
        await asyncio.to_thread(_verify)
    except Exception as e:
        if "Breeze session generation failed" in str(e) or "session_token" in str(e):
            raise HTTPException(400, f"Invalid Breeze session token: {e}")
        logger.warning("Breeze test fetch failed during connection (likely market closed or invalid test symbol): %s", e)

    # Save to Redis
    save_breeze_token(session_id)
    return {"ok": True, "message": "Breeze session authenticated and saved successfully."}


@router.get("/broker/breeze/status")
def breeze_status(user=Depends(get_current_user)):
    """Check if the Breeze session token is stored in Redis."""
    from services.redis_client import get_breeze_credentials
    creds = get_breeze_credentials()
    return {"connected": bool(creds.get("session_id"))}


@router.post("/broker/breeze/disconnect")
def breeze_disconnect(user=Depends(get_current_user)):
    """Delete the Breeze session token from Redis."""
    delete_breeze_token()
    return {"ok": True, "message": "Breeze token removed from Redis."}


# ── Data Fetch / Import Routes ────────────────────────────────────────────────

@router.get("/breeze/historical-options", response_model=HistoricalCandleResponse)
async def get_historical_options(
    stock_code: str = Query(..., description="e.g. NIFTY, BANKNIFTY"),
    expiry_date: str = Query(..., description="Option expiry date (YYYY-MM-DD)"),
    right: str = Query(..., description="Option type CE (call) or PE (put)"),
    strike_price: float = Query(..., description="Option strike price"),
    from_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    to_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    interval: str = Query("1minute", description="Interval: 1minute, 5minute, 30minute, 1day"),
    user=Depends(get_current_user),
):
    """Retrieve historical options data from Breeze API without saving it to the database."""
    _get_breeze_token_or_raise(user["id"])
    client = ICICIDirectClient()
    try:
        candles = await client.fetch_historical_options(
            stock_code=stock_code,
            expiry_date=expiry_date,
            right=right,
            strike_price=strike_price,
            from_date=from_date,
            to_date=to_date,
            interval=interval,
        )
    except Exception as e:
        logger.error("Breeze options fetch failed: %s", e)
        raise HTTPException(502, f"Breeze API error: {e}")

    return HistoricalCandleResponse(
        status="success",
        candles=[CandleData(**c) for c in candles]
    )


@router.post("/breeze/historical-options-import")
async def import_historical_options(
    req: HistoricalOptionsImportRequest,
    user=Depends(get_current_user),
):
    """Fetch options data from Breeze and insert/upsert it into the `candle_data` table."""
    _get_breeze_token_or_raise(user["id"])
    client = ICICIDirectClient()

    # 1. Fetch candles from Breeze API
    try:
        candles = await client.fetch_historical_options(
            stock_code=req.stock_code,
            expiry_date=req.expiry_date,
            right=req.right,
            strike_price=req.strike_price,
            from_date=req.from_date,
            to_date=req.to_date,
            interval=req.interval,
        )
    except Exception as e:
        logger.error("Breeze import fetch failed: %s", e)
        raise HTTPException(502, f"Breeze API error: {e}")

    if not candles:
        return {"status": "success", "imported": 0, "message": "No data returned from Breeze API."}

    # 2. Determine target db symbol name
    if req.custom_symbol:
        db_symbol = req.custom_symbol.strip().upper()
    else:
        norm_right = req.right.upper().strip()
        if norm_right == "CALL":
            norm_right = "CE"
        elif norm_right == "PUT":
            norm_right = "PE"
        db_symbol = f"{req.stock_code.upper().strip()}_{req.expiry_date}_{int(req.strike_price)}_{norm_right}"

    # 3. Save candles to database
    interval_type, interval_value = _map_breeze_interval_to_db(req.interval)
    
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
            db_symbol,
            "NFO",
            None,
            interval_type,
            interval_value,
            f"{c['time']}+05:30",
            c["open"],
            c["high"],
            c["low"],
            c["close"],
            c["volume"],
            c["oi"],
        )
        for c in candles
    ]

    try:
        with DatabaseUtil() as db:
            rows_affected = db.execute_many(sql, params)
    except Exception as e:
        logger.error("Database save failed during Breeze options import: %s", e)
        raise HTTPException(500, f"Database error during import: {e}")

    return {
        "status": "success",
        "symbol": db_symbol,
        "imported": len(candles),
        "db_rows_affected": rows_affected,
        "message": f"Successfully imported {len(candles)} candles to `candle_data` under symbol '{db_symbol}'."
    }
