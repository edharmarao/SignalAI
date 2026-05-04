from __future__ import annotations
from fastapi import APIRouter

router = APIRouter(prefix="/instruments", tags=["instruments"])

INDEX_INSTRUMENT_KEYS = {
    "NIFTY": "NSE_INDEX|Nifty 50",
    "BANKNIFTY": "NSE_INDEX|Nifty Bank",
    "FINNIFTY": "NSE_INDEX|Nifty Fin Service",
    "SENSEX": "BSE_INDEX|SENSEX",
}


@router.get("")
def list_indexes():
    return [{"symbol": k, "instrument_key": v} for k, v in INDEX_INSTRUMENT_KEYS.items()]
