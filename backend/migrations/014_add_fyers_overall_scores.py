"""Add overall Fyers momentum, oscillator, and returns score columns."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from db import db_execute, db_query


_SCORE_COLUMNS = {
    "momentum_score": "DECIMAL(20,6) NULL",
    "oscillators_score": "DECIMAL(20,6) NULL",
    "returns_score": "DECIMAL(20,6) NULL",
}


def migrate() -> None:
    columns = db_query("SHOW COLUMNS FROM technical_indicators")
    existing_columns = {column["Field"] for column in columns}
    missing_columns = {
        name: sql_type
        for name, sql_type in _SCORE_COLUMNS.items()
        if name not in existing_columns
    }
    if not missing_columns:
        print("Fyers overall score columns are already present.")
        return

    additions = ", ".join(
        f"ADD COLUMN `{name}` {sql_type}"
        for name, sql_type in missing_columns.items()
    )
    db_execute(f"ALTER TABLE technical_indicators {additions}")
    print(f"Added Fyers overall score columns: {', '.join(missing_columns)}.")


if __name__ == "__main__":
    migrate()
