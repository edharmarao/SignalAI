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
    """INSERT rows with ON DUPLICATE KEY UPDATE using executemany (bulk commit).

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
    values = [list(r.values()) for r in encoded_rows]
    with _db() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, values)
            return cur.rowcount


def db_bulk_insert_candles(
    table: str,
    rows: list[dict],
    batch_size: int = 1000,
) -> int:
    """Bulk-insert candle rows into stock_data_* tables in batches.

    Each batch is committed separately so large imports don't hold one giant transaction.
    Uses INSERT IGNORE to skip duplicates (relies on UNIQUE KEY on stock_code+candle_time).
    Returns total rows inserted.
    """
    if not rows:
        return 0
    cols = list(rows[0].keys())
    col_sql = ", ".join(f"`{c}`" for c in cols)
    ph = ", ".join(["%s"] * len(cols))
    sql = f"INSERT IGNORE INTO `{table}` ({col_sql}) VALUES ({ph})"
    total = 0
    with _connect() as conn:
        try:
            with conn.cursor() as cur:
                for i in range(0, len(rows), batch_size):
                    batch = rows[i: i + batch_size]
                    values = [list(r.values()) for r in batch]
                    cur.executemany(sql, values)
                    total += cur.rowcount
                    conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    return total


def new_id() -> str:
    return str(uuid.uuid4())


# ── Stock data table auto-creation ───────────────────────────────────────────

_STOCK_DATA_TIMEFRAMES = ("5min", "15min", "25min", "30min", "1hour", "daily", "weekly", "monthly")

_CREATE_STOCK_DATA_TABLE = """
CREATE TABLE IF NOT EXISTS `{table}` (
  `id`          BIGINT        NOT NULL AUTO_INCREMENT,
  `stock_code`  VARCHAR(50)   NOT NULL,
  `candle_time` DATETIME      NOT NULL,
  `open`        DECIMAL(12,4) NOT NULL,
  `high`        DECIMAL(12,4) NOT NULL,
  `low`         DECIMAL(12,4) NOT NULL,
  `close`       DECIMAL(12,4) NOT NULL,
  `volume`      BIGINT        NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_{suffix}` (`stock_code`, `candle_time`),
  KEY `idx_{suffix}_code_time` (`stock_code`, `candle_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""


def ensure_stock_data_tables() -> None:
    """Create stock_data_<timeframe> tables if they don't exist."""
    with _db() as conn:
        with conn.cursor() as cur:
            for tf in _STOCK_DATA_TIMEFRAMES:
                table = f"stock_data_{tf}"
                sql = _CREATE_STOCK_DATA_TABLE.format(table=table, suffix=tf)
                cur.execute(sql)
    logger.info("Stock data tables verified/created: %s", [f"stock_data_{tf}" for tf in _STOCK_DATA_TIMEFRAMES])
