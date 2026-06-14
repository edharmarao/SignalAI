from __future__ import annotations
from fastapi import APIRouter
from ..db import db_query
import logging

router = APIRouter(prefix="/instruments", tags=["instruments"])
equity_router = APIRouter(prefix="/equity", tags=["equity"])
logger = logging.getLogger("signal_ai")

INDEX_INSTRUMENT_KEYS = {
    "NIFTY": "NSE_INDEX|Nifty 50",
    "BANKNIFTY": "NSE_INDEX|Nifty Bank",
    "FINNIFTY": "NSE_INDEX|Nifty Fin Service",
    "SENSEX": "BSE_INDEX|SENSEX",
}


@router.get("")
def list_indexes():
    return [{"symbol": k, "instrument_key": v} for k, v in INDEX_INSTRUMENT_KEYS.items()]


@equity_router.get("/stocks")
def list_equity_stocks():
    try:
        rows = db_query(
            "SELECT symbol, company_name AS name, industry AS sector FROM nse_eq_symbols ORDER BY symbol LIMIT 750"
        )
        return [{"symbol": r["symbol"], "name": r.get("name",""), "sector": r.get("sector","")} for r in rows]
    except Exception as exc:
        logger.error("Failed to fetch equity stocks from DB: %s", exc)
        return []
