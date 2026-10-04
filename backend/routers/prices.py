from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from deps import get_current_user
from services.upstox_service import UpstoxClient
from services.redis_client import get_upstox_token
from services.instrument_map import get_isin
from routers.instruments import INDEX_INSTRUMENT_KEYS

router = APIRouter(prefix="/prices", tags=["prices"])


def _broker_token(user_id: str) -> str | None:
    return get_upstox_token()


@router.get("/ltp/{symbol}")
async def get_ltp(symbol: str, user=Depends(get_current_user)):
    normalized_symbol = symbol.strip().upper()
    key = INDEX_INSTRUMENT_KEYS.get(normalized_symbol)
    if not key:
        ticker = normalized_symbol.partition(":")[-1]
        ticker, separator, series = ticker.rpartition("-")
        if not separator or series not in {"EQ", "BE", "BZ", "SM", "ST", "SZ"}:
            ticker = normalized_symbol.partition(":")[-1]
        isin = get_isin(ticker)
        if isin:
            key = f"NSE_EQ|{isin}"
    if not key:
        raise HTTPException(404, f"Unknown stock or index: {symbol}")
    token = _broker_token(user["id"])
    if not token:
        return {"symbol": symbol, "ltp": None, "source": "no_broker"}
    client = UpstoxClient(token)
    try:
        data = await client.ltp([key])
        quote = data.get("data", {}).get(key, {})
        ltp = quote.get("last_price") if isinstance(quote, dict) else None
        if isinstance(ltp, bool) or not isinstance(ltp, (int, float)):
            ltp = None
        return {"symbol": symbol, "ltp": ltp, "data": data, "source": "upstox"}
    except Exception as e:
        raise HTTPException(502, f"Upstox error: {e}")
