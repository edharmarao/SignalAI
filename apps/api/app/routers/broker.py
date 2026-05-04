from __future__ import annotations
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..deps import get_current_user
from ..services.upstox import UpstoxClient
from ..supabase_client import supabase

router = APIRouter(prefix="/broker", tags=["broker"])


class UpstoxCallback(BaseModel):
    code: str


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/upstox/login-url")
def upstox_login_url(user=Depends(get_current_user)):
    return {"url": UpstoxClient().login_url()}


@router.post("/upstox/connect")
async def upstox_connect(payload: UpstoxCallback, user=Depends(get_current_user)):
    client = UpstoxClient()
    try:
        token_resp = await client.exchange_code(payload.code)
    except Exception as e:
        raise HTTPException(400, f"Token exchange failed: {e}")
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "broker": "upstox",
        "client_id": token_resp.get("user_id", ""),
        "access_token": token_resp.get("access_token"),
        "refresh_token": token_resp.get("refresh_token"),
        "expires_at": token_resp.get("expires_in"),
        "is_active": True,
        "created_at": _now(),
        "updated_at": _now(),
    }
    supabase().table("broker_accounts").insert(row).execute()
    return {"ok": True}


@router.get("/accounts")
def list_accounts(user=Depends(get_current_user)):
    res = (
        supabase()
        .table("broker_accounts")
        .select("*")
        .eq("user_id", user["id"])
        .execute()
    )
    return [
        {**r, "access_token": "***" if r.get("access_token") else None}
        for r in res.data
    ]


@router.post("/disconnect")
def disconnect(user=Depends(get_current_user)):
    (
        supabase()
        .table("broker_accounts")
        .update({"is_active": False, "access_token": None, "updated_at": _now()})
        .eq("user_id", user["id"])
        .execute()
    )
    return {"ok": True}
