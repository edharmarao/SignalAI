"""Configure structured logging for the application.

Log files are written to the ``logs/`` directory at the repository root
(or wherever LOG_DIR points). Three rotating files are created:
  - signal_ai.log   — all INFO+ messages from the whole app
  - trades.log      — only messages from the ``signal_ai.trades`` logger
  - error.log       — WARNING+ messages from every logger
Each file rotates at 10 MB and keeps 7 backups.
"""
from __future__ import annotations

import logging
import logging.config
import os
from pathlib import Path


def _logs_dir() -> str:
    """Return absolute path to the logs directory, creating it if needed."""
    default = Path(__file__).resolve().parents[3] / "logs"
    logs = Path(os.getenv("LOG_DIR", str(default)))
    logs.mkdir(parents=True, exist_ok=True)
    return str(logs)


def configure_logging() -> None:
    env = os.getenv("ENVIRONMENT", "development")
    level = logging.DEBUG if env == "development" else logging.INFO
    logs = _logs_dir()

    console_fmt = "%(asctime)s %(levelname)-8s %(name)s  %(message)s"
    file_fmt    = "%(asctime)s %(levelname)-8s %(name)s [%(filename)s:%(lineno)d]  %(message)s"

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "console": {"format": console_fmt, "datefmt": "%m-%d %H:%M:%S"},
                "file":    {"format": file_fmt,    "datefmt": "%Y-%m-%d %H:%M:%S"},
            },
            "handlers": {
                # ── Console ────────────────────────────────────────────────
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "console",
                    "stream": "ext://sys.stdout",
                },
                # ── signal_ai.log — all app logs (INFO+) ──────────────────
                "file_app": {
                    "class": "logging.handlers.RotatingFileHandler",
                    "formatter": "file",
                    "filename": os.path.join(logs, "signal_ai.log"),
                    "maxBytes": 10 * 1024 * 1024,   # 10 MB
                    "backupCount": 7,
                    "encoding": "utf-8",
                },
                # ── trades.log — trading activity only ────────────────────
                "file_trades": {
                    "class": "logging.handlers.RotatingFileHandler",
                    "formatter": "file",
                    "filename": os.path.join(logs, "trades.log"),
                    "maxBytes": 10 * 1024 * 1024,
                    "backupCount": 7,
                    "encoding": "utf-8",
                },
                # ── error.log — WARNING+ from everything ──────────────────
                "file_error": {
                    "class": "logging.handlers.RotatingFileHandler",
                    "formatter": "file",
                    "filename": os.path.join(logs, "error.log"),
                    "level": "WARNING",
                    "maxBytes": 10 * 1024 * 1024,
                    "backupCount": 7,
                    "encoding": "utf-8",
                },
            },
            "root": {
                "level": level,
                "handlers": ["console", "file_app", "file_error"],
            },
            "loggers": {
                "signal_ai": {"level": level, "propagate": True},
                # Trade-specific logger writes to its own file AND propagates up
                "signal_ai.trades": {
                    "level": logging.INFO,
                    "handlers": ["file_trades"],
                    "propagate": True,
                },
                "uvicorn":          {"level": logging.INFO,  "propagate": True},
                "uvicorn.access":   {"level": logging.INFO,  "propagate": True},
                "uvicorn.error":    {"level": logging.ERROR, "propagate": True},
            },
        }
    )

    logging.getLogger("signal_ai").info(
        "Logging initialised — writing to %s  [env=%s]", logs, env
    )
