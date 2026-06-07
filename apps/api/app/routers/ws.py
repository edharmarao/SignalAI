from __future__ import annotations

import base64

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..deps import _validate
from ..services.ws_manager import ws_manager

router = APIRouter()


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    """WebSocket endpoint. Authenticate via ?token=base64(user:pass)."""
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return

    try:
        decoded = base64.b64decode(token).decode("utf-8")
        username, _, password = decoded.partition(":")
        if not _validate(username, password):
            raise ValueError("bad creds")
    except Exception:
        await websocket.close(code=1008)
        return

    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
