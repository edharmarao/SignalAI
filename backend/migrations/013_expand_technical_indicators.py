"""Expand the legacy Fyers JSON snapshot into typed technical-indicator columns.

Run after migrations 011 and 012:
    python backend/migrations/013_expand_technical_indicators.py
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from db import db_execute, db_query, db_upsert
from routers.fyers import _TECHNICAL_COLUMN_TYPES, _technical_indicator_row


def migrate() -> None:
    columns = db_query("SHOW COLUMNS FROM technical_indicators")
    existing_columns = {column["Field"] for column in columns}

    missing_columns = {
        name: sql_type
        for name, sql_type in _TECHNICAL_COLUMN_TYPES.items()
        if name not in existing_columns
    }
    if missing_columns:
        additions = ", ".join(
            f"ADD COLUMN `{name}` {sql_type}"
            for name, sql_type in missing_columns.items()
        )
        db_execute(f"ALTER TABLE technical_indicators {additions}")

    if "data" not in existing_columns:
        print("Technical-indicator columns are already migrated.")
        return

    legacy_rows = db_query(
        "SELECT stock_code, time_period, data, updated_at FROM technical_indicators"
    )
    expanded_rows: list[dict[str, Any]] = []
    for legacy in legacy_rows:
        if not isinstance(legacy.get("data"), dict):
            raise ValueError(
                f"Legacy Fyers data is invalid for {legacy['stock_code']} "
                f"at {legacy['time_period']} minutes."
            )
        row = _technical_indicator_row(
            legacy["stock_code"],
            str(legacy["time_period"]),
            legacy["data"],
        )
        row["data"] = legacy["data"]
        row["updated_at"] = legacy["updated_at"]
        expanded_rows.append(row)

    if expanded_rows:
        db_upsert(
            "technical_indicators",
            expanded_rows,
            unique_cols=["stock_code", "time_period"],
        )

    db_execute("ALTER TABLE technical_indicators DROP COLUMN data")
    print(
        f"Migrated {len(expanded_rows)} technical-indicator row(s) "
        "from JSON to typed columns."
    )


if __name__ == "__main__":
    migrate()
