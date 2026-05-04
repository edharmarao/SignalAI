from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import strategies, backtest, instruments, prices, orders, broker, records, ws

settings = get_settings()

app = FastAPI(
    title="Signal AI API",
    description="Options trading strategy builder backend. Paper trading is the default; "
                "real orders require ALLOW_LIVE_TRADING=true and an active broker connection.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "name": "Signal AI API",
        "version": "0.1.0",
        "live_trading_enabled": settings.allow_live_trading,
        "disclaimer": "For education only. Trading involves risk.",
    }


@app.get("/health")
def health():
    return {"ok": True}


app.include_router(strategies.router)
app.include_router(backtest.router)
app.include_router(instruments.router)
app.include_router(prices.router)
app.include_router(orders.router)
app.include_router(broker.router)
app.include_router(records.router)
app.include_router(ws.router)
