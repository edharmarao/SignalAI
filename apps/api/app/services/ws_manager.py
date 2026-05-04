"""WebSocket connection manager + tick simulator.

When Upstox credentials are configured, you can wire this up to upstox MarketDataFeed.
By default it broadcasts simulated ticks for the requested index, which is enough
for the strategy preview/dev loop."""
from __future__ import annotations
import asyncio
import json
import random
from time import time
from typing import Any
from fastapi import WebSocket


class WSManager:
    def __init__(self):
        self.connections: dict[str, set[WebSocket]] = {}
        self._task: asyncio.Task | None = None

    async def connect(self, ws: WebSocket, channel: str = "default"):
        await ws.accept()
        self.connections.setdefault(channel, set()).add(ws)
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._broadcast_loop())

    def disconnect(self, ws: WebSocket, channel: str = "default"):
        self.connections.get(channel, set()).discard(ws)

    async def broadcast(self, payload: dict[str, Any], channel: str = "default"):
        dead: list[WebSocket] = []
        for ws in list(self.connections.get(channel, set())):
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                dead.append(ws)
        for d in dead:
            self.disconnect(d, channel)

    async def _broadcast_loop(self):
        prices = {"NIFTY": 22500.0, "BANKNIFTY": 48000.0, "FINNIFTY": 21000.0, "SENSEX": 74000.0}
        while True:
            await asyncio.sleep(1.0)
            payload_items = []
            for sym, last in prices.items():
                drift = random.gauss(0, last * 0.0003)
                prices[sym] = max(1.0, last + drift)
                payload_items.append(
                    {"symbol": sym, "ltp": round(prices[sym], 2), "ts": int(time() * 1000)}
                )
            await self.broadcast({"type": "ticks", "data": payload_items})


ws_manager = WSManager()
