from __future__ import annotations
from fastapi import APIRouter, Depends
from ..deps import get_current_user
from ..supabase_client import supabase

router = APIRouter(tags=["records"])


@router.get("/trades")
def list_trades(user=Depends(get_current_user)):
    res = (
        supabase()
        .table("trades")
        .select("*")
        .eq("user_id", user["id"])
        .order("opened_at", desc=True)
        .execute()
    )
    return res.data


@router.get("/orders")
def list_orders(user=Depends(get_current_user)):
    res = (
        supabase()
        .table("orders")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return res.data


@router.get("/logs")
def list_logs(user=Depends(get_current_user)):
    res = (
        supabase()
        .table("logs")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )
    return res.data
