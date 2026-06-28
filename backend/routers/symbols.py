"""Symbols endpoints - Enhanced symbol data with market cap and index classifications."""
from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from db import db_query
from deps import optional_user

logger = logging.getLogger("signal_ai")
router = APIRouter(prefix="/symbols", tags=["symbols"])


class SymbolFilter(BaseModel):
    """Filter criteria for symbols."""
    cap_type: Optional[Literal["LARGE", "MID", "SMALL", "MICRO"]] = None
    is_nifty_50: Optional[bool] = None
    is_nifty_100: Optional[bool] = None
    is_nifty_500: Optional[bool] = None
    is_fo_enabled: Optional[bool] = None
    min_market_cap: Optional[float] = None
    max_market_cap: Optional[float] = None
    industry: Optional[str] = None


@router.get("/")
def list_symbols(
    cap_type: Optional[str] = Query(None, description="LARGE/MID/SMALL/MICRO"),
    is_nifty_50: Optional[bool] = Query(None, description="Filter NIFTY 50 members"),
    is_nifty_500: Optional[bool] = Query(None, description="Filter NIFTY 500 members"),
    is_fo_enabled: Optional[bool] = Query(None, description="Filter F&O enabled stocks"),
    min_market_cap: Optional[float] = Query(None, description="Minimum market cap in Crores"),
    max_market_cap: Optional[float] = Query(None, description="Maximum market cap in Crores"),
    industry: Optional[str] = Query(None, description="Filter by industry"),
    limit: int = Query(100, ge=1, le=1000, description="Result limit"),
    offset: int = Query(0, ge=0, description="Result offset"),
    user=optional_user,
):
    """Get list of symbols with filters.

    Examples:
    - /symbols?cap_type=LARGE
    - /symbols?is_nifty_50=true
    - /symbols?min_market_cap=10000&max_market_cap=50000
    - /symbols?industry=Banks
    """
    conditions = ["market_cap IS NOT NULL"]
    params = []

    if cap_type:
        conditions.append("cap_type = %s")
        params.append(cap_type.upper() if isinstance(cap_type, str) else cap_type)

    if is_nifty_50 is not None:
        conditions.append("is_nifty_50 = %s")
        params.append(is_nifty_50)

    if is_nifty_500 is not None:
        conditions.append("is_nifty_500 = %s")
        params.append(is_nifty_500)

    if is_fo_enabled is not None:
        conditions.append("is_fo_enabled = %s")
        params.append(is_fo_enabled)

    if min_market_cap is not None:
        conditions.append("market_cap >= %s")
        params.append(min_market_cap)

    if max_market_cap is not None:
        conditions.append("market_cap <= %s")
        params.append(max_market_cap)

    if industry:
        conditions.append("industry LIKE %s")
        params.append(f"%{industry}%")

    where_clause = " AND ".join(conditions)

    # Get total count
    count_sql = f"SELECT COUNT(*) as total FROM nse_eq_symbols WHERE {where_clause}"
    total_result = db_query(count_sql, tuple(params))
    total = total_result[0]["total"]

    # Get symbols
    sql = f"""
        SELECT
            symbol, company_name, industry, market_cap, market_cap_rank, cap_type,
            is_nifty_50, is_nifty_100, is_nifty_500,
            is_nifty_bank, is_nifty_it, is_nifty_financial,
            is_fo_enabled, is_active, series, isin_code
        FROM nse_eq_symbols
        WHERE {where_clause}
        ORDER BY market_cap DESC
        LIMIT %s OFFSET %s
    """
    params.extend([limit, offset])

    symbols = db_query(sql, tuple(params))

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "count": len(symbols),
        "symbols": symbols,
    }


@router.get("/{symbol}")
def get_symbol_detail(symbol: str, user=optional_user):
    """Get detailed information for a single symbol."""
    sql = """
        SELECT *
        FROM nse_eq_symbols
        WHERE symbol = %s
    """
    result = db_query(sql, (symbol,))

    if not result:
        raise HTTPException(404, f"Symbol not found: {symbol}")

    return result[0]


@router.get("/stats/cap-distribution")
def get_cap_distribution(user=optional_user):
    """Get distribution of stocks by cap type."""
    sql = """
        SELECT
            cap_type,
            COUNT(*) as count,
            MIN(market_cap) as min_cap,
            MAX(market_cap) as max_cap,
            AVG(market_cap) as avg_cap
        FROM nse_eq_symbols
        WHERE cap_type IS NOT NULL
        GROUP BY cap_type
        ORDER BY FIELD(cap_type, 'LARGE', 'MID', 'SMALL', 'MICRO')
    """
    result = db_query(sql)

    return {
        "distribution": result,
        "total_with_cap_data": sum(r["count"] for r in result),
    }


@router.get("/stats/index-coverage")
def get_index_coverage(user=optional_user):
    """Get coverage statistics for various NIFTY indices."""
    indices = [
        ("NIFTY 50", "is_nifty_50"),
        ("NIFTY Next 50", "is_nifty_next_50"),
        ("NIFTY 100", "is_nifty_100"),
        ("NIFTY 200", "is_nifty_200"),
        ("NIFTY 500", "is_nifty_500"),
        ("NIFTY Midcap 150", "is_nifty_midcap_150"),
        ("NIFTY Smallcap 250", "is_nifty_smallcap_250"),
        ("NIFTY Microcap 250", "is_nifty_microcap_250"),
        ("NIFTY Bank", "is_nifty_bank"),
        ("NIFTY IT", "is_nifty_it"),
        ("NIFTY Financial", "is_nifty_financial"),
        ("F&O Enabled", "is_fo_enabled"),
    ]

    coverage = []
    for name, column in indices:
        sql = f"SELECT COUNT(*) as count FROM nse_eq_symbols WHERE {column} = TRUE"
        result = db_query(sql)
        coverage.append({
            "index": name,
            "count": result[0]["count"],
        })

    return {"coverage": coverage}


@router.get("/industry/list")
def list_industries(user=optional_user):
    """Get list of all industries with stock counts."""
    sql = """
        SELECT
            industry,
            COUNT(*) as count,
            MIN(market_cap) as min_cap,
            MAX(market_cap) as max_cap
        FROM nse_eq_symbols
        WHERE industry IS NOT NULL AND industry != ''
        GROUP BY industry
        ORDER BY count DESC
    """
    result = db_query(sql)

    return {
        "total_industries": len(result),
        "industries": result,
    }


@router.get("/compare")
def compare_symbols(
    symbols: str = Query(..., description="Comma-separated symbols (e.g., RELIANCE,TCS,INFY)"),
    user=optional_user,
):
    """Compare multiple symbols side by side."""
    symbol_list = [s.strip().upper() for s in symbols.split(",")]

    if len(symbol_list) > 10:
        raise HTTPException(400, "Maximum 10 symbols allowed for comparison")

    placeholders = ", ".join(["%s"] * len(symbol_list))
    sql = f"""
        SELECT
            symbol, company_name, industry, market_cap, market_cap_rank, cap_type,
            is_nifty_50, is_nifty_100, is_nifty_500,
            is_fo_enabled, series
        FROM nse_eq_symbols
        WHERE symbol IN ({placeholders})
        ORDER BY market_cap DESC
    """

    result = db_query(sql, tuple(symbol_list))

    return {
        "requested": symbol_list,
        "found": len(result),
        "comparison": result,
    }
