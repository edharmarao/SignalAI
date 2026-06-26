from __future__ import annotations
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from deps import get_current_user
from models import StrategyCreate, StrategyUpdate
from db import db_query, db_one, db_execute, db_insert, new_id
from validation import validate_strategy

router = APIRouter(prefix="/strategies", tags=["strategies"])


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


@router.get("")
def list_strategies(desk: str | None = None, user=Depends(get_current_user)):
    rows = db_query(
        "SELECT * FROM strategies WHERE user_id=%s ORDER BY created_at DESC",
        (user["id"],),
    )
    if desk:
        rows = [r for r in rows if (r.get("strategy_json") or {}).get("desk") == desk]
    return rows


@router.post("")
def create_strategy(payload: StrategyCreate, user=Depends(get_current_user)):
    errors = validate_strategy(payload.strategy_json)
    if errors:
        raise HTTPException(400, {"errors": errors})
    row = {
        "id": new_id(),
        "user_id": user["id"],
        "name": payload.name,
        "strategy_json": payload.strategy_json.model_dump(),
        "is_active": 0,
        "mode": payload.mode,
        "status": payload.status,
        "created_at": _now(),
        "updated_at": _now(),
    }
    db_insert("strategies", row)
    # Return with strategy_json as dict (db_insert keeps it as dict)
    return row


@router.get("/{strategy_id}")
def get_strategy(strategy_id: str, user=Depends(get_current_user)):
    row = db_one(
        "SELECT * FROM strategies WHERE user_id=%s AND id=%s LIMIT 1",
        (user["id"], strategy_id),
    )
    if not row:
        raise HTTPException(404, "Not found")
    return row


@router.patch("/{strategy_id}")
def update_strategy(strategy_id: str, payload: StrategyUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "strategy_json" in updates:
        errors = validate_strategy(payload.strategy_json)  # type: ignore
        if errors:
            raise HTTPException(400, {"errors": errors})
        updates["strategy_json"] = json.dumps(payload.strategy_json.model_dump())  # type: ignore
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"`{k}`=%s" for k in updates)
    db_execute(
        f"UPDATE strategies SET {set_clause} WHERE user_id=%s AND id=%s",
        list(updates.values()) + [user["id"], strategy_id],
    )
    return {"ok": True}


@router.post("/{strategy_id}/duplicate")
def duplicate_strategy(strategy_id: str, user=Depends(get_current_user)):
    src = db_one(
        "SELECT * FROM strategies WHERE user_id=%s AND id=%s LIMIT 1",
        (user["id"], strategy_id),
    )
    if not src:
        raise HTTPException(404, "Not found")
    new_row = {
        **src,
        "id": new_id(),
        "name": f"{src['name']} (Copy)",
        "is_active": 0,
        "status": "draft",
        "created_at": _now(),
        "updated_at": _now(),
    }
    db_insert("strategies", new_row)
    return new_row


@router.delete("/{strategy_id}")
def delete_strategy(strategy_id: str, user=Depends(get_current_user)):
    db_execute(
        "DELETE FROM strategies WHERE user_id=%s AND id=%s",
        (user["id"], strategy_id),
    )
    return {"ok": True}
