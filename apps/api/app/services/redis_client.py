"""Redis client — thin wrapper around redis-py.

Token storage matches vasudha-backend convention:
  HSET upstox access_token  <token>
  HSET upstox refresh_token <token>
  HSET upstox client_id     <id>

Reading the token is a single HGET — sub-millisecond.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

import redis

from ..config import get_settings

logger = logging.getLogger("signal_ai")


@lru_cache(maxsize=1)
def _get_pool() -> redis.ConnectionPool:
    s = get_settings()
    return redis.ConnectionPool(
        host=s.redis_host,
        port=s.redis_port,
        password=s.redis_password or None,
        db=s.redis_db,
        decode_responses=True,
        max_connections=10,
    )


def redis_client() -> redis.Redis:
    return redis.Redis(connection_pool=_get_pool())


# ── Upstox-specific helpers (matches vasudha-backend key schema) ──────────────

_UPSTOX_KEY = "upstox"


def get_upstox_token() -> str | None:
    """Fetch Upstox access token from Redis (HGET upstox access_token)."""
    try:
        return redis_client().hget(_UPSTOX_KEY, "access_token")
    except Exception as e:
        logger.warning("Redis: could not fetch Upstox token: %s", e)
        return None


def save_upstox_token(access_token: str, refresh_token: str = "", client_id: str = "") -> None:
    """Persist Upstox credentials to Redis (HSET upstox ...)."""
    try:
        r = redis_client()
        r.hset(_UPSTOX_KEY, "access_token", access_token)
        if refresh_token:
            r.hset(_UPSTOX_KEY, "refresh_token", refresh_token)
        if client_id:
            r.hset(_UPSTOX_KEY, "client_id", client_id)
        logger.info("Upstox access token saved to Redis")
    except Exception as e:
        logger.error("Redis: could not save Upstox token: %s", e)
        raise


def delete_upstox_token() -> None:
    """Remove Upstox credentials from Redis."""
    try:
        redis_client().delete(_UPSTOX_KEY)
        logger.info("Upstox token removed from Redis")
    except Exception as e:
        logger.warning("Redis: could not delete Upstox token: %s", e)
