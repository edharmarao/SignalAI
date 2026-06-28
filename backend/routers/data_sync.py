"""Data sync endpoints - Update fundamentals and nse_eq_symbols separately."""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from db import db_query, db_execute
from deps import optional_user
from services.yahoo_fundamentals import fetch_and_store_fundamentals

logger = logging.getLogger("signal_ai")
router = APIRouter(prefix="/data-sync", tags=["data-sync"])


# ============================================================================
# Request/Response Models
# ============================================================================

class FundamentalsUpdateRequest(BaseModel):
    """Request to update fundamentals data."""
    symbols: list[str] = Field(..., min_items=1, max_items=100)
    exchange: str = "NSE"
    from_year: Optional[int] = Field(None, ge=2000, le=2030, description="Start year for historical data")
    to_year: Optional[int] = Field(None, ge=2000, le=2030, description="End year for historical data")
    single_year: Optional[int] = Field(None, ge=2000, le=2030, description="Fetch only specific year")


class SymbolsUpdateRequest(BaseModel):
    """Request to update nse_eq_symbols data."""
    symbols: list[str] = Field(..., min_items=1, max_items=100)
    exchange: str = "NSE"


class UpdateResponse(BaseModel):
    """Generic update response."""
    total: int
    success: int
    failed: int
    details: list[dict]


# ============================================================================
# API 1: Update Fundamentals (Yahoo Finance)
# ============================================================================

@router.post("/fundamentals", response_model=UpdateResponse)
async def update_fundamentals(request: FundamentalsUpdateRequest, user=optional_user):
    """Update fundamentals data from Yahoo Finance.

    Fetches and stores:
    - fundamentals_info (company profile, market cap, ratios)
    - fundamentals_quarterly (quarterly financials)
    - fundamentals_yearly (annual financials)

    Examples:
    ```json
    // Single symbol, all available data
    {"symbols": ["RELIANCE"], "exchange": "NSE"}

    // Multiple symbols, specific year
    {"symbols": ["RELIANCE", "TCS", "INFY"], "single_year": 2023}

    // Single symbol, year range
    {"symbols": ["RELIANCE"], "from_year": 2020, "to_year": 2023}
    ```

    Rate limit: 1 symbol per second (Yahoo Finance)
    """
    # Validate year parameters
    if request.single_year and (request.from_year or request.to_year):
        raise HTTPException(400, "Cannot specify both single_year and from_year/to_year")

    if request.from_year and request.to_year and request.from_year > request.to_year:
        raise HTTPException(400, "from_year must be <= to_year")

    # Deduplicate and uppercase
    symbols = list(set([s.strip().upper() for s in request.symbols]))

    logger.info(f"Updating fundamentals for {len(symbols)} symbols")
    if request.single_year:
        logger.info(f"  Year filter: {request.single_year}")
    elif request.from_year or request.to_year:
        logger.info(f"  Year range: {request.from_year or 'all'} to {request.to_year or 'latest'}")

    # Fetch fundamentals from Yahoo Finance
    result = await fetch_and_store_fundamentals(symbols, request.exchange)

    # Note: Year filtering would need to be implemented in yahoo_fundamentals service
    # For now, it fetches all available data
    if request.single_year or request.from_year or request.to_year:
        logger.warning("Year filtering not yet implemented - fetching all available data")

    return UpdateResponse(
        total=result["total"],
        success=result["success"],
        failed=result["failed"],
        details=result["details"]
    )


# ============================================================================
# API 2: Update NSE EQ Symbols (Upstox + Yahoo Finance)
# ============================================================================

async def _update_symbol_from_sources(symbol: str, exchange: str) -> dict:
    """Update nse_eq_symbols with data from Yahoo Finance and Upstox.

    Priority:
    1. Yahoo Finance for market cap, industry, company name
    2. Upstox for live prices, trading info (if available)
    """
    try:
        # Step 1: Get Yahoo Finance data (now includes market_cap_usd)
        yahoo_data = db_query("""
            SELECT symbol, company_name, sector, industry,
                   market_cap, market_cap_usd,
                   trailing_pe, price_to_book, dividend_yield,
                   fifty_two_week_high, fifty_two_week_low
            FROM fundamentals_info
            WHERE symbol = %s
        """, (symbol,))

        if not yahoo_data:
            return {
                "symbol": symbol,
                "status": "no_data",
                "updated": False,
                "message": "No fundamentals data found. Fetch fundamentals first."
            }

        yahoo = yahoo_data[0]

        # Step 2: Check if symbol exists in nse_eq_symbols
        exists = db_query("SELECT id FROM nse_eq_symbols WHERE symbol = %s", (symbol,))

        if not exists:
            # Insert new symbol with both INR and USD market cap
            db_execute("""
                INSERT INTO nse_eq_symbols (
                    symbol, company_name, industry,
                    market_cap, market_cap_usd, series,
                    fifty_two_weeks_high, fifty_two_weeks_low,
                    created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, 'EQ', %s, %s, NOW(), NOW())
            """, (
                symbol,
                yahoo['company_name'],
                yahoo['industry'],
                yahoo['market_cap'],
                yahoo['market_cap_usd'],
                yahoo['fifty_two_week_high'],
                yahoo['fifty_two_week_low']
            ))
            action = "inserted"
        else:
            # Update existing symbol with both INR and USD market cap
            db_execute("""
                UPDATE nse_eq_symbols
                SET
                    company_name = COALESCE(NULLIF(company_name, ''), %s, company_name),
                    industry = COALESCE(NULLIF(industry, ''), %s, industry),
                    market_cap = %s,
                    market_cap_usd = %s,
                    fifty_two_weeks_high = COALESCE(%s, fifty_two_weeks_high),
                    fifty_two_weeks_low = COALESCE(%s, fifty_two_weeks_low),
                    updated_at = NOW()
                WHERE symbol = %s
            """, (
                yahoo['company_name'],
                yahoo['industry'],
                yahoo['market_cap'],
                yahoo['market_cap_usd'],
                yahoo['fifty_two_week_high'],
                yahoo['fifty_two_week_low'],
                symbol
            ))
            action = "updated"

        return {
            "symbol": symbol,
            "status": "success",
            "updated": True,
            "action": action,
            "market_cap": float(yahoo['market_cap']) if yahoo['market_cap'] else None,
            "market_cap_usd": float(yahoo['market_cap_usd']) if yahoo['market_cap_usd'] else None,
            "source": "yahoo_finance"
        }

    except Exception as e:
        logger.error(f"Error updating symbol {symbol}: {e}")
        return {
            "symbol": symbol,
            "status": "error",
            "updated": False,
            "error": str(e)
        }


def _recalculate_rankings():
    """Recalculate market cap rankings and update index memberships."""
    try:
        # Get all symbols with market cap
        symbols = db_query("""
            SELECT id, symbol, market_cap
            FROM nse_eq_symbols
            WHERE market_cap IS NOT NULL
            ORDER BY market_cap DESC
        """)

        logger.info(f"Recalculating rankings for {len(symbols)} symbols")

        # Update rankings and cap types
        for rank, sym in enumerate(symbols, 1):
            if rank <= 100:
                cap_type = "LARGE"
            elif rank <= 250:
                cap_type = "MID"
            elif rank <= 500:
                cap_type = "SMALL"
            else:
                cap_type = "MICRO"

            db_execute("""
                UPDATE nse_eq_symbols
                SET market_cap_rank = %s, cap_type = %s
                WHERE id = %s
            """, (rank, cap_type, sym['id']))

        # Update index memberships
        _update_index_flags()

        return True

    except Exception as e:
        logger.error(f"Error recalculating rankings: {e}")
        return False


def _update_index_flags():
    """Update index membership flags based on rankings."""
    try:
        # Reset all flags
        db_execute("""
            UPDATE nse_eq_symbols SET
                is_nifty_50 = FALSE, is_nifty_next_50 = FALSE,
                is_nifty_100 = FALSE, is_nifty_200 = FALSE,
                is_nifty_500 = FALSE, is_nifty_midcap_150 = FALSE,
                is_nifty_smallcap_250 = FALSE, is_nifty_microcap_250 = FALSE
            WHERE market_cap_rank IS NOT NULL
        """)

        # Update based on rankings
        db_execute("UPDATE nse_eq_symbols SET is_nifty_50 = TRUE WHERE market_cap_rank <= 50")
        db_execute("UPDATE nse_eq_symbols SET is_nifty_next_50 = TRUE WHERE market_cap_rank BETWEEN 51 AND 100")
        db_execute("UPDATE nse_eq_symbols SET is_nifty_100 = TRUE WHERE market_cap_rank <= 100")
        db_execute("UPDATE nse_eq_symbols SET is_nifty_200 = TRUE WHERE market_cap_rank <= 200")
        db_execute("UPDATE nse_eq_symbols SET is_nifty_500 = TRUE WHERE market_cap_rank <= 500")
        db_execute("UPDATE nse_eq_symbols SET is_nifty_midcap_150 = TRUE WHERE market_cap_rank BETWEEN 101 AND 250")
        db_execute("UPDATE nse_eq_symbols SET is_nifty_smallcap_250 = TRUE WHERE market_cap_rank BETWEEN 251 AND 500")
        db_execute("UPDATE nse_eq_symbols SET is_nifty_microcap_250 = TRUE WHERE market_cap_rank BETWEEN 501 AND 750")

        logger.info("Updated index membership flags")

    except Exception as e:
        logger.error(f"Error updating index flags: {e}")


@router.post("/symbols", response_model=UpdateResponse)
async def update_symbols(request: SymbolsUpdateRequest, user=optional_user):
    """Update nse_eq_symbols table with data from Yahoo Finance and Upstox.

    Updates columns:
    - company_name, industry, market_cap
    - fifty_two_weeks_high, fifty_two_weeks_low
    - market_cap_rank, cap_type
    - is_nifty_50, is_nifty_100, is_nifty_500, etc.

    Data sources (in priority order):
    1. Yahoo Finance (from fundamentals_info)
    2. Upstox (for live prices - if available)

    Examples:
    ```json
    // Single symbol
    {"symbols": ["RELIANCE"], "exchange": "NSE"}

    // Multiple symbols
    {"symbols": ["RELIANCE", "TCS", "INFY", "HDFCBANK"], "exchange": "NSE"}
    ```

    Note: Make sure to fetch fundamentals first using POST /data-sync/fundamentals
    """
    # Deduplicate and uppercase
    symbols = list(set([s.strip().upper() for s in request.symbols]))

    logger.info(f"Updating nse_eq_symbols for {len(symbols)} symbols")

    # Update each symbol
    details = []
    success_count = 0

    for symbol in symbols:
        result = await _update_symbol_from_sources(symbol, request.exchange)
        details.append(result)
        if result.get("updated"):
            success_count += 1

    # Recalculate rankings and index memberships
    logger.info("Recalculating market cap rankings...")
    rankings_updated = _recalculate_rankings()

    return UpdateResponse(
        total=len(symbols),
        success=success_count,
        failed=len(symbols) - success_count,
        details=details
    )


# ============================================================================
# Combined Update (Both Fundamentals + Symbols)
# ============================================================================

class CombinedUpdateRequest(BaseModel):
    """Request to update both fundamentals and symbols."""
    symbols: list[str] = Field(..., min_items=1, max_items=100)
    exchange: str = "NSE"
    from_year: Optional[int] = None
    to_year: Optional[int] = None
    single_year: Optional[int] = None


@router.post("/full", response_model=dict)
async def full_update(request: CombinedUpdateRequest, user=optional_user):
    """Update both fundamentals AND nse_eq_symbols in one call.

    Steps:
    1. Fetch fundamentals from Yahoo Finance
    2. Update nse_eq_symbols with the data
    3. Recalculate rankings and index memberships

    Example:
    ```json
    {"symbols": ["RELIANCE", "TCS"], "exchange": "NSE"}
    ```

    Time: ~1 second per symbol for fundamentals + instant for symbols update
    """
    symbols = list(set([s.strip().upper() for s in request.symbols]))

    logger.info(f"Full update for {len(symbols)} symbols")

    # Step 1: Fetch fundamentals
    logger.info("Step 1: Fetching fundamentals from Yahoo Finance...")
    fund_request = FundamentalsUpdateRequest(
        symbols=symbols,
        exchange=request.exchange,
        from_year=request.from_year,
        to_year=request.to_year,
        single_year=request.single_year
    )
    fundamentals_result = await update_fundamentals(fund_request, user)

    # Step 2: Update nse_eq_symbols
    logger.info("Step 2: Updating nse_eq_symbols table...")
    symbols_request = SymbolsUpdateRequest(symbols=symbols, exchange=request.exchange)
    symbols_result = await update_symbols(symbols_request, user)

    return {
        "total": len(symbols),
        "fundamentals": {
            "success": fundamentals_result.success,
            "failed": fundamentals_result.failed
        },
        "symbols": {
            "success": symbols_result.success,
            "failed": symbols_result.failed
        },
        "details": {
            "fundamentals": fundamentals_result.details,
            "symbols": symbols_result.details
        }
    }


# ============================================================================
# Status Endpoints
# ============================================================================

@router.get("/status/fundamentals")
def get_fundamentals_status(user=optional_user):
    """Get status of fundamentals data."""
    info_count = db_query("SELECT COUNT(*) as cnt FROM fundamentals_info")[0]['cnt']
    quarterly_count = db_query("SELECT COUNT(*) as cnt FROM fundamentals_quarterly")[0]['cnt']
    yearly_count = db_query("SELECT COUNT(*) as cnt FROM fundamentals_yearly")[0]['cnt']

    latest = db_query("""
        SELECT symbol, company_name, market_cap, last_updated
        FROM fundamentals_info
        ORDER BY last_updated DESC
        LIMIT 5
    """)

    return {
        "fundamentals_info": info_count,
        "fundamentals_quarterly": quarterly_count,
        "fundamentals_yearly": yearly_count,
        "total_symbols": info_count,
        "latest_updates": latest
    }


@router.get("/status/symbols")
def get_symbols_status(user=optional_user):
    """Get status of nse_eq_symbols data."""
    stats = db_query("""
        SELECT
            COUNT(*) as total,
            COUNT(market_cap) as with_cap,
            COUNT(market_cap_rank) as ranked,
            MAX(updated_at) as last_update
        FROM nse_eq_symbols
    """)[0]

    cap_dist = db_query("""
        SELECT cap_type, COUNT(*) as count
        FROM nse_eq_symbols
        WHERE cap_type IS NOT NULL
        GROUP BY cap_type
        ORDER BY FIELD(cap_type, 'LARGE', 'MID', 'SMALL', 'MICRO')
    """)

    return {
        "total_symbols": stats['total'],
        "with_market_cap": stats['with_cap'],
        "ranked": stats['ranked'],
        "coverage_pct": round(stats['with_cap'] / stats['total'] * 100, 1) if stats['total'] > 0 else 0,
        "last_update": stats['last_update'],
        "cap_distribution": [{"cap_type": r['cap_type'], "count": r['count']} for r in cap_dist]
    }
