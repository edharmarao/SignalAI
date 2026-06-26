from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from deps import get_current_user
from services.upstox_service import UpstoxClient
from services.redis_client import get_upstox_token
from routers.instruments import INDEX_INSTRUMENT_KEYS

router = APIRouter(prefix="/prices", tags=["prices"])


def _broker_token(user_id: str) -> str | None:
    return get_upstox_token()


@router.get("/ltp/{symbol}")
async def get_ltp(symbol: str, user=Depends(get_current_user)):
    key = INDEX_INSTRUMENT_KEYS.get(symbol.upper())
    if not key:
        raise HTTPException(404, "Unknown index")
    token = _broker_token(user["id"])
    if not token:
        return {"symbol": symbol, "ltp": None, "source": "no_broker"}
    client = UpstoxClient(token)
    try:
        data = await client.ltp([key])
        return {"symbol": symbol, "data": data, "source": "upstox"}
    except Exception as e:
        raise HTTPException(502, f"Upstox error: {e}")
