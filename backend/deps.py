from __future__ import annotations

import os
import secrets
from typing import Optional

from fastapi import Header, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from backend_config import get_settings

_IS_DEV = os.getenv("ENVIRONMENT", "development") == "development"
_security = HTTPBasic(auto_error=False)


def _validate(username: str, password: str) -> bool:
    """Constant-time comparison against in-memory env credentials."""
    s = get_settings()
    ok_user = secrets.compare_digest(username, s.api_username)
    ok_pass = secrets.compare_digest(password, s.api_password)
    return ok_user and ok_pass


def _user_dict() -> dict:
    s = get_settings()
    return {"id": s.api_username, "email": s.api_username}


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    x_dev_user_id: Optional[str] = Header(default=None),
) -> dict:
    """Validate HTTP Basic Auth against env credentials (in-memory, zero latency).

    Accepts:
      - Authorization: Basic <base64(user:pass)>
      - In dev only: X-Dev-User-Id header (bypasses auth for quick testing)
    """
    if x_dev_user_id and _IS_DEV:
        return {"id": x_dev_user_id, "email": x_dev_user_id}

    if authorization:
        scheme, _, encoded = authorization.partition(" ")
        if scheme.lower() == "basic" and encoded:
            import base64
            try:
                decoded = base64.b64decode(encoded).decode("utf-8")
                username, _, password = decoded.partition(":")
                if _validate(username, password):
                    return _user_dict()
            except Exception:
                pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials",
        headers={"WWW-Authenticate": "Basic realm=\"Signal AI\""},
    )


def optional_user(
    authorization: Optional[str] = Header(default=None),
    x_dev_user_id: Optional[str] = Header(default=None),
) -> Optional[dict]:
    try:
        return get_current_user(authorization, x_dev_user_id)
    except HTTPException:
        return None
