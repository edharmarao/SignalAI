"""Thin Upstox v2 REST wrapper. Uses httpx; safe to instantiate without credentials.

NOTE: We never place real orders unless `mode == 'live'` AND `ALLOW_LIVE_TRADING=true`
AND the user has an active broker connection. See routers/orders.py."""
from __future__ import annotations
from typing import Any, Optional
import httpx
from ..config import get_settings


class UpstoxClient:
    def __init__(self, access_token: Optional[str] = None):
        self.settings = get_settings()
        self.access_token = access_token
        self.base = self.settings.upstox_base_url

    def _headers(self) -> dict[str, str]:
        h = {"Accept": "application/json"}
        if self.access_token:
            h["Authorization"] = f"Bearer {self.access_token}"
        return h

    def login_url(self) -> str:
        return (
            "https://api.upstox.com/v2/login/authorization/dialog"
            f"?client_id={self.settings.upstox_client_id}"
            f"&redirect_uri={self.settings.upstox_redirect_uri}"
            "&response_type=code"
        )

    async def exchange_code(self, code: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(
                f"{self.base}/login/authorization/token",
                data={
                    "code": code,
                    "client_id": self.settings.upstox_client_id,
                    "client_secret": self.settings.upstox_client_secret,
                    "redirect_uri": self.settings.upstox_redirect_uri,
                    "grant_type": "authorization_code",
                },
                headers={"Accept": "application/json"},
            )
            r.raise_for_status()
            return r.json()

    async def ltp(self, instrument_keys: list[str]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                f"{self.base}/market-quote/ltp",
                params={"instrument_key": ",".join(instrument_keys)},
                headers=self._headers(),
            )
            r.raise_for_status()
            return r.json()

    async def historical_candles(
        self, instrument_key: str, interval: str, from_date: str, to_date: str
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(
                f"{self.base}/historical-candle/{instrument_key}/{interval}/{to_date}/{from_date}",
                headers=self._headers(),
            )
            r.raise_for_status()
            return r.json()

    async def place_order(self, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(
                f"{self.base}/order/place",
                json=payload,
                headers={**self._headers(), "Content-Type": "application/json"},
            )
            r.raise_for_status()
            return r.json()
