from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel

from backend_config import get_settings
from db import db_insert, new_id
from deps import get_current_user
from services.upstox_service import UpstoxClient
from services.redis_client import get_upstox_token

router = APIRouter(prefix="/orders", tags=["orders"])
_IDEMPOTENCY_WINDOW_SECONDS = 300
_idempotency_cache: dict[str, tuple[datetime, dict]] = {}


class PlaceOrderRequest(BaseModel):
    strategy_id: str
    symbol: str
    side: str
    quantity: int
    price: float
    order_type: str = "MARKET"
    mode: str = "paper"
    confirm_live: bool = False


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _purge_expired_keys(now: datetime) -> None:
    expired = [
        key for key, (created_at, _) in _idempotency_cache.items()
        if (now - created_at).total_seconds() > _IDEMPOTENCY_WINDOW_SECONDS
    ]
    for key in expired:
        _idempotency_cache.pop(key, None)


@router.post("/place")
async def place(
    req: PlaceOrderRequest,
    response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    user=Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    cache_key = f"{user['id']}:{idempotency_key}" if idempotency_key else None
    if cache_key:
        _purge_expired_keys(now)
        cached = _idempotency_cache.get(cache_key)
        if cached is not None:
            response.headers["X-Idempotency-Replayed"] = "true"
            return cached[1]

    settings = get_settings()
    if req.mode == "live":
        if not settings.allow_live_trading:
            raise HTTPException(403, "Live trading disabled (ALLOW_LIVE_TRADING=false).")
        if not req.confirm_live:
            raise HTTPException(400, "Live orders require confirm_live=true.")
        ba = get_upstox_token()
        if not ba:
            raise HTTPException(400, "No active Upstox token in Redis. Connect via GET /api/v1/broker/upstox/login-url")
        client = UpstoxClient(ba)
        broker_resp = await client.place_order(
            {
                "quantity": req.quantity,
                "product": "I",
                "validity": "DAY",
                "price": req.price if req.order_type == "LIMIT" else 0,
                "tag": "signalai",
                "instrument_token": req.symbol,
                "order_type": req.order_type,
                "transaction_type": req.side,
                "disclosed_quantity": 0,
                "trigger_price": 0,
                "is_amo": False,
            }
        )
        broker_order_id = (broker_resp.get("data") or {}).get("order_id")
        status = "pending"
    else:
        broker_order_id = None
        status = "filled"

    row = {
        "id": new_id(),
        "user_id": user["id"],
        "strategy_id": req.strategy_id,
        "trade_id": None,
        "symbol": req.symbol,
        "side": req.side,
        "quantity": req.quantity,
        "price": req.price,
        "order_type": req.order_type,
        "mode": req.mode,
        "status": status,
        "broker_order_id": broker_order_id,
        "created_at": _now(),
    }
    db_insert("orders", row)
    if cache_key:
        _idempotency_cache[cache_key] = (now, row)
    return row
