"""Configure structured logging for the application."""
from __future__ import annotations

import logging
import logging.config
import os


def configure_logging() -> None:
    env = os.getenv("ENVIRONMENT", "development")
    level = logging.DEBUG if env == "development" else logging.INFO
    fmt = "%(asctime)s %(levelname)s %(name)s %(message)s"
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "standard": {"format": fmt},
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "standard",
                },
            },
            "root": {"level": level, "handlers": ["console"]},
            "loggers": {
                "signal_ai": {"level": level, "propagate": True},
                "uvicorn": {"level": logging.INFO, "propagate": True},
            },
        }
    )
