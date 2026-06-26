from __future__ import annotations
import os
import socket
from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

_REMOTE_HOST = "209.182.232.165"


def _get_local_ip() -> str:
    """Return the primary outbound IP without making a real network call."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return ""


def _resolve_env_file() -> str:
    """
    Remote host (209.182.232.165) or APP_ENV=prod → .env.prod
    Everything else                                → .env
    """
    repo_root = Path(__file__).resolve().parents[3]

    if os.environ.get("APP_ENV", "").lower() == "prod" or _get_local_ip() == _REMOTE_HOST:
        chosen = ".env.prod"
    else:
        chosen = ".env"

    full_path = repo_root / chosen
    print(
        f"\033[96m[config] env → {chosen}"
        f"  (IP: {_get_local_ip() or 'unknown'}"
        f"  APP_ENV: {os.environ.get('APP_ENV', 'not set')})\033[0m"
    )
    return str(full_path)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_resolve_env_file(), extra="ignore")

    api_host: str = "0.0.0.0"
    api_port: int = 8003
    allowed_origins: str = "http://localhost:3003"

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str = ""
    redis_db: int = 0

    # Single-user Basic Auth credentials
    api_username: str = "edrao"
    api_password: str = "chiru123"

    # MySQL
    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str = "root"
    mysql_password: str = ""
    mysql_database: str = "signal_ai"

    # MongoDB
    mongodb_host: str = "localhost"
    mongodb_port: int = 27017
    mongodb_username: str = ""
    mongodb_password: str = ""
    mongodb_db_name: str = "stocks"

    # QuestDB
    questdb_host: str = "localhost"
    questdb_port: int = 9009

    # Upstox
    upstox_client_id: str = ""
    upstox_client_secret: str = ""
    upstox_redirect_uri: str = "http://localhost:3003/settings/upstox/callback"
    upstox_base_url: str = "https://api.upstox.com/v2"

    # ICICI / Breeze
    icici_client_id: str = ""
    icici_secret_key: str = ""
    icici_api_url: str = "https://breezeapi.icicidirect.com/"

    allow_live_trading: bool = False

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
