from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

IndexSymbol = Literal["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"]
OptionType = Literal["CE", "PE"]
StrikeOffset = Literal["ATM", "ATM+50", "ATM+100", "ATM-50", "ATM-100"]
ActionT = Literal["BUY", "SELL"]
DeskType = Literal["equity", "mutual-funds", "options"]
CandleTime = Literal["15sec", "1min", "5min", "15min", "1H", "EOD", "Weekly"]
ModeT = Literal["paper", "live"]
StatusT = Literal["draft", "active", "paused", "stopped"]
ExpiryType = Literal["Weekly", "Monthly"]
LogicT = Literal["AND", "OR"]


class Risk(BaseModel):
    model_config = ConfigDict(extra="forbid")

    maxLossPerDay: float
    maxTradesPerDay: int
    maxOpenPositions: int
    autoSquareOffTime: Optional[str] = None
    killSwitch: bool = False
    holdDays: Optional[int] = None


class StrategyJSON(BaseModel):
    model_config = ConfigDict(extra="allow")

    version: int = 1
    name: str
    desk: DeskType
    index: Optional[IndexSymbol] = None
    symbol: Optional[str] = None
    universe: Optional[str] = None
    optionType: Optional[OptionType] = None
    strike: Optional[StrikeOffset] = None
    action: ActionT
    candleTime: CandleTime
    quantity: int = Field(ge=1, le=50000)
    mode: ModeT = "paper"
    status: StatusT = "draft"
    expiry: Optional[ExpiryType] = None
    holdDays: Optional[int] = None
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
    days: int = Field(default=5, ge=1, le=365)


class LogCreate(BaseModel):
    strategy_id: Optional[str] = None
    level: Literal["info", "warn", "error", "signal"] = "info"
    event: str
    data: dict[str, Any] = {}
