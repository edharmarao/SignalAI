from __future__ import annotations
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

IndexSymbol = Literal["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"]
OptionType = Literal["CE", "PE"]
StrikeOffset = Literal["ATM", "ATM+50", "ATM+100", "ATM-50", "ATM-100"]
ActionT = Literal["BUY", "SELL"]
CandleTime = Literal["15sec", "1min", "5min", "15min"]
ModeT = Literal["paper", "live"]
StatusT = Literal["draft", "active", "paused", "stopped"]
LogicT = Literal["AND", "OR"]


class Risk(BaseModel):
    maxLossPerDay: float
    maxTradesPerDay: int
    maxOpenPositions: int
    autoSquareOffTime: str
    killSwitch: bool = False


class StrategyJSON(BaseModel):
    version: int = 1
    name: str
    index: IndexSymbol
    optionType: OptionType
    strike: StrikeOffset
    action: ActionT
    candleTime: CandleTime
    quantity: int
    mode: ModeT = "paper"
    status: StatusT = "draft"
    entry: dict[str, Any]
    exit: dict[str, Any]
    risk: Risk


class StrategyCreate(BaseModel):
    name: str
    strategy_json: StrategyJSON
    mode: ModeT = "paper"
    status: StatusT = "draft"


class StrategyUpdate(BaseModel):
    name: Optional[str] = None
    strategy_json: Optional[StrategyJSON] = None
    is_active: Optional[bool] = None
    mode: Optional[ModeT] = None
    status: Optional[StatusT] = None


class BacktestRequest(BaseModel):
    strategy_json: StrategyJSON
    candles: Optional[list[dict[str, Any]]] = Field(
        default=None,
        description="Optional OHLCV list. Each item: {time, open, high, low, close, volume}.",
    )
    days: int = 5


class LogCreate(BaseModel):
    strategy_id: Optional[str] = None
    level: Literal["info", "warn", "error", "signal"] = "info"
    event: str
    data: dict[str, Any] = {}
