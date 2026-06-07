"""MySQL database client.

Provides synchronous query helpers backed by PyMySQL with DictCursor so every
row is returned as a plain dict (matching the old Supabase `.data` contract).

JSON columns (strategy_json, data) are automatically serialised/deserialised.
"""
from __future__ import annotations

import json
import logging
import uuid
from contextlib import contextmanager
from typing import Any

import pymysql
import pymysql.cursors

from .config import get_settings

logger = logging.getLogger("signal_ai")

# Columns that store JSON and need automatic codec
_JSON_COLS = {"strategy_json", "data"}


def _connect() -> pymysql.connections.Connection:
    s = get_settings()
    return pymysql.connect(
        host=s.mysql_host,
        port=s.mysql_port,
        user=s.mysql_user,
        password=s.mysql_password,
        database=s.mysql_database,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


@contextmanager
def _db():
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _decode_row(row: dict) -> dict:
    """Parse JSON columns from string to Python objects."""
    for col in _JSON_COLS:
        if col in row and isinstance(row[col], str):
            try:
                row[col] = json.loads(row[col])
            except (json.JSONDecodeError, TypeError):
                pass
    return row


def _decode_rows(rows: list[dict]) -> list[dict]:
    return [_decode_row(r) for r in rows]


# ── Public helpers ────────────────────────────────────────────────────────────

def db_query(sql: str, args: Any = None) -> list[dict]:
    """Run a SELECT and return all rows as dicts."""
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, args)
            rows = cur.fetchall() or []
            return _decode_rows(list(rows))


def db_one(sql: str, args: Any = None) -> dict | None:
    rows = db_query(sql, args)
    return rows[0] if rows else None


def db_execute(sql: str, args: Any = None) -> int:
    """Run an INSERT/UPDATE/DELETE and return affected row count."""
    with _db() as conn:
        with conn.cursor() as cur:
            n = cur.execute(sql, args)
            return n


def db_insert(table: str, row: dict) -> dict:
    """INSERT a row (dict). JSON-serialises known JSON columns. Returns the row."""
    encoded = {
        k: (json.dumps(v) if k in _JSON_COLS and not isinstance(v, str) else v)
        for k, v in row.items()
    }
    cols = ", ".join(f"`{c}`" for c in encoded)
    placeholders = ", ".join(["%s"] * len(encoded))
    sql = f"INSERT INTO `{table}` ({cols}) VALUES ({placeholders})"
    db_execute(sql, list(encoded.values()))
    return row


def db_upsert(table: str, rows: list[dict], unique_cols: list[str]) -> int:
    """INSERT rows with ON DUPLICATE KEY UPDATE for non-unique columns.

    Returns the number of rows affected.
    """
    if not rows:
        return 0
    encoded_rows = [
        {
            k: (json.dumps(v) if k in _JSON_COLS and not isinstance(v, str) else v)
            for k, v in r.items()
        }
        for r in rows
    ]
    cols = list(encoded_rows[0].keys())
    update_cols = [c for c in cols if c not in unique_cols and c != "id"]
    col_sql = ", ".join(f"`{c}`" for c in cols)
    ph = ", ".join(["%s"] * len(cols))
    update_sql = ", ".join(f"`{c}`=VALUES(`{c}`)" for c in update_cols)
    sql = (
        f"INSERT INTO `{table}` ({col_sql}) VALUES ({ph}) "
        f"ON DUPLICATE KEY UPDATE {update_sql}"
    )
    total = 0
    with _db() as conn:
        with conn.cursor() as cur:
            for r in encoded_rows:
                cur.execute(sql, list(r.values()))
                total += cur.rowcount
    return total


def new_id() -> str:
    return str(uuid.uuid4())
