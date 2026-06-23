from __future__ import annotations

# Force IST timezone for the entire process — all stock data is in IST
import os, time as _time
os.environ.setdefault("TZ", "Asia/Kolkata")
try:
    _time.tzset()          # Apply on Linux/macOS; no-op on Windows
except AttributeError:
    pass

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
from .routers import strategies, backtest, instruments, prices, orders, broker, records, ws, charts, upstox as upstox_router, orb as orb_router, system as system_router
from .routers.auth import router as auth_router

logger = logging.getLogger("signal_ai")
_START_TIME = time.time()

import sys

# ANSI colours — only when stdout is a real terminal (not a log file)
def _ansi(code: str) -> str:
    return code if sys.stdout.isatty() else ""

_GREEN  = _ansi("\033[92m")
_RED    = _ansi("\033[91m")
_YELLOW = _ansi("\033[93m")
_CYAN   = _ansi("\033[96m")
_BOLD   = _ansi("\033[1m")
_RESET  = _ansi("\033[0m")


def _print_connection_status() -> None:
    """Print a startup banner showing connection status for all services."""
    s = get_settings()

    results: list[tuple[str, str, str, bool]] = []  # (service, host, detail, ok)

    # ── MySQL ──────────────────────────────────────────────────────────────
    try:
        import pymysql
        conn = pymysql.connect(
            host=s.mysql_host, port=s.mysql_port,
            user=s.mysql_user, password=s.mysql_password,
            database=s.mysql_database, connect_timeout=3,
        )
        conn.close()
        results.append(("MySQL   ", f"{s.mysql_host}:{s.mysql_port}", f"db={s.mysql_database}  user={s.mysql_user}", True))
    except Exception as e:
        results.append(("MySQL   ", f"{s.mysql_host}:{s.mysql_port}", str(e)[:60], False))

    # ── Redis ──────────────────────────────────────────────────────────────
    try:
        import redis as _redis
        r = _redis.Redis(
            host=s.redis_host, port=s.redis_port,
            password=s.redis_password or None,
            socket_connect_timeout=3,
        )
        r.ping()
        r.close()
        results.append(("Redis   ", f"{s.redis_host}:{s.redis_port}", "PONG", True))
    except Exception as e:
        results.append(("Redis   ", f"{s.redis_host}:{s.redis_port}", str(e)[:60], False))

    # ── Print banner ───────────────────────────────────────────────────────
    width = 72
    print(f"\n{_BOLD}{_CYAN}{'━' * width}{_RESET}")
    print(f"{_BOLD}{_CYAN}  Signal AI — Service Connection Status{_RESET}")
    print(f"{_BOLD}{_CYAN}{'━' * width}{_RESET}")
    for service, host, detail, ok in results:
        status = f"{_GREEN}●  CONNECTED{_RESET}" if ok else f"{_RED}✗  FAILED   {_RESET}"
        print(f"  {_BOLD}{service}{_RESET}  {host:<26}  {status}  {detail}")
    print(f"{_BOLD}{_CYAN}{'━' * width}{_RESET}\n")


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

    # Only print banner from the first worker to avoid duplicate output in logs.
    # UVICORN_WORKER_ID is set via the startup script; fall back to checking
    # whether a lock file is absent (first process to create it wins).
    _banner_lock = os.path.join(os.path.dirname(__file__), ".banner_shown")
    try:
        fd = os.open(_banner_lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(fd)
        _print_connection_status()
    except FileExistsError:
        pass  # another worker already printed the banner

    # Pre-warm NSE instrument map in background (downloads Upstox CSV)
    import threading
    from .services.instrument_map import get_instrument_map as _prewarm_map
    threading.Thread(target=_prewarm_map, daemon=True).start()

    # Ensure stock_data_* tables exist
    try:
        from .db import ensure_stock_data_tables
        ensure_stock_data_tables()
    except Exception as exc:
        logger.warning("Could not ensure stock data tables: %s", exc)

    # Seed NSE index symbol membership table in background
    def _seed_indexes():
        try:
            from .migrations.seed_index_symbols import run_seed
            run_seed()
        except Exception as exc:
            logger.warning("Could not seed nse_symbol_indexes: %s", exc)
    threading.Thread(target=_seed_indexes, daemon=True).start()

    yield
    logger.info("Signal AI API shutting down")
    # Clean up banner lock so next startup prints again
    try:
        os.remove(_banner_lock)
    except OSError:
        pass


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
app.include_router(orb_router.router, prefix="/api/v1")
app.include_router(system_router.router, prefix="/api/v1")
app.include_router(ws.router)
