"""Auth endpoints — validates env credentials, no JWT, no DB.

POST /auth/login  — verify username/password, return ok
GET  /auth/me     — return current user info
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import get_settings
from ..deps import _validate, _user_dict, get_current_user
from fastapi import Depends

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(payload: LoginRequest):
    if not _validate(payload.username, payload.password):
        raise HTTPException(401, "Invalid username or password")
    return {"ok": True, "user_id": payload.username}


@router.get("/me")
def me(user=Depends(get_current_user)):
    return user
