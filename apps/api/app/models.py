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


# ── Upstox market-data models ─────────────────────────────────────────────────

class CandleData(BaseModel):
    time: str = Field(..., description="Candle timestamp (YYYY-MM-DD HH:MM:SS, IST naive)")
    open: float
    high: float
    low: float
    close: float
    volume: int
    oi: int = 0


class HistoricalCandleResponse(BaseModel):
    status: str
    candles: list[CandleData]


class BulkHistoricalImportRequest(BaseModel):
    stock_codes: list[str] = Field(..., description="e.g. ['RELIANCE', 'TCS', 'INFY']")
    exchange: str = Field(..., description="NSE_EQ | BSE_EQ | NSE_FO | BSE_FO | MCX_FO")
    from_date: str = Field(..., description="YYYY-MM-DD")
    to_date: str = Field(..., description="YYYY-MM-DD")
    interval_type: str = Field(..., description="minutes | hours | days | weeks | months")
    interval_value: str = Field(..., description="e.g. 1, 5, 15, 30")


class IntradayImportRequest(BaseModel):
    stock_codes: list[str] = Field(..., description="e.g. ['RELIANCE', 'TCS']")
    exchange: str = Field("NSE_EQ", description="NSE_EQ | BSE_EQ | NSE_FO | BSE_FO | MCX_FO")
    interval_type: str = Field(..., description="minutes | hours (intraday only)")
    interval_value: str = Field(..., description="e.g. 1, 5, 15")


# ── ORB Strategy models ───────────────────────────────────────────────────────

ORBTimeframe = Literal["1min", "5min", "15min", "30min", "1h", "1hour", "eod"]


class ORBBacktestRequest(BaseModel):
    symbol: str = Field(..., description="Stock/index symbol e.g. RELIANCE, NIFTY")
    timeframe: ORBTimeframe = Field("5min", description="Candle timeframe")
    from_date: str = Field(..., description="YYYY-MM-DD")
    to_date: str = Field(..., description="YYYY-MM-DD")
    qty: int = Field(1, ge=1, le=50000, description="Quantity per trade")
    candles: Optional[list[dict[str, Any]]] = Field(
        default=None,
        description="Optional OHLCV list to override DB fetch. Each item: {time, open, high, low, close, volume}.",
    )


class ORBLiveRequest(BaseModel):
    symbols: list[str] = Field(..., description="List of symbols to scan")
    timeframe: ORBTimeframe = Field("5min", description="Candle timeframe")
    qty: int = Field(1, ge=1, le=50000)
    mode: ModeT = Field("paper", description="paper | live")
    confirm_live: bool = Field(False, description="Must be true for live orders")


class ORBSignalResponse(BaseModel):
    symbol: str
    date: str
    timeframe: str
    triggered: bool
    breakout_type: str = ""
    entry_price: float = 0.0
    stop_loss: float = 0.0
    target: float = 0.0
    risk: float = 0.0
    or_high: float = 0.0
    or_low: float = 0.0
    volume_ok: bool = False
    breakout_candle_time: str = ""
    error: str = ""
