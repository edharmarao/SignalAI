from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..deps import get_current_user
from ..services.upstox_service import UpstoxClient
from ..services.redis_client import get_upstox_token, save_upstox_token, delete_upstox_token

router = APIRouter(prefix="/broker", tags=["broker"])


class UpstoxCallback(BaseModel):
    code: str


@router.get("/upstox/login-url")
def upstox_login_url(user=Depends(get_current_user)):
    """Return the Upstox OAuth authorization URL."""
    return {"url": UpstoxClient().login_url()}


@router.post("/upstox/connect")
async def upstox_connect(payload: UpstoxCallback, user=Depends(get_current_user)):
    """Exchange OAuth code for access token and persist it in Redis."""
    client = UpstoxClient()
    try:
        token_resp = await client.exchange_code(payload.code)
    except Exception as e:
        raise HTTPException(400, f"Token exchange failed: {e}")

    access_token = token_resp.get("access_token", "")
    if not access_token:
        raise HTTPException(400, "No access_token in Upstox response")

    save_upstox_token(
        access_token=access_token,
        refresh_token=token_resp.get("refresh_token", ""),
        client_id=token_resp.get("user_id", ""),
    )
    return {"ok": True, "client_id": token_resp.get("user_id", "")}


@router.get("/upstox/status")
def upstox_status(user=Depends(get_current_user)):
    """Check if an Upstox token is currently stored in Redis."""
    token = get_upstox_token()
    return {"connected": bool(token)}


@router.post("/disconnect")
def disconnect(user=Depends(get_current_user)):
    """Remove the Upstox token from Redis."""
    delete_upstox_token()
    return {"ok": True}
