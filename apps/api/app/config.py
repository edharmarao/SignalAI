from __future__ import annotations
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Try root .env first, then local .env (when running from apps/api/)
    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")

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
