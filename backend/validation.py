"""Strategy validation mirroring packages/utils/validateStrategy."""
from __future__ import annotations
from typing import Any
from models import StrategyJSON


def _is_group(c: Any) -> bool:
    return isinstance(c, dict) and "logic" in c and "conditions" in c


def _count_leaves(g: dict) -> int:
    n = 0
    for c in (g or {}).get("conditions") or []:
        n += _count_leaves(c) if _is_group(c) else 1
    return n


def _has_type(g: dict, t: str) -> bool:
    for c in (g or {}).get("conditions") or []:
        if _is_group(c):
            if _has_type(c, t):
                return True
        elif c.get("type") == t:
            return True
    return False


def validate_strategy(s: StrategyJSON) -> list[str]:
    errors: list[str] = []
    if not s.name.strip():
        errors.append("Strategy name is required.")
    if s.desk == "equity":
        if not s.symbol:
            errors.append("Stock symbol is required.")
    elif s.desk == "options":
        if not s.index:
            errors.append("Index is required.")
        if not s.optionType:
            errors.append("Option type (CE/PE) is required.")
        if not s.strike:
            errors.append("Strike is required.")
        if not s.expiry:
            errors.append("Expiry (Weekly/Monthly) is required.")
    if not s.action:
        errors.append("Action is required.")
    if not s.candleTime:
        errors.append("Candle time is required.")
    if s.quantity <= 0:
        errors.append("Quantity must be greater than zero.")
    if _count_leaves(s.entry or {}) == 0:
        errors.append("At least one entry condition is required.")
    if _count_leaves(s.exit or {}) == 0:
        errors.append("At least one exit condition is required.")
    if not _has_type(s.exit or {}, "stop_loss"):
        errors.append("Stop loss is required.")
    if not s.risk or s.risk.maxLossPerDay <= 0:
        errors.append("Max daily loss must be set.")
    return errors
