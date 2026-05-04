"""Supabase client wrapper. Falls back to no-op in-memory store when not configured,
so the API stays usable for development without Supabase credentials."""
from __future__ import annotations
from typing import Any
from .config import get_settings

try:
    from supabase import create_client, Client  # type: ignore
except Exception:  # pragma: no cover
    create_client = None
    Client = None  # type: ignore


_settings = get_settings()
_client: Any = None


def supabase() -> Any:
    global _client
    if _client is not None:
        return _client
    if create_client and _settings.supabase_url and _settings.supabase_service_role_key:
        _client = create_client(
            _settings.supabase_url, _settings.supabase_service_role_key
        )
        return _client
    _client = _InMemorySupabase()
    return _client


class _InMemoryTable:
    def __init__(self, store: dict, name: str):
        self._store = store
        self._name = name
        self._filters: list[tuple[str, str, Any]] = []
        self._order: tuple[str, bool] | None = None
        self._limit: int | None = None
        self._payload: Any = None
        self._mode: str | None = None

    def select(self, *_a, **_kw):
        self._mode = "select"
        return self

    def insert(self, payload):
        self._mode = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._mode = "update"
        self._payload = payload
        return self

    def delete(self):
        self._mode = "delete"
        return self

    def eq(self, col, val):
        self._filters.append((col, "eq", val))
        return self

    def order(self, col, desc=False):
        self._order = (col, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def single(self):
        self._limit = 1
        return self

    def execute(self):
        rows = self._store.setdefault(self._name, [])

        def match(r):
            return all(r.get(c) == v for c, op, v in self._filters if op == "eq")

        if self._mode == "select":
            data = [r for r in rows if match(r)]
            if self._order:
                col, desc = self._order
                data.sort(key=lambda r: r.get(col) or "", reverse=desc)
            if self._limit:
                data = data[: self._limit]
            return type("Resp", (), {"data": data, "error": None})()
        if self._mode == "insert":
            payload = self._payload if isinstance(self._payload, list) else [self._payload]
            for p in payload:
                rows.append(dict(p))
            return type("Resp", (), {"data": payload, "error": None})()
        if self._mode == "update":
            updated = []
            for r in rows:
                if match(r):
                    r.update(self._payload)
                    updated.append(r)
            return type("Resp", (), {"data": updated, "error": None})()
        if self._mode == "delete":
            keep = [r for r in rows if not match(r)]
            removed = [r for r in rows if match(r)]
            self._store[self._name] = keep
            return type("Resp", (), {"data": removed, "error": None})()
        return type("Resp", (), {"data": [], "error": None})()


class _InMemorySupabase:
    """Minimal stand-in for the Supabase client used in dev when env not set."""

    def __init__(self):
        self._store: dict[str, list[dict]] = {}

    def table(self, name: str) -> _InMemoryTable:
        return _InMemoryTable(self._store, name)
