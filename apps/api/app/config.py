from __future__ import annotations
import os
import socket
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

_REMOTE_HOST = "209.182.232.165"


def _resolve_env_files() -> tuple[str, ...]:
    """
    Pick the right .env file based on priority:
      1. APP_ENV=prod  (explicit override via env var or CLI)
      2. Machine IP == remote host  (auto-detect)
      3. Fallback → .env.local
    Tries both root-relative (../../) and cwd paths for each candidate.
    """
    # 1. Explicit override
    if os.environ.get("APP_ENV", "").lower() == "prod":
        chosen = ".env.prod"
    else:
        # 2. Auto-detect by IP
        try:
            local_ip = socket.gethostbyname(socket.gethostname())
        except Exception:
            local_ip = ""
        chosen = ".env.prod" if local_ip == _REMOTE_HOST else ".env.local"

    return (f"../../{chosen}", chosen)


def _log_env_choice() -> None:
    chosen = ".env.prod" if os.environ.get("APP_ENV", "").lower() == "prod" else None
    if chosen is None:
        try:
            local_ip = socket.gethostbyname(socket.gethostname())
        except Exception:
            local_ip = ""
        chosen = ".env.prod" if local_ip == _REMOTE_HOST else ".env.local"
    print(f"\033[96m[config] Loading {chosen}\033[0m")


_log_env_choice()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_resolve_env_files(), extra="ignore")

    api_host: str = "0.0.0.0"
    api_port: int = 8003
    allowed_origins: str = "http://localhost:3003"

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str = ""
    redis_db: int = 0

    # Single-user Basic Auth credentials (stored in .env, validated in-memory)
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

    allow_live_trading: bool = False

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
