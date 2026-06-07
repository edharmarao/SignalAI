from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from .logging_config import configure_logging

configure_logging()

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .middleware import RequestContextMiddleware, SecurityHeadersMiddleware
from .routers import strategies, backtest, instruments, prices, orders, broker, records, ws, charts, upstox as upstox_router
from .routers.auth import router as auth_router

logger = logging.getLogger("signal_ai")
_START_TIME = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info(
        "Signal AI API starting",
        extra={
            "port": settings.api_port,
            "live_trading": settings.allow_live_trading,
            "origins": settings.origins,
        },
    )
    if settings.allow_live_trading:
        logger.warning("LIVE TRADING IS ENABLED — real orders will be placed!")
    yield
    logger.info("Signal AI API shutting down")


settings = get_settings()

app = FastAPI(
    title="Signal AI API",
    description=(
        "Multi-desk Indian trading platform: Equity, Options, Mutual Funds. "
        "Paper trading is the default; real orders require ALLOW_LIVE_TRADING=true."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "status": exc.status_code, "request_id": _request_id(request)},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [{"field": ".".join(str(l) for l in e["loc"]), "msg": e["msg"]} for e in exc.errors()]
    return JSONResponse(
        status_code=422,
        content={"error": "Validation failed", "details": errors, "status": 422, "request_id": _request_id(request)},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception", extra={"request_id": _request_id(request), "path": request.url.path})
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "status": 500, "request_id": _request_id(request)},
    )


@app.get("/", tags=["meta"])
def root():
    return {
        "name": "Signal AI API",
        "version": "1.0.0",
        "live_trading_enabled": settings.allow_live_trading,
        "disclaimer": "For education only. Trading involves risk.",
    }


@app.get("/health", tags=["meta"])
def health(request: Request):
    uptime_s = round(time.time() - _START_TIME, 1)
    return {
        "ok": True,
        "version": "1.0.0",
        "uptime_seconds": uptime_s,
        "environment": "live" if settings.allow_live_trading else "paper",
        "request_id": _request_id(request),
    }


app.include_router(auth_router, prefix="/api/v1")
app.include_router(strategies.router, prefix="/api/v1")
app.include_router(backtest.router, prefix="/api/v1")
app.include_router(instruments.router, prefix="/api/v1")
app.include_router(instruments.equity_router, prefix="/api/v1")
app.include_router(charts.router, prefix="/api/v1")
app.include_router(prices.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(broker.router, prefix="/api/v1")
app.include_router(records.router, prefix="/api/v1")
app.include_router(upstox_router.router, prefix="/api/v1")
app.include_router(ws.router)
