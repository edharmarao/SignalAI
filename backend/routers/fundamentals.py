"""Fundamentals data router - Yahoo Finance API integration."""
from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from services.yahoo_fundamentals import (
    fetch_and_store_fundamentals,
    get_fundamentals_info,
    get_fundamentals_quarterly,
    get_fundamentals_yearly,
    list_all_symbols_with_fundamentals,
)

logger = logging.getLogger("signal_ai")

router = APIRouter(prefix="/api/v1/fundamentals", tags=["fundamentals"])


# ── Helper Functions ──────────────────────────────────────────────────────────


def format_to_crores(value: Any) -> float | None:
    """Convert large numbers to Crores with single decimal precision.

    Examples:
        17815499177984 -> 1781550.0 (displayed as "1781550.0 Cr" or "17.8 L Cr")
        1000000000 -> 1000.0 (displayed as "1000.0 Cr")
        500000000 -> 500.0 (displayed as "500.0 Cr")
    """
    if value is None or value == "":
        return None
    try:
        num = float(value)
        # Convert to Crores (1 Crore = 10 million = 10^7)
        crores = num / 10000000
        return round(crores, 1)
    except (ValueError, TypeError):
        return None


def format_financials(data: dict) -> dict:
    """Format financial numbers to Crores with single decimal.

    Applies formatting to:
    - Market cap, enterprise value
    - Revenue, profit, EBITDA
    - Cash, debt, assets, liabilities
    - All other large financial numbers
    """
    # Fields to convert to Crores (all BIGINT fields representing money)
    # Note: Using a set to avoid duplicate conversions
    crore_fields = {
        # Company info fields
        "market_cap", "enterprise_value", "shares_outstanding", "float_shares",
        "total_cash", "total_debt", "total_revenue", "gross_profits",
        "free_cashflow", "operating_cashflow", "ebitda",
        # Quarterly/Yearly fields
        "gross_profit", "operating_income", "net_income",
        "total_assets", "total_liabilities", "stockholders_equity",
        "current_assets", "current_liabilities", "cash_and_equivalents",
        "investing_cashflow", "financing_cashflow", "capital_expenditure"
    }

    formatted = data.copy()
    for field in crore_fields:
        if field in formatted and formatted[field] is not None:
            formatted[field] = format_to_crores(formatted[field])

    return formatted


# ── Request/Response Models ──────────────────────────────────────────────────


class FetchFundamentalsRequest(BaseModel):
    """Request body for fetching fundamentals data."""

    symbols: list[str] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="List of NSE symbols (e.g., ['RELIANCE', 'TCS', 'INFY'])",
    )
    exchange: str = Field(
        "NSE",
        description="Exchange identifier (NSE, BSE, etc.)",
    )


class FetchFundamentalsResponse(BaseModel):
    """Response for fetch fundamentals operation."""

    status: Literal["success", "partial", "failed"]
    message: str
    total: int
    success: int
    failed: int
    details: list[dict[str, Any]]


class FundamentalsInfoResponse(BaseModel):
    """Response for company fundamentals info."""

    symbol: str
    info: dict[str, Any] | None
    quarterly: list[dict[str, Any]]
    yearly: list[dict[str, Any]]


class SymbolListResponse(BaseModel):
    """Response for list of symbols with fundamentals."""

    total: int
    symbols: list[dict[str, Any]]


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/fetch", response_model=FetchFundamentalsResponse)
async def fetch_fundamentals(req: FetchFundamentalsRequest):
    """Fetch and store fundamentals data for one or multiple symbols.

    This endpoint:
    - Fetches data from Yahoo Finance for the specified symbols
    - Stores company info, quarterly, and yearly financial data
    - Uses rate limiting (1 sec delay between symbols) to avoid API limits
    - Returns detailed results for each symbol

    Example:
        POST /api/v1/fundamentals/fetch
        {
            "symbols": ["RELIANCE", "TCS", "INFY"],
            "exchange": "NSE"
        }
    """
    try:
        logger.info(f"Fetching fundamentals for {len(req.symbols)} symbols: {req.symbols}")

        results = await fetch_and_store_fundamentals(req.symbols, req.exchange)

        # Determine overall status
        if results["failed"] == 0:
            status = "success"
            message = f"Successfully fetched and stored fundamentals for all {results['success']} symbols"
        elif results["success"] == 0:
            status = "failed"
            message = f"Failed to fetch fundamentals for all {results['failed']} symbols"
        else:
            status = "partial"
            message = f"Fetched {results['success']} symbols successfully, {results['failed']} failed"

        return FetchFundamentalsResponse(
            status=status,
            message=message,
            total=results["total"],
            success=results["success"],
            failed=results["failed"],
            details=results["details"],
        )

    except Exception as e:
        logger.error(f"Error in fetch_fundamentals: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{symbol}", response_model=FundamentalsInfoResponse)
async def get_fundamentals(
    symbol: str,
    quarterly_limit: int = Query(8, ge=1, le=20, description="Number of quarterly periods to return"),
    yearly_limit: int = Query(5, ge=1, le=10, description="Number of yearly periods to return"),
):
    """Retrieve stored fundamentals data for a specific symbol.

    Returns:
    - Company info (market cap, PE ratio, sector, etc.)
    - Recent quarterly financials
    - Recent yearly financials

    Example:
        GET /api/v1/fundamentals/RELIANCE?quarterly_limit=8&yearly_limit=5
    """
    try:
        symbol = symbol.upper()

        info = await get_fundamentals_info(symbol)
        if not info:
            raise HTTPException(
                status_code=404,
                detail=f"No fundamentals data found for symbol: {symbol}. Use POST /fetch to import data first.",
            )

        quarterly = await get_fundamentals_quarterly(symbol, quarterly_limit)
        yearly = await get_fundamentals_yearly(symbol, yearly_limit)

        # Format all financial values to Crores
        formatted_info = format_financials(info) if info else None
        formatted_quarterly = [format_financials(q) for q in quarterly]
        formatted_yearly = [format_financials(y) for y in yearly]

        return FundamentalsInfoResponse(
            symbol=symbol,
            info=formatted_info,
            quarterly=formatted_quarterly,
            yearly=formatted_yearly,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving fundamentals for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=SymbolListResponse)
async def list_symbols():
    """List all symbols that have fundamentals data stored in the database.

    Returns basic info for each symbol (name, sector, market cap, last updated).
    Sorted by market cap (descending).

    Example:
        GET /api/v1/fundamentals/
    """
    try:
        symbols = await list_all_symbols_with_fundamentals()

        # Format market cap to Crores for display
        formatted_symbols = [format_financials(s) for s in symbols]

        return SymbolListResponse(
            total=len(formatted_symbols),
            symbols=formatted_symbols,
        )

    except Exception as e:
        logger.error(f"Error listing symbols: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{symbol}")
async def delete_fundamentals(symbol: str):
    """Delete all fundamentals data for a specific symbol.

    Removes data from:
    - fundamentals_info
    - fundamentals_quarterly
    - fundamentals_yearly

    Example:
        DELETE /api/v1/fundamentals/RELIANCE
    """
    try:
        from db import db_execute

        symbol = symbol.upper()

        # Delete from all three tables
        db_execute("DELETE FROM fundamentals_info WHERE symbol = %s", (symbol,))
        db_execute("DELETE FROM fundamentals_quarterly WHERE symbol = %s", (symbol,))
        db_execute("DELETE FROM fundamentals_yearly WHERE symbol = %s", (symbol,))

        logger.info(f"Deleted fundamentals data for symbol: {symbol}")

        return {
            "status": "success",
            "message": f"Deleted all fundamentals data for {symbol}",
        }

    except Exception as e:
        logger.error(f"Error deleting fundamentals for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
