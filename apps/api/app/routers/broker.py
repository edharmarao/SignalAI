from __future__ import annotations
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..deps import get_current_user
from ..services.upstox import UpstoxClient
from ..db import db_query, db_one, db_execute, db_insert, new_id

router = APIRouter(prefix="/broker", tags=["broker"])


class UpstoxCallback(BaseModel):
    code: str


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


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
    # Deactivate any existing Upstox connections for this user
    db_execute(
        "UPDATE broker_accounts SET is_active=0, updated_at=%s WHERE user_id=%s AND broker='upstox'",
        (_now(), user["id"]),
    )
    row = {
        "id": new_id(),
        "user_id": user["id"],
        "broker": "upstox",
        "client_id": token_resp.get("user_id", ""),
        "access_token": token_resp.get("access_token"),
        "refresh_token": token_resp.get("refresh_token"),
        "expires_at": token_resp.get("expires_in"),
        "is_active": 1,
        "created_at": _now(),
        "updated_at": _now(),
    }
    db_insert("broker_accounts", row)
    return {"ok": True}


@router.get("/accounts")
def list_accounts(user=Depends(get_current_user)):
    rows = db_query(
        "SELECT * FROM broker_accounts WHERE user_id=%s", (user["id"],)
    )
    return [
        {**r, "access_token": "***" if r.get("access_token") else None}
        for r in rows
    ]


@router.post("/disconnect")
def disconnect(user=Depends(get_current_user)):
    db_execute(
        "UPDATE broker_accounts SET is_active=0, access_token=NULL, updated_at=%s WHERE user_id=%s",
        (_now(), user["id"]),
    )
    return {"ok": True}
