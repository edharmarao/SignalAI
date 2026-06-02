from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel

from ..config import get_settings
from ..deps import get_current_user
from ..services.upstox import UpstoxClient
from ..supabase_client import supabase

# IMPORTANT: Order placement endpoints are NOT idempotent.
# Clients must NOT retry failed order requests without implementing
# idempotency keys. Re-sending can create duplicate live orders.

router = APIRouter(prefix="/orders", tags=["orders"])
_IDEMPOTENCY_WINDOW_SECONDS = 300
# Single-process cache only. Use Redis or another shared store for multi-instance deployments.
_idempotency_cache: dict[str, tuple[datetime, dict]] = {}


class PlaceOrderRequest(BaseModel):
    strategy_id: str
    symbol: str
    side: str  # BUY/SELL
    quantity: int
    price: float
    order_type: str = "MARKET"
    mode: str = "paper"
    confirm_live: bool = False  # extra explicit confirmation for live


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _purge_expired_keys(now: datetime) -> None:
    expired = [key for key, (created_at, _) in _idempotency_cache.items() if (now - created_at).total_seconds() > _IDEMPOTENCY_WINDOW_SECONDS]
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
            raise HTTPException(403, "Live trading disabled by server config (ALLOW_LIVE_TRADING=false).")
        if not req.confirm_live:
            raise HTTPException(400, "Live orders require explicit confirm_live=true.")
        ba = (
            supabase()
            .table("broker_accounts")
            .select("*")
            .eq("user_id", user["id"])
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        if not ba.data:
            raise HTTPException(400, "No active broker account. Connect Upstox first.")
        token = ba.data[0]["access_token"]
        client = UpstoxClient(token)
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
        status = "filled"  # paper orders fill instantly at given price

    row = {
        "id": str(uuid.uuid4()),
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
    supabase().table("orders").insert(row).execute()
    if cache_key:
        _idempotency_cache[cache_key] = (now, row)
    return row
