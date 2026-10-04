"""Fyers technical-overview proxy."""
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from db import db_query, db_upsert
from deps import get_current_user

logger = logging.getLogger("signal_ai")
router = APIRouter(prefix="/fyers", tags=["fyers"])

_TECHNICAL_OVERVIEW_URL = "https://screeners.fyers.in/koshi/v2/sd/technical-overview"

_OSCILLATORS = {
    "RSI": "rsi",
    "STOCH %K": "stoch_k",
    "MACD Level(12,26)": "macd_level_12_26",
    "Ultimate Oscillator": "ultimate_oscillator",
    "Aroon Oscillator": "aroon_oscillator",
    "BOP": "bop",
    "CCI": "cci",
    "Williams %R": "williams_r",
    "Momentum": "momentum",
}
_MOVING_AVERAGES = {
    "EMA 9": "ema_9",
    "SMA 9": "sma_9",
    "EMA 21": "ema_21",
    "SMA 21": "sma_21",
    "EMA 50": "ema_50",
    "SMA 50": "sma_50",
    "EMA 200": "ema_200",
    "SMA 200": "sma_200",
    "WMA 20": "wma_20",
}
_PATTERNS = {
    "Closing marubozu": "closing_marubozu",
    "Two crows": "two_crows",
    "Three black crows": "three_black_crows",
    "Three-line strike": "three_line_strike",
    "Three outside up/down": "three_outside_up_down",
    "Three stars in the south": "three_stars_in_the_south",
    "Three advancing white soldiers": "three_advancing_white_soldiers",
    "Doji star": "doji_star",
    "Evening star": "evening_star",
}
_TECHNICAL_RATIOS = {
    "Day RSI": "day_rsi",
    "Day MFI": "day_mfi",
    "50 Day SMA": "sma_50_day",
    "200 Day SMA": "sma_200_day",
    "20 Day WMA": "wma_20_day",
    "Day MACD(12,26,9)": "macd_day_12_26_9",
}
_PIVOT_TYPES = {
    "Classic": "classic",
    "Fibonacci": "fibonacci",
    "Camarilla": "camarilla",
    "Woodie": "woodie",
    "DeMark": "demark",
}
_PIVOT_LEVELS = {
    "Resistance 5": "resistance_5",
    "Resistance 4": "resistance_4",
    "Resistance 3": "resistance_3",
    "Resistance 2": "resistance_2",
    "Resistance 1": "resistance_1",
    "Pivot": "pivot",
    "Support 1": "support_1",
    "Support 2": "support_2",
    "Support 3": "support_3",
    "Support 4": "support_4",
    "Support 5": "support_5",
}

_TECHNICAL_COLUMN_TYPES: dict[str, str] = {
    "technical_lut": "BIGINT NULL",
}
for _prefix, _indicators in (
    ("osc", _OSCILLATORS),
    ("ma", _MOVING_AVERAGES),
    ("pattern", _PATTERNS),
):
    for _column in _indicators.values():
        _TECHNICAL_COLUMN_TYPES[f"{_prefix}_{_column}_value"] = "DECIMAL(20,6) NULL"
        _TECHNICAL_COLUMN_TYPES[f"{_prefix}_{_column}_trend"] = "TINYINT NULL"
for _prefix in ("oscillators", "moving_averages", "patterns"):
    _TECHNICAL_COLUMN_TYPES[f"{_prefix}_overview_value"] = "DECIMAL(20,6) NULL"
    _TECHNICAL_COLUMN_TYPES[f"{_prefix}_overview_trend"] = "TINYINT NULL"
    _TECHNICAL_COLUMN_TYPES[f"{_prefix}_overview_description"] = "VARCHAR(512) NULL"
for _level in _PIVOT_LEVELS.values():
    for _pivot_type in _PIVOT_TYPES.values():
        _TECHNICAL_COLUMN_TYPES[f"{_pivot_type}_{_level}"] = "DECIMAL(20,6) NULL"
for _column in _TECHNICAL_RATIOS.values():
    _TECHNICAL_COLUMN_TYPES[f"ratio_{_column}_value"] = "DECIMAL(20,6) NULL"
    _TECHNICAL_COLUMN_TYPES[f"ratio_{_column}_trend"] = "TINYINT NULL"


def _normalize_symbol(symbol: str) -> str:
    symbol = symbol.strip().upper()
    if not re.fullmatch(r"(?:[A-Z0-9_-]+:)?[A-Z0-9&._-]+", symbol):
        raise ValueError("Use a valid symbol, for example NSE:STLTECH-BE.")
    exchange, separator, code = symbol.partition(":")
    if not separator:
        exchange, code = "NSE", symbol
    if code.rsplit("-", 1)[-1] not in {"EQ", "BE", "BZ", "SM", "ST", "SZ"}:
        code = f"{code}-EQ"
    return f"{exchange}:{code}"


class TechnicalOverviewRequest(BaseModel):
    """Request parameters for one Fyers technical overview."""

    access_token: str = Field(..., min_length=1, max_length=8192)
    symbol: str = Field(..., min_length=1, max_length=64)
    timeframe: str = Field(default="60", pattern=r"^\d{1,3}$")

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return _normalize_symbol(value)


class BulkTechnicalOverviewRequest(BaseModel):
    """Request parameters for multiple Fyers technical overviews."""

    access_token: str = Field(..., min_length=1, max_length=8192)
    symbols: list[str] = Field(..., min_length=1, max_length=750)
    timeframe: str = Field(default="60", pattern=r"^\d{1,3}$")

    @field_validator("symbols")
    @classmethod
    def normalize_symbols(cls, values: list[str]) -> list[str]:
        return list(dict.fromkeys(_normalize_symbol(value) for value in values))


def _access_token(value: str) -> str:
    token = value.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if not token:
        raise HTTPException(status_code=422, detail="Fyers access token is required.")
    return token


async def _request_overview(
    client: httpx.AsyncClient,
    access_token: str,
    symbol: str,
    timeframe: str,
) -> Any:
    try:
        response = await client.get(
            _TECHNICAL_OVERVIEW_URL,
            params={"symbol": symbol, "timeframe": timeframe},
            headers={
                "Authorization": access_token,
                "Accept": "*/*",
                "Origin": "https://fyers.in",
                "Referer": "https://fyers.in/",
            },
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Timed out waiting for Fyers.") from exc
    except httpx.HTTPError as exc:
        logger.warning("Fyers technical overview request failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Could not connect to Fyers.") from exc

    response_body = response.text.replace(access_token, "[redacted]")
    if len(response_body) > 20000:
        response_body = f"{response_body[:20000]}… [truncated]"
    logger.info(
        "Fyers technical overview API response (symbol=%s, timeframe=%s, HTTP %s): %s",
        symbol,
        timeframe,
        response.status_code,
        response_body,
    )

    if not response.is_success:
        logger.warning("Fyers technical overview returned HTTP %s", response.status_code)
        message = _upstream_error_message(response, access_token)
        raise HTTPException(
            status_code=502,
            detail=f"Fyers rejected the request (HTTP {response.status_code})"
            + (f": {message}" if message else "."),
        )

    try:
        return response.json()
    except ValueError as exc:
        logger.warning("Fyers technical overview returned a non-JSON response")
        raise HTTPException(status_code=502, detail="Fyers returned an invalid JSON response.") from exc


def _upstream_error_message(response: httpx.Response, access_token: str) -> str:
    try:
        payload = response.json()
    except ValueError:
        return ""
    if not isinstance(payload, dict):
        return ""

    for key in ("message", "error", "detail", "description", "msg"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip().replace(access_token, "[redacted]")[:300]
        if isinstance(value, dict):
            for nested_key in ("message", "description", "msg"):
                nested_value = value.get(nested_key)
                if isinstance(nested_value, str) and nested_value.strip():
                    return nested_value.strip().replace(access_token, "[redacted]")[:300]
    return ""


def _stock_code(symbol: str) -> str:
    code = symbol.split(":", 1)[-1]
    ticker, separator, series = code.rpartition("-")
    if separator and series in {"EQ", "BE", "BZ", "SM", "ST", "SZ"}:
        return ticker
    return code


def _store_overview(symbol: str, timeframe: str, data: Any) -> None:
    _store_overviews([_technical_indicator_row(symbol, timeframe, data)])


def _numeric_value(value: Any, field: str) -> int | float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"Fyers field {field} must be numeric.")
    return value


def _technical_indicator_row(symbol: str, timeframe: str, response: Any) -> dict[str, Any]:
    if not isinstance(response, dict) or not isinstance(response.get("data"), dict):
        raise ValueError("Fyers response is missing the data object.")
    payload = response["data"]
    meter = payload.get("technical_meter")
    if not isinstance(meter, dict):
        raise ValueError("Fyers response is missing technical_meter.")

    row: dict[str, Any] = {
        "stock_code": _stock_code(symbol),
        "time_period": timeframe,
        "technical_lut": _numeric_value(meter.get("lut"), "technical_meter.lut"),
        "updated_at": datetime.now(),
    }
    for prefix, indicators in (
        ("osc", _OSCILLATORS),
        ("ma", _MOVING_AVERAGES),
        ("pattern", _PATTERNS),
    ):
        for column in indicators.values():
            row[f"{prefix}_{column}_value"] = None
            row[f"{prefix}_{column}_trend"] = None

    for section_key, prefix, indicators in (
        ("oscillators", "osc", _OSCILLATORS),
        ("ma", "ma", _MOVING_AVERAGES),
        ("patterns", "pattern", _PATTERNS),
    ):
        section = meter.get(section_key)
        if not isinstance(section, dict):
            raise ValueError(f"Fyers response is missing technical_meter.{section_key}.")
        values = section.get("value")
        if not isinstance(values, list):
            raise ValueError(f"Fyers technical_meter.{section_key}.value must be an array.")
        for indicator in values:
            if (
                not isinstance(indicator, dict)
                or not isinstance(indicator.get("name"), str)
                or indicator["name"] not in indicators
            ):
                name = indicator.get("name", "unknown") if isinstance(indicator, dict) else "unknown"
                raise ValueError(f"Unsupported Fyers {section_key} indicator: {name}.")
            column = indicators[indicator["name"]]
            row[f"{prefix}_{column}_value"] = _numeric_value(
                indicator.get("value"), f"{section_key}.{indicator['name']}.value"
            )
            row[f"{prefix}_{column}_trend"] = _numeric_value(
                indicator.get("trend"), f"{section_key}.{indicator['name']}.trend"
            )

        overview = section.get("overview")
        if not isinstance(overview, dict):
            raise ValueError(f"Fyers technical_meter.{section_key}.overview is missing.")
        overview_prefix = {
            "oscillators": "oscillators",
            "ma": "moving_averages",
            "patterns": "patterns",
        }[section_key]
        row[f"{overview_prefix}_overview_value"] = _numeric_value(
            overview.get("value"), f"{section_key}.overview.value"
        )
        row[f"{overview_prefix}_overview_trend"] = _numeric_value(
            overview.get("trend"), f"{section_key}.overview.trend"
        )
        description = overview.get("description")
        if description is not None and not isinstance(description, str):
            raise ValueError(f"Fyers {section_key}.overview.description must be text.")
        row[f"{overview_prefix}_overview_description"] = description

    pivot_rows = payload.get("pivot")
    if not isinstance(pivot_rows, list):
        raise ValueError("Fyers response data.pivot must be an array.")
    pivot_header = next(
        (item for item in pivot_rows if isinstance(item, dict) and item.get("title") == "Pivots"),
        None,
    )
    if not isinstance(pivot_header, dict) or not isinstance(pivot_header.get("value"), list):
        raise ValueError("Fyers pivot types are missing.")
    pivot_types = pivot_header["value"]
    if any(not isinstance(pivot_type, str) or pivot_type not in _PIVOT_TYPES for pivot_type in pivot_types):
        raise ValueError("Fyers response contains an unsupported pivot type.")
    for level in _PIVOT_LEVELS.values():
        for pivot_type in _PIVOT_TYPES.values():
            row[f"{pivot_type}_{level}"] = None
    for pivot in pivot_rows:
        if not isinstance(pivot, dict):
            raise ValueError("Fyers pivot entries must be objects.")
        title = pivot.get("title")
        if title == "Pivots":
            continue
        if not isinstance(title, str) or title not in _PIVOT_LEVELS:
            raise ValueError(f"Unsupported Fyers pivot level: {title}.")
        values = pivot.get("value")
        if not isinstance(values, list):
            raise ValueError(f"Fyers pivot {title} must contain an array.")
        for index, pivot_type in enumerate(pivot_types):
            if index < len(values):
                row[f"{_PIVOT_TYPES[pivot_type]}_{_PIVOT_LEVELS[title]}"] = _numeric_value(
                    values[index], f"pivot.{title}.{pivot_type}"
                )

    ratios = payload.get("technical_ratios")
    if not isinstance(ratios, list):
        raise ValueError("Fyers response data.technical_ratios must be an array.")
    for column in _TECHNICAL_RATIOS.values():
        row[f"ratio_{column}_value"] = None
        row[f"ratio_{column}_trend"] = None
    for ratio in ratios:
        if (
            not isinstance(ratio, dict)
            or not isinstance(ratio.get("description"), str)
            or ratio["description"] not in _TECHNICAL_RATIOS
        ):
            description = ratio.get("description", "unknown") if isinstance(ratio, dict) else "unknown"
            raise ValueError(f"Unsupported Fyers technical ratio: {description}.")
        column = _TECHNICAL_RATIOS[ratio["description"]]
        row[f"ratio_{column}_value"] = _numeric_value(
            ratio.get("value"), f"technical_ratios.{ratio['description']}.value"
        )
        row[f"ratio_{column}_trend"] = _numeric_value(
            ratio.get("trend"), f"technical_ratios.{ratio['description']}.trend"
        )
    return row


def _store_overviews(rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    db_upsert(
        "technical_indicators",
        rows,
        unique_cols=["stock_code", "time_period"],
    )


@router.post("/technical-overview")
async def get_technical_overview(
    request: TechnicalOverviewRequest,
    user=Depends(get_current_user),
):
    """Fetch and store one technical overview without logging the supplied token."""
    del user
    token = _access_token(request.access_token)
    async with httpx.AsyncClient(timeout=30.0) as client:
        data = await _request_overview(client, token, request.symbol, request.timeframe)
    try:
        _store_overview(request.symbol, request.timeframe, data)
    except Exception as exc:
        logger.exception("Failed to store Fyers technical overview for %s", request.symbol)
        raise HTTPException(status_code=500, detail="Fetched technical data but failed to store it.") from exc
    return data


@router.post("/technical-overview/bulk")
async def get_bulk_technical_overview(
    request: BulkTechnicalOverviewRequest,
    user=Depends(get_current_user),
):
    """Fetch technical overviews sequentially, returning individual successes and failures."""
    del user
    token = _access_token(request.access_token)
    details = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        for symbol in request.symbols:
            try:
                data = await _request_overview(client, token, symbol, request.timeframe)
                details.append({"symbol": symbol, "status": "success", "data": data})
            except HTTPException as exc:
                details.append({"symbol": symbol, "status": "failed", "error": exc.detail})

    successful_details = [detail for detail in details if detail["status"] == "success"]
    rows = []
    row_details = []
    for detail in successful_details:
        try:
            rows.append(_technical_indicator_row(detail["symbol"], request.timeframe, detail["data"]))
            row_details.append(detail)
        except ValueError as exc:
            logger.warning("Could not map Fyers indicators for %s: %s", detail["symbol"], exc)
            detail["stored"] = False
            detail["storage_error"] = str(exc)

    stored = 0
    if rows:
        try:
            _store_overviews(rows)
            stored = len(rows)
            for detail in row_details:
                detail["stored"] = True
        except Exception:
            logger.exception("Failed to store Fyers technical overviews for %d symbols", len(rows))
            for detail in row_details:
                detail["stored"] = False
                detail["storage_error"] = "Fetched successfully but failed to save to the database."

    successful = len(successful_details)
    return {
        "total": len(details),
        "success": successful,
        "failed": len(details) - successful,
        "stored": stored,
        "storage_failed": successful - stored,
        "time_period": request.timeframe,
        "details": details,
    }


@router.get("/technical-indicators/{stock_code}")
def get_technical_indicators(
    stock_code: str,
    time_period: str = Query(default="60", pattern=r"^\d{1,3}$"),
    user=Depends(get_current_user),
):
    """Return the stored technical-indicator snapshot for a stock and time period."""
    del user
    code = _stock_code(stock_code.strip().upper())
    rows = db_query(
        """
        SELECT *
        FROM technical_indicators
        WHERE stock_code = %s AND time_period = %s
        LIMIT 1
        """,
        (code, time_period),
    )
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No technical indicators found for {code} at {time_period} minutes.",
        )
    return rows[0]
