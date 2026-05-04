from __future__ import annotations
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from ..deps import get_current_user
from ..models import StrategyCreate, StrategyUpdate
from ..supabase_client import supabase
from ..validation import validate_strategy

router = APIRouter(prefix="/strategies", tags=["strategies"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("")
def list_strategies(user=Depends(get_current_user)):
    res = (
        supabase()
        .table("strategies")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return res.data


@router.post("")
def create_strategy(payload: StrategyCreate, user=Depends(get_current_user)):
    errors = validate_strategy(payload.strategy_json)
    if errors:
        raise HTTPException(400, {"errors": errors})
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": payload.name,
        "strategy_json": payload.strategy_json.model_dump(),
        "is_active": False,
        "mode": payload.mode,
        "status": payload.status,
        "created_at": _now(),
        "updated_at": _now(),
    }
    supabase().table("strategies").insert(row).execute()
    return row


@router.get("/{strategy_id}")
def get_strategy(strategy_id: str, user=Depends(get_current_user)):
    res = (
        supabase()
        .table("strategies")
        .select("*")
        .eq("user_id", user["id"])
        .eq("id", strategy_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Not found")
    return res.data[0]


@router.patch("/{strategy_id}")
def update_strategy(strategy_id: str, payload: StrategyUpdate, user=Depends(get_current_user)):
    update = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "strategy_json" in update:
        errors = validate_strategy(payload.strategy_json)  # type: ignore
        if errors:
            raise HTTPException(400, {"errors": errors})
        update["strategy_json"] = payload.strategy_json.model_dump()  # type: ignore
    update["updated_at"] = _now()
    (
        supabase()
        .table("strategies")
        .update(update)
        .eq("user_id", user["id"])
        .eq("id", strategy_id)
        .execute()
    )
    return {"ok": True}


@router.post("/{strategy_id}/duplicate")
def duplicate_strategy(strategy_id: str, user=Depends(get_current_user)):
    res = (
        supabase()
        .table("strategies")
        .select("*")
        .eq("user_id", user["id"])
        .eq("id", strategy_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Not found")
    src = res.data[0]
    new_row = {
        **src,
        "id": str(uuid.uuid4()),
        "name": f"{src['name']} (Copy)",
        "is_active": False,
        "status": "draft",
        "created_at": _now(),
        "updated_at": _now(),
    }
    supabase().table("strategies").insert(new_row).execute()
    return new_row


@router.delete("/{strategy_id}")
def delete_strategy(strategy_id: str, user=Depends(get_current_user)):
    (
        supabase()
        .table("strategies")
        .delete()
        .eq("user_id", user["id"])
        .eq("id", strategy_id)
        .execute()
    )
    return {"ok": True}
