"""Screener.in fundamentals download API."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import get_current_user
from services.screener_service import ScreenerConfigurationError, ScreenerService

logger = logging.getLogger("signal_ai")
router = APIRouter(prefix="/api/v1/fundamentals/screener", tags=["screener"])


@router.post("/cancel")
def cancel_screener_import(user: dict = Depends(get_current_user)) -> dict[str, str]:
    """Request that the active Screener import stop at the next safe boundary."""
    del user
    ScreenerService.request_cancel()
    return {"status": "stopping"}


@router.get("/logs/tail")
def screener_log_tail(lines: int = 80, user: dict = Depends(get_current_user)) -> dict[str, Any]:
    """Return the most recent application log lines for an active import."""
    del user
    log_dir = Path(os.getenv("LOG_DIR", Path(__file__).resolve().parents[2] / "logs"))
    log_file = log_dir / "signal_ai.log"
    try:
        content = log_file.read_text(encoding="utf-8", errors="replace")
    except FileNotFoundError:
        return {"lines": [], "file": str(log_file)}
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not read log file: {exc}") from exc

    limit = max(1, min(lines, 500))
    return {"lines": content.splitlines()[-limit:], "file": str(log_file)}


class ScreenerDownloadRequest(BaseModel):
    """Request body for downloading Screener.in reports."""

    symbols: list[str] = Field(..., min_length=1, max_length=50)


class ScreenerBulkDownloadRequest(BaseModel):
    """Request body for a multi-batch Screener download."""

    symbols: list[str] | None = Field(default=None, max_length=1000)
    universe: Literal[
        "NIFTY_50", "NIFTY_100", "NIFTY_150", "NIFTY_200",
        "NIFTY_250", "NIFTY_300", "NIFTY_350", "NIFTY_400",
        "NIFTY_450", "NIFTY_500", "NIFTY_550", "NIFTY_600",
        "NIFTY_650", "NIFTY_700", "NIFTY_750",
    ] | None = None


class ScreenerDownloadResponse(BaseModel):
    total: int
    success: int
    failed: int
    downloaded_files: list[str]
    failed_downloads: list[dict[str, str]]


class ScreenerBulkDownloadResponse(ScreenerDownloadResponse):
    batches: int
    batch_results: list[dict[str, Any]]


@router.post("/download", response_model=ScreenerDownloadResponse)
async def download_screener_fundamentals(
    request: ScreenerDownloadRequest,
) -> ScreenerDownloadResponse:
    """Download Excel fundamentals reports for the requested symbols."""
    try:
        results: dict[str, Any] = await ScreenerService().download_multiple(request.symbols)
        return ScreenerDownloadResponse(**results)
    except ScreenerConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Screener download failed")
        raise HTTPException(status_code=502, detail="Screener.in download failed") from exc


@router.post("/bulk-download", response_model=ScreenerBulkDownloadResponse)
async def bulk_download_screener_fundamentals(
    request: ScreenerBulkDownloadRequest,
) -> ScreenerBulkDownloadResponse:
    """Download stock-master symbols in sequential batches of 50.

    Omit ``symbols`` to process every symbol in ``nse_eq_symbols``.
    """
    try:
        results: dict[str, Any] = await ScreenerService().download_in_batches(
            request.symbols,
            universe=request.universe,
        )
        return ScreenerBulkDownloadResponse(**results)
    except ScreenerConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Bulk Screener download failed")
        raise HTTPException(status_code=502, detail="Screener bulk download failed") from exc


@router.post("/rendered-download", response_model=ScreenerDownloadResponse)
async def rendered_download_screener_fundamentals(
    request: ScreenerDownloadRequest,
) -> ScreenerDownloadResponse:
    """Import rendered consolidated Screener pages through Playwright."""
    try:
        results: dict[str, Any] = await ScreenerService().download_rendered_multiple(request.symbols)
        return ScreenerDownloadResponse(**results)
    except ScreenerConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Rendered Screener download failed")
        raise HTTPException(status_code=502, detail="Rendered Screener download failed") from exc


@router.post("/bulk-rendered-download", response_model=ScreenerBulkDownloadResponse)
async def bulk_rendered_download_screener_fundamentals(
    request: ScreenerBulkDownloadRequest,
) -> ScreenerBulkDownloadResponse:
    """Import consolidated Screener pages in browser batches of 25."""
    try:
        results: dict[str, Any] = await ScreenerService().download_rendered_in_batches(
            request.symbols,
            universe=request.universe,
        )
        return ScreenerBulkDownloadResponse(**results)
    except ScreenerConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Bulk rendered Screener download failed")
        raise HTTPException(status_code=502, detail="Bulk rendered Screener download failed") from exc