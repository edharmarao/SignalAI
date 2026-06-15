"""Upstox REST wrapper (v2 for orders/auth, v3 for historical data).

Uses httpx; safe to instantiate without credentials.

Historical data methods ported from vasudha-backend (UpstoxService).
v3 API format: /v3/historical-candle/{encoded_symbol}/{interval_type}/{interval_value}/{to}/{from}
Symbol format: NSE_EQ|<ISIN>  (URL-encoded)

NOTE: We never place real orders unless `mode == 'live'` AND `ALLOW_LIVE_TRADING=true`
AND the user has an active broker connection. See routers/orders.py.
"""
from __future__ import annotations

import logging
from typing import Any, Optional
from urllib.parse import quote

import httpx

from ..config import get_settings

logger = logging.getLogger("signal_ai")

# Upstox v3 API base (separate from v2 used for orders/auth)
_V3_BASE = "https://api.upstox.com"

# Exchanges supported for equity/F&O historical data
VALID_EXCHANGES: frozenset[str] = frozenset({"NSE_EQ", "BSE_EQ", "NSE_FO", "BSE_FO", "MCX_FO"})

# Upstox interval constraints (from vasudha-backend validation logic):
#   minutes: 1-300  |  hours: 1-5  |  days/weeks/months: 1
_VALID_INTERVALS: dict[str, tuple[int, int]] = {
    "minutes": (1, 300),
    "hours": (1, 5),
    "days": (1, 1),
    "weeks": (1, 1),
    "months": (1, 1),
}

# Map our internal timeframe codes → (interval_type, interval_value)
TIMEFRAME_TO_UPSTOX: dict[str, tuple[str, str]] = {
    "5m":  ("minutes", "5"),
    "15m": ("minutes", "15"),
    "1H":  ("hours", "1"),
    "1D":  ("days", "1"),
    "1W":  ("weeks", "1"),
    "1M":  ("months", "1"),
    "1Y":  ("months", "1"),  # 1Y uses months with a wider date range
}


class UpstoxClient:
    def __init__(self, access_token: Optional[str] = None):
        self.settings = get_settings()
        self.access_token = access_token
        self.base = self.settings.upstox_base_url  # v2

    # ── Internal helpers ─────────────────────────────────────────────────────

    def _headers(self) -> dict[str, str]:
        h = {"Accept": "application/json"}
        if self.access_token:
            h["Authorization"] = f"Bearer {self.access_token}"
        return h

    @staticmethod
    def _encode_instrument(exchange: str, isin: str) -> str:
        """Build URL-encoded instrument key: 'NSE_EQ|INE848E01016' → percent-encoded."""
        return quote(f"{exchange}|{isin}", safe="")

    @staticmethod
    def _format_candle_response(raw: dict[str, Any]) -> list[dict[str, Any]]:
        """Parse Upstox v3 candle array into clean dicts.

        Upstox format: ["2025-01-02T00:00:00+05:30", open, high, low, close, volume, oi]
        Our format:    {"time": "2025-01-02 00:00:00", "open", "high", "low", "close", "volume", "oi"}
        """
        candles_raw = raw.get("data", {}).get("candles", [])
        result = []
        for c in candles_raw:
            ts = str(c[0]).split("+")[0].split(".")[0].replace("T", " ")
            result.append({
                "time":   ts,
                "open":   float(c[1]),
                "high":   float(c[2]),
                "low":    float(c[3]),
                "close":  float(c[4]),
                "volume": int(c[5]),
                "oi":     int(c[6]) if len(c) > 6 else 0,
            })
        return result

    # ── Auth / OAuth ──────────────────────────────────────────────────────────

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

    # ── Market data (v2) ──────────────────────────────────────────────────────

    async def ltp(self, instrument_keys: list[str]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(
                f"{self.base}/market-quote/ltp",
                params={"instrument_key": ",".join(instrument_keys)},
                headers=self._headers(),
            )
            r.raise_for_status()
            return r.json()

    # ── Historical data (v3) — sync, matching vasudha-backend UpstoxService ──

    def historical_candles_v3(
        self,
        exchange: str,
        isin: str,
        interval_type: str,
        interval_value: str,
        from_date: str,
        to_date: str,
    ) -> list[dict[str, Any]]:
        """Fetch historical OHLCV candles using Upstox v3 API (synchronous).

        Args:
            exchange: e.g. "NSE_EQ", "BSE_EQ"
            isin: Instrument ISIN e.g. "INE848E01016"
            interval_type: "minutes" | "hours" | "days" | "weeks" | "months"
            interval_value: e.g. "1", "5", "15"
            from_date: "YYYY-MM-DD"
            to_date: "YYYY-MM-DD"

        Returns:
            List of candle dicts with keys: time, open, high, low, close, volume, oi
        """
        encoded = self._encode_instrument(exchange, isin)
        url = f"{_V3_BASE}/v3/historical-candle/{encoded}/{interval_type}/{interval_value}/{to_date}/{from_date}"
        logger.info("Upstox v3 historical request: %s", url)

        with httpx.Client(timeout=30) as c:
            r = c.get(url, headers=self._headers())
            if r.status_code != 200:
                logger.error("Upstox API error: %s", r.text)
                raise Exception(f"Upstox API returned status {r.status_code}: {r.text}")
            return self._format_candle_response(r.json())

    def intraday_candles_v3(
        self,
        exchange: str,
        isin: str,
        interval_type: str,
        interval_value: str,
    ) -> list[dict[str, Any]]:
        """Fetch today's intraday candles using Upstox v3 intraday endpoint (synchronous).

        Args:
            exchange: e.g. "NSE_EQ"
            isin: Instrument ISIN
            interval_type: "minutes" | "hours" | "days"
            interval_value: e.g. "1", "5", "15"

        Returns:
            List of candle dicts (same format as historical_candles_v3)
        """
        encoded = self._encode_instrument(exchange, isin)
        url = f"{_V3_BASE}/v3/historical-candle/intraday/{encoded}/{interval_type}/{interval_value}"
        logger.info("Upstox v3 intraday request: %s", url)

        with httpx.Client(timeout=20) as c:
            r = c.get(url, headers=self._headers())
            if r.status_code != 200:
                logger.error("Upstox Intraday API error: %s", r.text)
                raise Exception(f"Upstox Intraday API returned status {r.status_code}: {r.text}")
            return self._format_candle_response(r.json())

    @staticmethod
    def validate_symbol(exchange: str, isin: str) -> bool:
        """Validate exchange segment and non-empty ISIN."""
        return exchange in VALID_EXCHANGES and bool(isin.strip())

    @staticmethod
    def validate_interval(interval_type: str, interval_value: str) -> bool:
        """Validate interval type and value against Upstox API constraints."""
        if not interval_value.isdigit():
            return False
        value = int(interval_value)
        bounds = _VALID_INTERVALS.get(interval_type)
        if bounds is None:
            return False
        return bounds[0] <= value <= bounds[1]

    # ── Orders (v2) ───────────────────────────────────────────────────────────

    async def historical_candles(
        self, instrument_key: str, interval: str, from_date: str, to_date: str
    ) -> dict[str, Any]:
        """Legacy v2 historical candles endpoint (kept for backward compat)."""
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
