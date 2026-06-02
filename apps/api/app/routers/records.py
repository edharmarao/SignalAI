from __future__ import annotations
from fastapi import APIRouter, Depends
from ..deps import get_current_user
from ..supabase_client import supabase

router = APIRouter(tags=["records"])


def _strategy_ids_for_desk(user_id: str, desk: str) -> set[str]:
    res = (
        supabase()
        .table("strategies")
        .select("id,strategy_json")
        .eq("user_id", user_id)
        .execute()
    )
    return {
        row["id"]
        for row in (res.data or [])
        if (row.get("strategy_json") or {}).get("desk") == desk
    }


@router.get("/trades")
def list_trades(desk: str | None = None, user=Depends(get_current_user)):
    res = (
        supabase()
        .table("trades")
        .select("*")
        .eq("user_id", user["id"])
        .order("opened_at", desc=True)
        .execute()
    )
    rows = res.data or []
    if not desk:
        return rows
    ids = _strategy_ids_for_desk(user["id"], desk)
    return [row for row in rows if row.get("strategy_id") in ids]


@router.get("/orders")
def list_orders(desk: str | None = None, user=Depends(get_current_user)):
    res = (
        supabase()
        .table("orders")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    rows = res.data or []
    if not desk:
        return rows
    ids = _strategy_ids_for_desk(user["id"], desk)
    return [row for row in rows if row.get("strategy_id") in ids]


@router.get("/logs")
def list_logs(desk: str | None = None, user=Depends(get_current_user)):
    res = (
        supabase()
        .table("logs")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )
    rows = res.data or []
    if not desk:
        return rows
    ids = _strategy_ids_for_desk(user["id"], desk)
    return [row for row in rows if not row.get("strategy_id") or row.get("strategy_id") in ids]
