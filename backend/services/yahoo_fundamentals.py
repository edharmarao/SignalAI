"""Yahoo Finance fundamentals service.

Fetches fundamental data from Yahoo Finance and stores in MySQL.
Handles rate limiting to avoid free API issues.
"""
from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime
from typing import Any

import yfinance as yf
from db import db_execute, db_query

logger = logging.getLogger("signal_ai")

# Rate limiting config for free Yahoo API
DELAY_BETWEEN_SYMBOLS = 1.0  # seconds between each symbol fetch


def _safe_get(data: dict, key: str, default: Any = None) -> Any:
    """Safely extract value from dict, handling None/missing keys."""
    val = data.get(key, default)
    return val if val not in (None, "None", "", "-") else default


def _safe_float(val: Any, default: float | None = None) -> float | None:
    """Convert to float, return None if invalid or NaN/Inf."""
    if val is None or val == "":
        return default
    try:
        f = float(val)
        # MySQL doesn't support NaN or Inf - return None instead
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (ValueError, TypeError):
        return default


def _safe_int(val: Any, default: int | None = None) -> int | None:
    """Convert to int, return None if invalid or NaN/Inf."""
    if val is None or val == "":
        return default
    try:
        # First check if it's a float with NaN/Inf
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return int(f)
    except (ValueError, TypeError):
        return default


def _to_crores(val: Any) -> float | None:
    """Convert large numbers to Crores with single decimal precision.

    1 Crore = 10,000,000
    Example: 2,940,590,000,000 -> 294059.0 Cr
    """
    if val is None or val == "":
        return None
    try:
        num = float(val)
        # Check for NaN/Inf - MySQL doesn't support these
        if math.isnan(num) or math.isinf(num):
            return None
        crores = num / 10000000  # 1 Crore = 10 Million
        return round(crores, 1)
    except (ValueError, TypeError):
        return None


def _to_millions_usd(val: Any) -> float | None:
    """Convert large numbers to USD Millions with single decimal precision.

    1 Million USD = 1,000,000
    Example: 20,157,999,104 -> 20158.0 M USD
    """
    if val is None or val == "":
        return None
    try:
        num = float(val)
        # Check for NaN/Inf - MySQL doesn't support these
        if math.isnan(num) or math.isinf(num):
            return None
        millions = num / 1000000  # 1 Million = 10^6
        return round(millions, 1)
    except (ValueError, TypeError):
        return None


def _convert_usd_to_inr_crores(usd_val: Any, exchange_rate: float = 83.0) -> float | None:
    """Convert USD value to INR Crores.

    Args:
        usd_val: Value in USD
        exchange_rate: USD to INR rate (default 83)

    Example:
        $20.158 Billion * 83 = ₹1,673.1 Billion = 167,310 Cr
    """
    if usd_val is None or usd_val == "":
        return None
    try:
        num = float(usd_val)
        # Check for NaN/Inf - MySQL doesn't support these
        if math.isnan(num) or math.isinf(num):
            return None
        inr = num * exchange_rate
        crores = inr / 10000000
        return round(crores, 1)
    except (ValueError, TypeError):
        return None


def _process_financial_value(val: Any, is_usd: bool, exchange_rate: float = 83.0) -> tuple[float | None, float | None]:
    """Process financial value and return (INR_crores, USD_millions).

    Args:
        val: Raw value from Yahoo Finance
        is_usd: True if company reports in USD
        exchange_rate: USD to INR rate

    Returns:
        Tuple of (INR value in Crores, USD value in Millions)
    """
    if val is None or val == "":
        return (None, None)

    try:
        num = float(val)

        # Check for NaN/Inf - MySQL doesn't support these
        if math.isnan(num) or math.isinf(num):
            return (None, None)

        if is_usd:
            # Value is in USD - convert to INR Crores and also store as USD Millions
            inr_crores = round((num * exchange_rate) / 10000000, 1)
            usd_millions = round(num / 1000000, 1)
        else:
            # Value is in INR - convert to Crores and also calculate USD Millions
            inr_crores = round(num / 10000000, 1)
            usd_millions = round((num / exchange_rate) / 1000000, 1)

        return (inr_crores, usd_millions)
    except (ValueError, TypeError):
        return (None, None)


async def fetch_and_store_fundamentals(
    symbols: list[str],
    exchange: str = "NSE"
) -> dict[str, Any]:
    """Fetch fundamentals for multiple symbols and store in DB.

    Args:
        symbols: List of NSE symbol codes (e.g., ["RELIANCE", "TCS"])
        exchange: Exchange identifier (default: NSE)

    Returns:
        Dict with success/failure counts and details per symbol
    """
    results = {
        "total": len(symbols),
        "success": 0,
        "failed": 0,
        "details": []
    }

    for idx, symbol in enumerate(symbols):
        try:
            # For NSE symbols, append .NS suffix for Yahoo Finance
            yahoo_symbol = f"{symbol}.NS" if exchange == "NSE" else symbol

            logger.info(f"Fetching fundamentals for {symbol} ({idx+1}/{len(symbols)})")

            # Fetch data from Yahoo Finance (blocking call, runs in thread pool)
            ticker = await asyncio.to_thread(yf.Ticker, yahoo_symbol)
            info = await asyncio.to_thread(lambda: ticker.info)

            # Store company info
            info_stored = await _store_company_info(symbol, exchange, info)

            # Store quarterly financials
            quarterly_stored = await _store_quarterly_financials(symbol, ticker)

            # Store yearly financials
            yearly_stored = await _store_yearly_financials(symbol, ticker)

            results["success"] += 1
            results["details"].append({
                "symbol": symbol,
                "status": "success",
                "info_stored": info_stored,
                "quarterly_periods": quarterly_stored,
                "yearly_periods": yearly_stored
            })

            logger.info(f"✓ {symbol}: info={info_stored}, quarterly={quarterly_stored}, yearly={yearly_stored}")

        except Exception as e:
            logger.error(f"✗ Failed to fetch {symbol}: {e}")
            results["failed"] += 1
            results["details"].append({
                "symbol": symbol,
                "status": "failed",
                "error": str(e)
            })

        # Rate limiting: delay between requests to avoid hitting API limits
        if idx < len(symbols) - 1:
            await asyncio.sleep(DELAY_BETWEEN_SYMBOLS)

    return results


async def _store_company_info(symbol: str, exchange: str, info: dict) -> bool:
    """Store company info in fundamentals_info table."""
    try:
        # Detect currency - some companies (like INFY) report in USD
        financial_currency = _safe_get(info, "financialCurrency", "INR")
        is_usd = (financial_currency == "USD")

        # Exchange rate for USD to INR conversion
        USD_TO_INR = 83.0

        # Extract fields with safe defaults
        # Note: Store both INR (Crores) and USD (Millions) values
        data = {
            "symbol": symbol,
            "exchange": exchange,
            "currency": financial_currency,
            "company_name": _safe_get(info, "longName") or _safe_get(info, "shortName"),
            "sector": _safe_get(info, "sector"),
            "industry": _safe_get(info, "industry"),
        }

        # Market cap and enterprise value (handle both USD and INR reporting)
        market_cap_raw = _safe_get(info, "marketCap")
        enterprise_value_raw = _safe_get(info, "enterpriseValue")

        market_cap_inr, market_cap_usd = _process_financial_value(market_cap_raw, is_usd, USD_TO_INR)
        enterprise_value_inr, enterprise_value_usd = _process_financial_value(enterprise_value_raw, is_usd, USD_TO_INR)

        data["market_cap"] = market_cap_inr
        data["market_cap_usd"] = market_cap_usd
        data["enterprise_value"] = enterprise_value_inr
        data["enterprise_value_usd"] = enterprise_value_usd

        # Continue with ratios (currency-independent)
        data.update({
            # Ratios remain as-is
            "trailing_pe": _safe_float(_safe_get(info, "trailingPE")),
            "forward_pe": _safe_float(_safe_get(info, "forwardPE")),
            "peg_ratio": _safe_float(_safe_get(info, "pegRatio")),
            "price_to_book": _safe_float(_safe_get(info, "priceToBook")),
            "price_to_sales": _safe_float(_safe_get(info, "priceToSalesTrailing12Months")),
            "dividend_yield": _safe_float(_safe_get(info, "dividendYield")),
            "beta": _safe_float(_safe_get(info, "beta")),
            # Prices remain as-is (already in rupees)
            "fifty_two_week_high": _safe_float(_safe_get(info, "fiftyTwoWeekHigh")),
            "fifty_two_week_low": _safe_float(_safe_get(info, "fiftyTwoWeekLow")),
            "fifty_day_average": _safe_float(_safe_get(info, "fiftyDayAverage")),
            "two_hundred_day_average": _safe_float(_safe_get(info, "twoHundredDayAverage")),
            # Share counts in Lakhs (÷ 100 from Crores conversion)
            "shares_outstanding": _to_crores(_safe_get(info, "sharesOutstanding")),
            "float_shares": _to_crores(_safe_get(info, "floatShares")),
            # Percentages remain as-is
            "held_percent_insiders": _safe_float(_safe_get(info, "heldPercentInsiders")),
            "held_percent_institutions": _safe_float(_safe_get(info, "heldPercentInstitutions")),
            "short_ratio": _safe_float(_safe_get(info, "shortRatio")),
            # Book value per share remains as-is
            "book_value": _safe_float(_safe_get(info, "bookValue")),
            # Margins remain as-is (percentages)
            "profit_margins": _safe_float(_safe_get(info, "profitMargins")),
            "return_on_assets": _safe_float(_safe_get(info, "returnOnAssets")),
            "return_on_equity": _safe_float(_safe_get(info, "returnOnEquity")),
            "revenue_growth": _safe_float(_safe_get(info, "revenueGrowth")),
            "earnings_growth": _safe_float(_safe_get(info, "earningsGrowth")),
            # Ratios remain as-is
            "current_ratio": _safe_float(_safe_get(info, "currentRatio")),
            "debt_to_equity": _safe_float(_safe_get(info, "debtToEquity")),
            "quick_ratio": _safe_float(_safe_get(info, "quickRatio")),
        })

        # Process financial values with USD/INR conversion
        total_cash_inr, total_cash_usd = _process_financial_value(_safe_get(info, "totalCash"), is_usd, USD_TO_INR)
        total_debt_inr, total_debt_usd = _process_financial_value(_safe_get(info, "totalDebt"), is_usd, USD_TO_INR)
        total_revenue_inr, total_revenue_usd = _process_financial_value(_safe_get(info, "totalRevenue"), is_usd, USD_TO_INR)
        gross_profits_inr, gross_profits_usd = _process_financial_value(_safe_get(info, "grossProfits"), is_usd, USD_TO_INR)
        free_cashflow_inr, free_cashflow_usd = _process_financial_value(_safe_get(info, "freeCashflow"), is_usd, USD_TO_INR)
        operating_cashflow_inr, operating_cashflow_usd = _process_financial_value(_safe_get(info, "operatingCashflow"), is_usd, USD_TO_INR)
        ebitda_inr, ebitda_usd = _process_financial_value(_safe_get(info, "ebitda"), is_usd, USD_TO_INR)

        data.update({
            "total_cash": total_cash_inr,
            "total_cash_usd": total_cash_usd,
            "total_debt": total_debt_inr,
            "total_debt_usd": total_debt_usd,
            "total_revenue": total_revenue_inr,
            "total_revenue_usd": total_revenue_usd,
            "gross_profits": gross_profits_inr,
            "gross_profits_usd": gross_profits_usd,
            "free_cashflow": free_cashflow_inr,
            "free_cashflow_usd": free_cashflow_usd,
            "operating_cashflow": operating_cashflow_inr,
            "operating_cashflow_usd": operating_cashflow_usd,
            "ebitda": ebitda_inr,
            "ebitda_usd": ebitda_usd,
            "website": _safe_get(info, "website"),
            "last_updated": datetime.now()
        })

        # UPSERT: update if exists, insert if not
        cols = ", ".join(f"`{k}`" for k in data.keys())
        placeholders = ", ".join(["%s"] * len(data))
        update_cols = [k for k in data.keys() if k != "symbol" and k != "exchange"]
        update_sql = ", ".join(f"`{k}`=VALUES(`{k}`)" for k in update_cols)

        sql = f"""
            INSERT INTO fundamentals_info ({cols})
            VALUES ({placeholders})
            ON DUPLICATE KEY UPDATE {update_sql}
        """

        await asyncio.to_thread(db_execute, sql, list(data.values()))
        return True

    except Exception as e:
        logger.error(f"Failed to store company info for {symbol}: {e}")
        return False


async def _store_quarterly_financials(symbol: str, ticker: yf.Ticker) -> int:
    """Store quarterly financials. Returns number of periods stored."""
    try:
        # Detect currency for this symbol
        info = await asyncio.to_thread(lambda: ticker.info)
        financial_currency = _safe_get(info, "financialCurrency", "INR")
        is_usd = (financial_currency == "USD")
        USD_TO_INR = 83.0

        # Fetch quarterly financials
        quarterly_income = await asyncio.to_thread(lambda: ticker.quarterly_income_stmt)
        quarterly_balance = await asyncio.to_thread(lambda: ticker.quarterly_balance_sheet)
        quarterly_cashflow = await asyncio.to_thread(lambda: ticker.quarterly_cashflow)

        if quarterly_income is None or quarterly_income.empty:
            return 0

        stored = 0

        # Iterate through each quarter column
        for col in quarterly_income.columns:
            quarter_date = col.date() if hasattr(col, 'date') else col

            # Process financial values with currency conversion
            total_revenue_inr, total_revenue_usd = _process_financial_value(
                quarterly_income.loc["Total Revenue", col] if "Total Revenue" in quarterly_income.index else None, is_usd, USD_TO_INR)
            gross_profit_inr, gross_profit_usd = _process_financial_value(
                quarterly_income.loc["Gross Profit", col] if "Gross Profit" in quarterly_income.index else None, is_usd, USD_TO_INR)
            operating_income_inr, operating_income_usd = _process_financial_value(
                quarterly_income.loc["Operating Income", col] if "Operating Income" in quarterly_income.index else None, is_usd, USD_TO_INR)
            net_income_inr, net_income_usd = _process_financial_value(
                quarterly_income.loc["Net Income", col] if "Net Income" in quarterly_income.index else None, is_usd, USD_TO_INR)
            ebitda_inr, ebitda_usd = _process_financial_value(
                quarterly_income.loc["EBITDA", col] if "EBITDA" in quarterly_income.index else None, is_usd, USD_TO_INR)

            # Extract financial metrics
            data = {
                "symbol": symbol,
                "quarter_end_date": quarter_date,
                "currency": financial_currency,
                "total_revenue": total_revenue_inr,
                "total_revenue_usd": total_revenue_usd,
                "gross_profit": gross_profit_inr,
                "gross_profit_usd": gross_profit_usd,
                "operating_income": operating_income_inr,
                "operating_income_usd": operating_income_usd,
                "net_income": net_income_inr,
                "net_income_usd": net_income_usd,
                "ebitda": ebitda_inr,
                "ebitda_usd": ebitda_usd,
                "eps_basic": _safe_float(quarterly_income.loc["Basic EPS", col] if "Basic EPS" in quarterly_income.index else None),
                "eps_diluted": _safe_float(quarterly_income.loc["Diluted EPS", col] if "Diluted EPS" in quarterly_income.index else None),
            }

            # Add balance sheet data if available
            if quarterly_balance is not None and not quarterly_balance.empty and col in quarterly_balance.columns:
                total_assets_inr, total_assets_usd = _process_financial_value(
                    quarterly_balance.loc["Total Assets", col] if "Total Assets" in quarterly_balance.index else None, is_usd, USD_TO_INR)
                total_liabilities_inr, total_liabilities_usd = _process_financial_value(
                    quarterly_balance.loc["Total Liabilities Net Minority Interest", col] if "Total Liabilities Net Minority Interest" in quarterly_balance.index else None, is_usd, USD_TO_INR)
                stockholders_equity_inr, stockholders_equity_usd = _process_financial_value(
                    quarterly_balance.loc["Stockholders Equity", col] if "Stockholders Equity" in quarterly_balance.index else None, is_usd, USD_TO_INR)
                total_debt_inr, total_debt_usd = _process_financial_value(
                    quarterly_balance.loc["Total Debt", col] if "Total Debt" in quarterly_balance.index else None, is_usd, USD_TO_INR)
                current_assets_inr, current_assets_usd = _process_financial_value(
                    quarterly_balance.loc["Current Assets", col] if "Current Assets" in quarterly_balance.index else None, is_usd, USD_TO_INR)
                current_liabilities_inr, current_liabilities_usd = _process_financial_value(
                    quarterly_balance.loc["Current Liabilities", col] if "Current Liabilities" in quarterly_balance.index else None, is_usd, USD_TO_INR)
                cash_and_equivalents_inr, cash_and_equivalents_usd = _process_financial_value(
                    quarterly_balance.loc["Cash And Cash Equivalents", col] if "Cash And Cash Equivalents" in quarterly_balance.index else None, is_usd, USD_TO_INR)

                data.update({
                    "total_assets": total_assets_inr,
                    "total_assets_usd": total_assets_usd,
                    "total_liabilities": total_liabilities_inr,
                    "total_liabilities_usd": total_liabilities_usd,
                    "stockholders_equity": stockholders_equity_inr,
                    "stockholders_equity_usd": stockholders_equity_usd,
                    "total_debt": total_debt_inr,
                    "total_debt_usd": total_debt_usd,
                    "current_assets": current_assets_inr,
                    "current_assets_usd": current_assets_usd,
                    "current_liabilities": current_liabilities_inr,
                    "current_liabilities_usd": current_liabilities_usd,
                    "cash_and_equivalents": cash_and_equivalents_inr,
                    "cash_and_equivalents_usd": cash_and_equivalents_usd,
                })

            # Add cashflow data if available
            if quarterly_cashflow is not None and not quarterly_cashflow.empty and col in quarterly_cashflow.columns:
                operating_cashflow_inr, operating_cashflow_usd = _process_financial_value(
                    quarterly_cashflow.loc["Operating Cash Flow", col] if "Operating Cash Flow" in quarterly_cashflow.index else None, is_usd, USD_TO_INR)
                investing_cashflow_inr, investing_cashflow_usd = _process_financial_value(
                    quarterly_cashflow.loc["Investing Cash Flow", col] if "Investing Cash Flow" in quarterly_cashflow.index else None, is_usd, USD_TO_INR)
                financing_cashflow_inr, financing_cashflow_usd = _process_financial_value(
                    quarterly_cashflow.loc["Financing Cash Flow", col] if "Financing Cash Flow" in quarterly_cashflow.index else None, is_usd, USD_TO_INR)
                free_cashflow_inr, free_cashflow_usd = _process_financial_value(
                    quarterly_cashflow.loc["Free Cash Flow", col] if "Free Cash Flow" in quarterly_cashflow.index else None, is_usd, USD_TO_INR)
                capital_expenditure_inr, capital_expenditure_usd = _process_financial_value(
                    quarterly_cashflow.loc["Capital Expenditure", col] if "Capital Expenditure" in quarterly_cashflow.index else None, is_usd, USD_TO_INR)

                data.update({
                    "operating_cashflow": operating_cashflow_inr,
                    "operating_cashflow_usd": operating_cashflow_usd,
                    "investing_cashflow": investing_cashflow_inr,
                    "investing_cashflow_usd": investing_cashflow_usd,
                    "financing_cashflow": financing_cashflow_inr,
                    "financing_cashflow_usd": financing_cashflow_usd,
                    "free_cashflow": free_cashflow_inr,
                    "free_cashflow_usd": free_cashflow_usd,
                    "capital_expenditure": capital_expenditure_inr,
                    "capital_expenditure_usd": capital_expenditure_usd,
                })

            # UPSERT
            cols_str = ", ".join(f"`{k}`" for k in data.keys())
            placeholders = ", ".join(["%s"] * len(data))
            update_cols = [k for k in data.keys() if k not in ("symbol", "quarter_end_date")]
            update_sql = ", ".join(f"`{k}`=VALUES(`{k}`)" for k in update_cols)

            sql = f"""
                INSERT INTO fundamentals_quarterly ({cols_str})
                VALUES ({placeholders})
                ON DUPLICATE KEY UPDATE {update_sql}
            """

            await asyncio.to_thread(db_execute, sql, list(data.values()))
            stored += 1

        return stored

    except Exception as e:
        logger.error(f"Failed to store quarterly financials for {symbol}: {e}")
        return 0


async def _store_yearly_financials(symbol: str, ticker: yf.Ticker) -> int:
    """Store yearly financials. Returns number of periods stored."""
    try:
        # Detect currency for this symbol
        info = await asyncio.to_thread(lambda: ticker.info)
        financial_currency = _safe_get(info, "financialCurrency", "INR")
        is_usd = (financial_currency == "USD")
        USD_TO_INR = 83.0

        # Fetch annual financials
        yearly_income = await asyncio.to_thread(lambda: ticker.income_stmt)
        yearly_balance = await asyncio.to_thread(lambda: ticker.balance_sheet)
        yearly_cashflow = await asyncio.to_thread(lambda: ticker.cashflow)

        if yearly_income is None or yearly_income.empty:
            return 0

        stored = 0

        # Iterate through each year column
        for col in yearly_income.columns:
            year_date = col.date() if hasattr(col, 'date') else col

            # Process financial values with currency conversion
            total_revenue_inr, total_revenue_usd = _process_financial_value(
                yearly_income.loc["Total Revenue", col] if "Total Revenue" in yearly_income.index else None, is_usd, USD_TO_INR)
            gross_profit_inr, gross_profit_usd = _process_financial_value(
                yearly_income.loc["Gross Profit", col] if "Gross Profit" in yearly_income.index else None, is_usd, USD_TO_INR)
            operating_income_inr, operating_income_usd = _process_financial_value(
                yearly_income.loc["Operating Income", col] if "Operating Income" in yearly_income.index else None, is_usd, USD_TO_INR)
            net_income_inr, net_income_usd = _process_financial_value(
                yearly_income.loc["Net Income", col] if "Net Income" in yearly_income.index else None, is_usd, USD_TO_INR)
            ebitda_inr, ebitda_usd = _process_financial_value(
                yearly_income.loc["EBITDA", col] if "EBITDA" in yearly_income.index else None, is_usd, USD_TO_INR)

            # Extract financial metrics
            data = {
                "symbol": symbol,
                "fiscal_year_end": year_date,
                "currency": financial_currency,
                "total_revenue": total_revenue_inr,
                "total_revenue_usd": total_revenue_usd,
                "gross_profit": gross_profit_inr,
                "gross_profit_usd": gross_profit_usd,
                "operating_income": operating_income_inr,
                "operating_income_usd": operating_income_usd,
                "net_income": net_income_inr,
                "net_income_usd": net_income_usd,
                "ebitda": ebitda_inr,
                "ebitda_usd": ebitda_usd,
                "eps_basic": _safe_float(yearly_income.loc["Basic EPS", col] if "Basic EPS" in yearly_income.index else None),
                "eps_diluted": _safe_float(yearly_income.loc["Diluted EPS", col] if "Diluted EPS" in yearly_income.index else None),
            }

            # Add balance sheet data if available
            if yearly_balance is not None and not yearly_balance.empty and col in yearly_balance.columns:
                total_assets_inr, total_assets_usd = _process_financial_value(
                    yearly_balance.loc["Total Assets", col] if "Total Assets" in yearly_balance.index else None, is_usd, USD_TO_INR)
                total_liabilities_inr, total_liabilities_usd = _process_financial_value(
                    yearly_balance.loc["Total Liabilities Net Minority Interest", col] if "Total Liabilities Net Minority Interest" in yearly_balance.index else None, is_usd, USD_TO_INR)
                stockholders_equity_inr, stockholders_equity_usd = _process_financial_value(
                    yearly_balance.loc["Stockholders Equity", col] if "Stockholders Equity" in yearly_balance.index else None, is_usd, USD_TO_INR)
                total_debt_inr, total_debt_usd = _process_financial_value(
                    yearly_balance.loc["Total Debt", col] if "Total Debt" in yearly_balance.index else None, is_usd, USD_TO_INR)
                current_assets_inr, current_assets_usd = _process_financial_value(
                    yearly_balance.loc["Current Assets", col] if "Current Assets" in yearly_balance.index else None, is_usd, USD_TO_INR)
                current_liabilities_inr, current_liabilities_usd = _process_financial_value(
                    yearly_balance.loc["Current Liabilities", col] if "Current Liabilities" in yearly_balance.index else None, is_usd, USD_TO_INR)
                cash_and_equivalents_inr, cash_and_equivalents_usd = _process_financial_value(
                    yearly_balance.loc["Cash And Cash Equivalents", col] if "Cash And Cash Equivalents" in yearly_balance.index else None, is_usd, USD_TO_INR)

                data.update({
                    "total_assets": total_assets_inr,
                    "total_assets_usd": total_assets_usd,
                    "total_liabilities": total_liabilities_inr,
                    "total_liabilities_usd": total_liabilities_usd,
                    "stockholders_equity": stockholders_equity_inr,
                    "stockholders_equity_usd": stockholders_equity_usd,
                    "total_debt": total_debt_inr,
                    "total_debt_usd": total_debt_usd,
                    "current_assets": current_assets_inr,
                    "current_assets_usd": current_assets_usd,
                    "current_liabilities": current_liabilities_inr,
                    "current_liabilities_usd": current_liabilities_usd,
                    "cash_and_equivalents": cash_and_equivalents_inr,
                    "cash_and_equivalents_usd": cash_and_equivalents_usd,
                })

            # Add cashflow data if available
            if yearly_cashflow is not None and not yearly_cashflow.empty and col in yearly_cashflow.columns:
                operating_cashflow_inr, operating_cashflow_usd = _process_financial_value(
                    yearly_cashflow.loc["Operating Cash Flow", col] if "Operating Cash Flow" in yearly_cashflow.index else None, is_usd, USD_TO_INR)
                investing_cashflow_inr, investing_cashflow_usd = _process_financial_value(
                    yearly_cashflow.loc["Investing Cash Flow", col] if "Investing Cash Flow" in yearly_cashflow.index else None, is_usd, USD_TO_INR)
                financing_cashflow_inr, financing_cashflow_usd = _process_financial_value(
                    yearly_cashflow.loc["Financing Cash Flow", col] if "Financing Cash Flow" in yearly_cashflow.index else None, is_usd, USD_TO_INR)
                free_cashflow_inr, free_cashflow_usd = _process_financial_value(
                    yearly_cashflow.loc["Free Cash Flow", col] if "Free Cash Flow" in yearly_cashflow.index else None, is_usd, USD_TO_INR)
                capital_expenditure_inr, capital_expenditure_usd = _process_financial_value(
                    yearly_cashflow.loc["Capital Expenditure", col] if "Capital Expenditure" in yearly_cashflow.index else None, is_usd, USD_TO_INR)

                data.update({
                    "operating_cashflow": operating_cashflow_inr,
                    "operating_cashflow_usd": operating_cashflow_usd,
                    "investing_cashflow": investing_cashflow_inr,
                    "investing_cashflow_usd": investing_cashflow_usd,
                    "financing_cashflow": financing_cashflow_inr,
                    "financing_cashflow_usd": financing_cashflow_usd,
                    "free_cashflow": free_cashflow_inr,
                    "free_cashflow_usd": free_cashflow_usd,
                    "capital_expenditure": capital_expenditure_inr,
                    "capital_expenditure_usd": capital_expenditure_usd,
                })

            # UPSERT
            cols_str = ", ".join(f"`{k}`" for k in data.keys())
            placeholders = ", ".join(["%s"] * len(data))
            update_cols = [k for k in data.keys() if k not in ("symbol", "fiscal_year_end")]
            update_sql = ", ".join(f"`{k}`=VALUES(`{k}`)" for k in update_cols)

            sql = f"""
                INSERT INTO fundamentals_yearly ({cols_str})
                VALUES ({placeholders})
                ON DUPLICATE KEY UPDATE {update_sql}
            """

            await asyncio.to_thread(db_execute, sql, list(data.values()))
            stored += 1

        return stored

    except Exception as e:
        logger.error(f"Failed to store yearly financials for {symbol}: {e}")
        return 0


async def get_fundamentals_info(symbol: str) -> dict | None:
    """Retrieve stored fundamentals info for a symbol."""
    sql = "SELECT * FROM fundamentals_info WHERE symbol = %s"
    result = await asyncio.to_thread(db_query, sql, (symbol,))
    return result[0] if result else None


async def get_fundamentals_quarterly(symbol: str, limit: int = 8) -> list[dict]:
    """Retrieve quarterly financials for a symbol (latest first)."""
    sql = """
        SELECT * FROM fundamentals_quarterly
        WHERE symbol = %s
        ORDER BY quarter_end_date DESC
        LIMIT %s
    """
    return await asyncio.to_thread(db_query, sql, (symbol, limit))


async def get_fundamentals_yearly(symbol: str, limit: int = 5) -> list[dict]:
    """Retrieve yearly financials for a symbol (latest first)."""
    sql = """
        SELECT * FROM fundamentals_yearly
        WHERE symbol = %s
        ORDER BY fiscal_year_end DESC
        LIMIT %s
    """
    return await asyncio.to_thread(db_query, sql, (symbol, limit))


async def list_all_symbols_with_fundamentals() -> list[dict]:
    """List all symbols that have fundamentals data stored."""
    sql = """
        SELECT symbol, company_name, sector, industry, market_cap, last_updated
        FROM fundamentals_info
        ORDER BY market_cap DESC
    """
    return await asyncio.to_thread(db_query, sql)
