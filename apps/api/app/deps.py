from __future__ import annotations
from typing import Optional
from fastapi import Depends, Header, HTTPException, status
from jose import jwt, JWTError
from .config import get_settings


def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> dict:
    """Decode Supabase JWT (HS256, signed by SUPABASE_JWT_SECRET).
    In dev mode (no secret) we accept an `X-User-Id` header fallback."""
    settings = get_settings()
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if settings.supabase_jwt_secret:
            try:
                payload = jwt.decode(
                    token,
                    settings.supabase_jwt_secret,
                    algorithms=["HS256"],
                    options={"verify_aud": False},
                )
                return {"id": payload.get("sub"), "email": payload.get("email")}
            except JWTError as e:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}")
        # Dev fallback: treat token as user id
        return {"id": token, "email": None}
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing Authorization header")


def optional_user(
    authorization: Optional[str] = Header(default=None),
) -> Optional[dict]:
    try:
        return get_current_user(authorization)
    except HTTPException:
        return None
