from __future__ import annotations
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..services.ws_manager import ws_manager

router = APIRouter()


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # we ignore client messages for now
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
