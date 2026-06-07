from __future__ import annotations
from fastapi import APIRouter, Depends
from ..deps import get_current_user
from ..db import db_query

router = APIRouter(tags=["records"])


def _strategy_ids_for_desk(user_id: str, desk: str) -> set[str]:
    rows = db_query(
        "SELECT id, strategy_json FROM strategies WHERE user_id=%s", (user_id,)
    )
    return {
        r["id"] for r in rows
        if (r.get("strategy_json") or {}).get("desk") == desk
    }


@router.get("/trades")
def list_trades(desk: str | None = None, user=Depends(get_current_user)):
    rows = db_query(
        "SELECT * FROM trades WHERE user_id=%s ORDER BY opened_at DESC",
        (user["id"],),
    )
    if not desk:
        return rows
    ids = _strategy_ids_for_desk(user["id"], desk)
    return [r for r in rows if r.get("strategy_id") in ids]


@router.get("/orders")
def list_orders(desk: str | None = None, user=Depends(get_current_user)):
    rows = db_query(
        "SELECT * FROM orders WHERE user_id=%s ORDER BY created_at DESC",
        (user["id"],),
    )
    if not desk:
        return rows
    ids = _strategy_ids_for_desk(user["id"], desk)
    return [r for r in rows if r.get("strategy_id") in ids]


@router.get("/logs")
def list_logs(desk: str | None = None, user=Depends(get_current_user)):
    rows = db_query(
        "SELECT * FROM logs WHERE user_id=%s ORDER BY created_at DESC LIMIT 500",
        (user["id"],),
    )
    if not desk:
        return rows
    ids = _strategy_ids_for_desk(user["id"], desk)
    return [r for r in rows if not r.get("strategy_id") or r.get("strategy_id") in ids]
