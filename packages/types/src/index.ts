export type IndexSymbol = "NIFTY" | "BANKNIFTY" | "FINNIFTY" | "SENSEX";
export type OptionType = "CE" | "PE";
export type StrikeOffset = "ATM" | "ATM+50" | "ATM+100" | "ATM-50" | "ATM-100";
export type Action = "BUY" | "SELL";
export type CandleTime = "15sec" | "1min" | "5min" | "15min" | "1H" | "EOD" | "Weekly";
export type Mode = "paper" | "live";
export type StrategyStatus = "draft" | "active" | "paused" | "stopped";
export type Logic = "AND" | "OR";
export type Operator = ">" | "<" | ">=" | "<=" | "==" | "crosses_above" | "crosses_below";

export type DeskType = "equity" | "mutual-funds" | "options";
export type ExpiryType = "Weekly" | "Monthly";

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
  autoSquareOffTime?: string; // "HH:MM" — required for intraday, optional for swing
  killSwitch?: boolean;
  holdDays?: number; // swing desk: max days to hold a position
}

export interface StrategyJSON {
  version: 1;
  name: string;
  desk: DeskType;
  index?: IndexSymbol;
  symbol?: string;           // equity stock ticker (RELIANCE, TCS, etc.)
  universe?: string;         // Nifty 50/100/500/Midcap 100
  optionType?: OptionType;  // not used for equity desk
  strike?: StrikeOffset;    // not used for equity desk
  action: Action;
  candleTime: CandleTime;
  quantity: number;
  mode: Mode;
  status: StrategyStatus;
  expiry?: ExpiryType;      // options desk only
  holdDays?: number;        // future use
  entry: ConditionGroup<EntryCondition>;
  exit: ConditionGroup<ExitCondition>;
  risk: RiskControls;
}

// ── Mutual Funds ─────────────────────────────────────────────────────────────

export type MFCategory =
  | "Large Cap" | "Mid Cap" | "Small Cap" | "Flexi Cap"
  | "ELSS" | "Index" | "Debt" | "Hybrid";

export type SIPFrequency = "Monthly" | "Quarterly";

export interface MutualFundHolding {
  id: string;
  user_id: string;
  fund_name: string;
  category: MFCategory;
  folio: string;
  invested: number;     // total amount invested ₹
  units: number;
  nav: number;          // current NAV ₹
  current_value: number;
  xirr: number;         // annualised return %
  sip_amount?: number;  // monthly SIP if active
  sip_day?: number;     // day of month
  sip_frequency?: SIPFrequency;
  started_at: string;
  updated_at: string;
}

export interface SIPEntry {
  id: string;
  user_id: string;
  fund_id: string;
  fund_name: string;
  amount: number;
  frequency: SIPFrequency;
  day: number;          // day of month
  next_date: string;
  status: "active" | "paused" | "stopped";
  created_at: string;
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
