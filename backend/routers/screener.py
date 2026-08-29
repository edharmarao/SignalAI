"""Screener.in fundamentals download API."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.screener_service import ScreenerConfigurationError, ScreenerService

logger = logging.getLogger("signal_ai")
router = APIRouter(prefix="/api/v1/fundamentals/screener", tags=["screener"])


class ScreenerDownloadRequest(BaseModel):
    """Request body for downloading Screener.in reports."""

    symbols: list[str] = Field(..., min_length=1, max_length=50)


class ScreenerDownloadResponse(BaseModel):
    total: int
    success: int
    failed: int
    downloaded_files: list[str]
    failed_downloads: list[dict[str, str]]


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