from __future__ import annotations

import logging
import os
import time
from typing import Optional

from fastapi import Header, HTTPException, status
import jwt
from jwt.exceptions import PyJWTError as JWTError

from .config import get_settings

logger = logging.getLogger("signal_ai")
_IS_DEV = os.getenv("ENVIRONMENT", "development") == "development"


def decode_user_token(token: str) -> dict:
    settings = get_settings()
    if settings.supabase_jwt_secret:
        try:
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            exp = payload.get("exp")
            if exp is None or int(exp) <= int(time.time()):
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
            return {"id": payload["sub"], "email": payload.get("email")}
        except HTTPException:
            raise
        except JWTError as e:
            logger.warning("JWT decode failed: %s", e)
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    if _IS_DEV:
        logger.debug("Dev fallback: using token as user ID")
        return {"id": token, "email": None}
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Auth not configured on server")


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    x_dev_user_id: Optional[str] = Header(default=None),
) -> dict:
    """Decode Supabase JWT (HS256).

    In DEVELOPMENT only: if no Authorization header is present, accepts
    X-Dev-User-Id header as fallback. Never allowed in production.
    """
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        return decode_user_token(token)

    if x_dev_user_id and _IS_DEV:
        return {"id": x_dev_user_id, "email": None}

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing Authorization header")


def optional_user(
    authorization: Optional[str] = Header(default=None),
    x_dev_user_id: Optional[str] = Header(default=None),
) -> Optional[dict]:
    try:
        return get_current_user(authorization, x_dev_user_id)
    except HTTPException:
        return None
