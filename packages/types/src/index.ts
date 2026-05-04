export type IndexSymbol = "NIFTY" | "BANKNIFTY" | "FINNIFTY" | "SENSEX";
export type OptionType = "CE" | "PE";
export type StrikeOffset = "ATM" | "ATM+50" | "ATM+100" | "ATM-50" | "ATM-100";
export type Action = "BUY" | "SELL";
export type CandleTime = "15sec" | "1min" | "5min" | "15min";
export type Mode = "paper" | "live";
export type StrategyStatus = "draft" | "active" | "paused" | "stopped";
export type Logic = "AND" | "OR";
export type Operator = ">" | "<" | ">=" | "<=" | "==" | "crosses_above" | "crosses_below";

export type IndicatorName =
  | "RSI"
  | "EMA"
  | "SMA"
  | "VWAP"
  | "SUPERTREND"
  | "MACD"
  | "BBANDS";

export interface LevelCondition {
  type: "level";
  field: "price";
  operator: Operator;
  value: number;
}

export interface IndicatorCondition {
  type: "indicator";
  indicator: IndicatorName;
  period?: number;
  // Supertrend
  multiplier?: number;
  // MACD
  fast?: number;
  slow?: number;
  signal?: number;
  // BBANDS
  stddev?: number;
  // comparison target
  operator: Operator;
  value?: number;        // compare to literal (e.g. RSI > 60)
  compareTo?: "price" | "indicator";
  // optional secondary indicator (e.g. price crosses EMA20)
  rhsIndicator?: IndicatorName;
  rhsPeriod?: number;
}

export interface TimeCondition {
  type: "time";
  operator: ">=" | "<=" | "==";
  time: string; // "HH:MM"
}

export type EntryCondition = LevelCondition | IndicatorCondition | TimeCondition;

export interface ConditionGroup<T = EntryCondition | ExitCondition> {
  logic: Logic;
  conditions: Array<T | ConditionGroup<T>>;
}

export function isGroup<T>(c: any): c is ConditionGroup<T> {
  return c && Array.isArray(c.conditions) && (c.logic === "AND" || c.logic === "OR");
}

export interface ExitStopLoss { type: "stop_loss"; value: number; }
export interface ExitTarget { type: "target"; value: number; }
export interface ExitTrailing { type: "trailing_stop_loss"; value: number; }
export interface ExitTime { type: "time_exit"; time: string; }
export interface ExitLevel { type: "level"; field: "price"; operator: Operator; value: number; }
export interface ExitIndicator extends IndicatorCondition {}

export type ExitCondition =
  | ExitStopLoss
  | ExitTarget
  | ExitTrailing
  | ExitTime
  | ExitLevel
  | ExitIndicator;

export interface RiskControls {
  maxLossPerDay: number;
  maxTradesPerDay: number;
  maxOpenPositions: number;
  autoSquareOffTime: string; // "HH:MM"
  killSwitch?: boolean;
}

export interface StrategyJSON {
  version: 1;
  name: string;
  index: IndexSymbol;
  optionType: OptionType;
  strike: StrikeOffset;
  action: Action;
  candleTime: CandleTime;
  quantity: number;
  mode: Mode;
  status: StrategyStatus;
  entry: ConditionGroup<EntryCondition>;
  exit: ConditionGroup<ExitCondition>;
  risk: RiskControls;
}

export interface StrategyRow {
  id: string;
  user_id: string;
  name: string;
  strategy_json: StrategyJSON;
  is_active: boolean;
  mode: Mode;
  status: StrategyStatus;
  created_at: string;
  updated_at: string;
}

export interface TradeRow {
  id: string;
  user_id: string;
  strategy_id: string;
  symbol: string;
  action: Action;
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  pnl: number | null;
  mode: Mode;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
}

export interface OrderRow {
  id: string;
  user_id: string;
  strategy_id: string;
  trade_id: string | null;
  symbol: string;
  side: Action;
  quantity: number;
  price: number;
  order_type: "MARKET" | "LIMIT";
  mode: Mode;
  status: "pending" | "filled" | "rejected" | "cancelled";
  broker_order_id: string | null;
  created_at: string;
}

export interface LogRow {
  id: string;
  user_id: string;
  strategy_id: string | null;
  level: "info" | "warn" | "error" | "signal";
  event: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface BrokerAccountRow {
  id: string;
  user_id: string;
  broker: "upstox";
  client_id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BacktestResult {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  pnl: number;
  maxDrawdown: number;
  trades: Array<{
    entryTime: string;
    exitTime: string;
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    reason: string;
  }>;
}
