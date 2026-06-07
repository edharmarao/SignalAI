from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from ..deps import get_current_user
from ..db import db_one
from ..services.upstox import UpstoxClient
from .instruments import INDEX_INSTRUMENT_KEYS

router = APIRouter(prefix="/prices", tags=["prices"])


def _broker_token(user_id: str) -> str | None:
    row = db_one(
        "SELECT access_token FROM broker_accounts "
        "WHERE user_id=%s AND broker='upstox' AND is_active=1 "
        "ORDER BY updated_at DESC LIMIT 1",
        (user_id,),
    )
    return row["access_token"] if row else None


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
