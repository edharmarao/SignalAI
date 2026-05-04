"""Strategy validation mirroring packages/utils/validateStrategy."""
from __future__ import annotations
from .models import StrategyJSON


def validate_strategy(s: StrategyJSON) -> list[str]:
    errors: list[str] = []
    if not s.name.strip():
        errors.append("Strategy name is required.")
    if s.quantity <= 0:
        errors.append("Quantity must be greater than zero.")

    entry_conds = (s.entry or {}).get("conditions") or []
    if not entry_conds:
        errors.append("At least one entry condition is required.")
    if len(entry_conds) > 2:
        errors.append("Maximum two entry indicator conditions are supported.")

    exit_conds = (s.exit or {}).get("conditions") or []
    if not exit_conds:
        errors.append("At least one exit condition is required.")
    if not any(c.get("type") == "stop_loss" for c in exit_conds):
        errors.append("Stop loss is required.")

    if not s.risk or s.risk.maxLossPerDay <= 0:
        errors.append("Max daily loss must be set.")
    if not s.risk.autoSquareOffTime:
        errors.append("Auto square-off time is required.")
    return errors
