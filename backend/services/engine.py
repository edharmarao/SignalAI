"""Strategy condition evaluation + backtesting + paper trading engine.

Operates on a pandas DataFrame of OHLCV candles. Conditions are evaluated
candle-by-candle so the same code paths support both backtesting and a
realistic paper-trading simulation."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any
import pandas as pd

from services import indicators as ind


OPS = {
    ">": lambda a, b: a > b,
    "<": lambda a, b: a < b,
    ">=": lambda a, b: a >= b,
    "<=": lambda a, b: a <= b,
    "==": lambda a, b: a == b,
}


def _resolve_lhs(df: pd.DataFrame, c: dict[str, Any]) -> pd.Series:
    return ind.compute(df, c["indicator"], **c)


def _resolve_rhs(df: pd.DataFrame, c: dict[str, Any]) -> pd.Series:
    if c.get("compareTo") == "price":
        return df["close"]
    if c.get("compareTo") == "indicator" and c.get("rhsIndicator"):
        return ind.compute(df, c["rhsIndicator"], period=c.get("rhsPeriod", 20))
    return pd.Series([c.get("value", 0)] * len(df), index=df.index)


def evaluate_condition(df: pd.DataFrame, cond: dict[str, Any]) -> pd.Series:
    t = cond.get("type")
    if t == "level":
        return OPS[cond["operator"]](df["close"], cond["value"])
    if t == "indicator":
        lhs = _resolve_lhs(df, cond)
        rhs = _resolve_rhs(df, cond)
        op = cond["operator"]
        if op == "crosses_above":
            return (lhs > rhs) & (lhs.shift(1) <= rhs.shift(1))
        if op == "crosses_below":
            return (lhs < rhs) & (lhs.shift(1) >= rhs.shift(1))
        return OPS[op](lhs, rhs)
    if t == "time":
        ts = pd.to_datetime(df["time"]).dt.strftime("%H:%M")
        op = cond["operator"]
        return OPS.get(op, OPS["=="])(ts, cond["time"])
    return pd.Series([False] * len(df), index=df.index)


def evaluate_group(df: pd.DataFrame, group: dict[str, Any]) -> pd.Series:
    conds = group.get("conditions") or []
    if not conds:
        return pd.Series([False] * len(df), index=df.index)
    masks = []
    for c in conds:
        if isinstance(c, dict) and "logic" in c and "conditions" in c:
            masks.append(evaluate_group(df, c))
        else:
            masks.append(evaluate_condition(df, c))
    if group.get("logic") == "OR":
        out = masks[0]
        for m in masks[1:]:
            out = out | m
        return out.fillna(False)
    out = masks[0]
    for m in masks[1:]:
        out = out & m
    return out.fillna(False)


@dataclass
class TradeRecord:
    entryTime: str
    entryPrice: float
    exitTime: str = ""
    exitPrice: float = 0.0
    pnl: float = 0.0
    reason: str = ""
    qty: int = 1
    side: str = "BUY"


@dataclass
class EngineResult:
    trades: list[TradeRecord] = field(default_factory=list)
    pnl: float = 0.0
    max_drawdown: float = 0.0

    @property
    def wins(self) -> int:
        return sum(1 for t in self.trades if t.pnl > 0)

    @property
    def losses(self) -> int:
        return sum(1 for t in self.trades if t.pnl <= 0)

    @property
    def win_rate(self) -> float:
        return (self.wins / len(self.trades)) if self.trades else 0.0


def _exit_pnl(side: str, entry: float, current: float, qty: int) -> float:
    return (current - entry) * qty if side == "BUY" else (entry - current) * qty


def _strip_simple_exits(group: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of the group with stop_loss/target/trailing_stop_loss/time_exit
    leaves removed, preserving nested group structure for indicator/level exits."""
    SIMPLE = {"stop_loss", "target", "trailing_stop_loss", "time_exit"}
    out_conds: list[Any] = []
    for c in (group or {}).get("conditions") or []:
        if isinstance(c, dict) and "logic" in c and "conditions" in c:
            sub = _strip_simple_exits(c)
            if sub["conditions"]:
                out_conds.append(sub)
        elif c.get("type") not in SIMPLE:
            out_conds.append(c)
    return {"logic": (group or {}).get("logic") or "OR", "conditions": out_conds}


def _flatten(group: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten a possibly-nested condition group into a list of leaf conditions.
    Used by the SL/TP/time-exit extraction path in the engine."""
    out: list[dict[str, Any]] = []
    for c in (group or {}).get("conditions") or []:
        if isinstance(c, dict) and "logic" in c and "conditions" in c:
            out.extend(_flatten(c))
        else:
            out.append(c)
    return out


def run_strategy(df: pd.DataFrame, strategy: dict[str, Any]) -> EngineResult:
    """Evaluate strategy on candle DataFrame. Returns trade list + stats."""
    df = df.reset_index(drop=True).copy()
    if "time" not in df.columns:
        default_freq = "1D" if strategy.get("candleTime") in {"EOD", "Weekly"} else "5min"
        df["time"] = pd.date_range("2024-01-01 09:15", periods=len(df), freq=default_freq).astype(str)

    entry_mask = evaluate_group(df, strategy["entry"])
    exit_group = strategy["exit"] or {}
    exit_conds = _flatten(exit_group)
    side = strategy.get("action", "BUY")
    desk = strategy.get("desk", "options")
    qty_multiplier = 1 if desk == "equity" else 50
    qty = int(strategy.get("quantity", 1)) * qty_multiplier

    sl = next((c.get("value") for c in exit_conds if c.get("type") == "stop_loss"), None)
    tp = next((c.get("value") for c in exit_conds if c.get("type") == "target"), None)
    tsl = next((c.get("value") for c in exit_conds if c.get("type") == "trailing_stop_loss"), None)
    time_exit = next((c.get("time") for c in exit_conds if c.get("type") == "time_exit"), None)
    # Indicator/level exits keep their original group structure so AND/OR + nesting are honored.
    indicator_exit_mask = evaluate_group(df, _strip_simple_exits(exit_group))

    risk = strategy.get("risk", {}) or {}
    max_trades = int(risk.get("maxTradesPerDay", 999))
    max_loss = float(risk.get("maxLossPerDay", 1e12))
    auto_sq = risk.get("autoSquareOffTime")

    result = EngineResult()
    in_pos = False
    entry_price = 0.0
    entry_idx = 0
    extreme = 0.0  # high-water for trailing SL
    daily_pnl = 0.0
    daily_trades = 0
    last_day = None
    equity = 0.0
    peak = 0.0

    for i, row in df.iterrows():
        ts = str(row["time"])
        day = ts[:10]
        if last_day != day:
            last_day = day
            daily_pnl = 0.0
            daily_trades = 0

        # Risk halts
        if daily_pnl <= -max_loss or daily_trades >= max_trades:
            if in_pos:
                pnl = _exit_pnl(side, entry_price, row["close"], qty)
                result.trades[-1].exitTime = ts
                result.trades[-1].exitPrice = float(row["close"])
                result.trades[-1].pnl = pnl
                result.trades[-1].reason = "risk_halt"
                result.pnl += pnl
                daily_pnl += pnl
                in_pos = False
            continue

        if not in_pos and bool(entry_mask.iloc[i]):
            entry_price = float(row["close"])
            extreme = entry_price
            entry_idx = i
            in_pos = True
            result.trades.append(
                TradeRecord(entryTime=ts, entryPrice=entry_price, qty=qty, side=side)
            )
            daily_trades += 1
            continue

        if in_pos:
            price = float(row["close"])
            extreme = max(extreme, price) if side == "BUY" else min(extreme, price)
            unrealized = _exit_pnl(side, entry_price, price, qty)
            reason = None
            if sl is not None and unrealized <= -abs(sl) * qty:
                reason = "stop_loss"
            elif tp is not None and unrealized >= abs(tp) * qty:
                reason = "target"
            elif tsl is not None:
                trail_trigger = (extreme - price) if side == "BUY" else (price - extreme)
                if trail_trigger >= abs(tsl):
                    reason = "trailing_stop_loss"
            if reason is None and bool(indicator_exit_mask.iloc[i]):
                reason = "indicator_exit"
            if reason is None and time_exit and ts.split(" ")[-1][:5] >= time_exit:
                reason = "time_exit"
            if reason is None and auto_sq and ts.split(" ")[-1][:5] >= auto_sq:
                reason = "auto_square_off"

            if reason:
                result.trades[-1].exitTime = ts
                result.trades[-1].exitPrice = price
                result.trades[-1].pnl = unrealized
                result.trades[-1].reason = reason
                result.pnl += unrealized
                daily_pnl += unrealized
                equity += unrealized
                peak = max(peak, equity)
                dd = peak - equity
                if dd > result.max_drawdown:
                    result.max_drawdown = dd
                in_pos = False

    return result
