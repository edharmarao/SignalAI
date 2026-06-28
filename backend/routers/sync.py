"""Sync endpoint - Fetch Yahoo Finance data and sync to nse_eq_symbols."""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import db_query, db_execute
from deps import optional_user
from services.yahoo_fundamentals import fetch_and_store_fundamentals

logger = logging.getLogger("signal_ai")
router = APIRouter(prefix="/sync", tags=["sync"])


class SyncRequest(BaseModel):
    """Request to sync symbols."""
    symbols: list[str]
    exchange: str = "NSE"


class SyncResponse(BaseModel):
    """Response from sync operation."""
    total: int
    fundamentals_fetched: int
    fundamentals_failed: int
    symbols_updated: int
    cap_rankings_updated: bool
    details: list[dict]


def _calculate_cap_type(rank: int) -> str:
    """Determine cap type based on rank."""
    if rank <= 100:
        return "LARGE"
    elif rank <= 250:
        return "MID"
    elif rank <= 500:
        return "SMALL"
    else:
        return "MICRO"


def _update_symbol_from_fundamentals(symbol: str) -> dict:
    """Update nse_eq_symbols with data from fundamentals_info."""
    try:
        # Get fundamentals data
        fund = db_query("""
            SELECT symbol, company_name, sector, industry, market_cap
            FROM fundamentals_info
            WHERE symbol = %s
        """, (symbol,))

        if not fund:
            return {"symbol": symbol, "status": "no_fundamentals", "updated": False}

        fund_data = fund[0]

        # Update nse_eq_symbols
        db_execute("""
            UPDATE nse_eq_symbols
            SET
                market_cap = %s,
                industry = COALESCE(NULLIF(industry, ''), %s, industry),
                company_name = COALESCE(NULLIF(company_name, ''), %s, company_name),
                updated_at = NOW()
            WHERE symbol = %s
        """, (
            fund_data['market_cap'],
            fund_data['industry'],
            fund_data['company_name'],
            symbol
        ))

        return {
            "symbol": symbol,
            "status": "updated",
            "updated": True,
            "market_cap": float(fund_data['market_cap']) if fund_data['market_cap'] else None
        }

    except Exception as e:
        logger.error(f"Error updating symbol {symbol}: {e}")
        return {"symbol": symbol, "status": "error", "updated": False, "error": str(e)}


def _recalculate_rankings():
    """Recalculate market cap rankings and cap types for all symbols."""
    try:
        # Get all symbols with market cap, ordered by market cap
        symbols = db_query("""
            SELECT id, symbol, market_cap
            FROM nse_eq_symbols
            WHERE market_cap IS NOT NULL
            ORDER BY market_cap DESC
        """)

        logger.info(f"Recalculating rankings for {len(symbols)} symbols")

        for rank, sym in enumerate(symbols, 1):
            cap_type = _calculate_cap_type(rank)

            # Update rank and cap type
            db_execute("""
                UPDATE nse_eq_symbols
                SET
                    market_cap_rank = %s,
                    cap_type = %s
                WHERE id = %s
            """, (rank, cap_type, sym['id']))

        # Update index memberships based on rankings
        _update_index_memberships()

        return True

    except Exception as e:
        logger.error(f"Error recalculating rankings: {e}")
        return False


def _update_index_memberships():
    """Update index membership flags based on rankings."""
    try:
        # Reset all to FALSE first
        db_execute("""
            UPDATE nse_eq_symbols SET
                is_nifty_50 = FALSE,
                is_nifty_next_50 = FALSE,
                is_nifty_100 = FALSE,
                is_nifty_200 = FALSE,
                is_nifty_500 = FALSE,
                is_nifty_midcap_150 = FALSE,
                is_nifty_smallcap_250 = FALSE,
                is_nifty_microcap_250 = FALSE
            WHERE market_cap_rank IS NOT NULL
        """)

        # NIFTY 50
        db_execute("UPDATE nse_eq_symbols SET is_nifty_50 = TRUE WHERE market_cap_rank <= 50")

        # NIFTY Next 50
        db_execute("UPDATE nse_eq_symbols SET is_nifty_next_50 = TRUE WHERE market_cap_rank BETWEEN 51 AND 100")

        # NIFTY 100
        db_execute("UPDATE nse_eq_symbols SET is_nifty_100 = TRUE WHERE market_cap_rank <= 100")

        # NIFTY 200
        db_execute("UPDATE nse_eq_symbols SET is_nifty_200 = TRUE WHERE market_cap_rank <= 200")

        # NIFTY 500
        db_execute("UPDATE nse_eq_symbols SET is_nifty_500 = TRUE WHERE market_cap_rank <= 500")

        # NIFTY Midcap 150
        db_execute("UPDATE nse_eq_symbols SET is_nifty_midcap_150 = TRUE WHERE market_cap_rank BETWEEN 101 AND 250")

        # NIFTY Smallcap 250
        db_execute("UPDATE nse_eq_symbols SET is_nifty_smallcap_250 = TRUE WHERE market_cap_rank BETWEEN 251 AND 500")

        # NIFTY Microcap 250
        db_execute("UPDATE nse_eq_symbols SET is_nifty_microcap_250 = TRUE WHERE market_cap_rank BETWEEN 501 AND 750")

        logger.info("Updated index memberships")

    except Exception as e:
        logger.error(f"Error updating index memberships: {e}")


@router.post("/symbols", response_model=SyncResponse)
async def sync_symbols(request: SyncRequest, user=optional_user):
    """Fetch Yahoo Finance data and sync to nse_eq_symbols.

    This endpoint:
    1. Fetches fundamentals from Yahoo Finance
    2. Updates nse_eq_symbols with market cap and company data
    3. Recalculates market cap rankings
    4. Updates index membership flags

    Example:
    ```json
    {
        "symbols": ["RELIANCE", "TCS", "INFY"],
        "exchange": "NSE"
    }
    ```

    Rate limit: 1 symbol per second (Yahoo Finance constraint)
    Time estimate: ~N seconds for N symbols
    """
    if not request.symbols:
        raise HTTPException(400, "No symbols provided")

    if len(request.symbols) > 100:
        raise HTTPException(400, "Maximum 100 symbols per request")

    # Deduplicate and uppercase
    symbols = list(set([s.strip().upper() for s in request.symbols]))

    logger.info(f"Starting sync for {len(symbols)} symbols: {symbols}")

    # Step 1: Fetch fundamentals from Yahoo Finance
    logger.info("Step 1: Fetching fundamentals from Yahoo Finance...")
    fundamentals_result = await fetch_and_store_fundamentals(symbols, request.exchange)

    # Step 2: Update nse_eq_symbols with fundamentals data
    logger.info("Step 2: Updating nse_eq_symbols table...")
    update_details = []
    symbols_updated = 0

    for symbol in symbols:
        result = _update_symbol_from_fundamentals(symbol)
        update_details.append(result)
        if result.get("updated"):
            symbols_updated += 1

    # Step 3: Recalculate rankings and cap types
    logger.info("Step 3: Recalculating market cap rankings...")
    rankings_updated = _recalculate_rankings()

    # Prepare response
    response = SyncResponse(
        total=len(symbols),
        fundamentals_fetched=fundamentals_result["success"],
        fundamentals_failed=fundamentals_result["failed"],
        symbols_updated=symbols_updated,
        cap_rankings_updated=rankings_updated,
        details=update_details
    )

    logger.info(f"Sync complete: {symbols_updated}/{len(symbols)} symbols updated")

    return response


@router.get("/status")
def get_sync_status(user=optional_user):
    """Get current sync status and statistics."""
    # Count symbols with market cap data
    stats = db_query("""
        SELECT
            COUNT(*) as total_symbols,
            COUNT(market_cap) as symbols_with_cap,
            COUNT(market_cap_rank) as symbols_ranked,
            MAX(market_cap) as max_cap,
            MIN(market_cap) as min_cap
        FROM nse_eq_symbols
    """)[0]

    # Cap type distribution
    cap_dist = db_query("""
        SELECT cap_type, COUNT(*) as count
        FROM nse_eq_symbols
        WHERE cap_type IS NOT NULL
        GROUP BY cap_type
        ORDER BY FIELD(cap_type, 'LARGE', 'MID', 'SMALL', 'MICRO')
    """)

    # Index coverage
    index_stats = db_query("""
        SELECT
            SUM(is_nifty_50) as nifty_50,
            SUM(is_nifty_100) as nifty_100,
            SUM(is_nifty_500) as nifty_500,
            SUM(is_nifty_midcap_150) as midcap_150,
            SUM(is_nifty_smallcap_250) as smallcap_250
        FROM nse_eq_symbols
    """)[0]

    return {
        "total_symbols": stats["total_symbols"],
        "symbols_with_market_cap": stats["symbols_with_cap"],
        "symbols_ranked": stats["symbols_ranked"],
        "coverage_pct": round(stats["symbols_with_cap"] / stats["total_symbols"] * 100, 1) if stats["total_symbols"] > 0 else 0,
        "market_cap_range": {
            "min": float(stats["min_cap"]) if stats["min_cap"] else None,
            "max": float(stats["max_cap"]) if stats["max_cap"] else None
        },
        "cap_type_distribution": [{"cap_type": row["cap_type"], "count": row["count"]} for row in cap_dist],
        "index_coverage": {
            "nifty_50": index_stats["nifty_50"],
            "nifty_100": index_stats["nifty_100"],
            "nifty_500": index_stats["nifty_500"],
            "midcap_150": index_stats["midcap_150"],
            "smallcap_250": index_stats["smallcap_250"]
        }
    }
