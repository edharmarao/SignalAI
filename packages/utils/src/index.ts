import type {
  StrategyJSON,
  DeskType,
  EntryCondition,
  ExitCondition,
  IndicatorCondition,
  ConditionGroup,
  CandleTime,
} from "@signalai/types";
import { isGroup } from "@signalai/types";

export const INDEX_OPTIONS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"] as const;
export const OPTION_TYPES = ["CE", "PE"] as const;
export const STRIKES = ["ATM-100", "ATM-50", "ATM", "ATM+50", "ATM+100"] as const;
export const ACTIONS = ["BUY", "SELL"] as const;
export const CANDLE_TIMES = ["15sec", "1min", "5min", "15min", "1H", "EOD", "Weekly"] as const;
export const EXPIRY_OPTIONS = ["Weekly", "Monthly"] as const;
export const INDICATORS = [
  "RSI",
  "EMA",
  "SMA",
  "VWAP",
  "SUPERTREND",
  "MACD",
  "BBANDS",
] as const;

export const DESK_CANDLE_TIMES: Record<DeskType, readonly CandleTime[]> = {
  equity:         ["5min", "15min", "1H", "EOD"],
  options:        ["1min", "5min", "15min"],
  "mutual-funds": ["EOD"],
};

export const DESK_META: Record<DeskType, { label: string; color: string; description: string }> = {
  equity: {
    label: "Equity",
    color: "emerald",
    description: "Trade Nifty 500 stocks. Trend following, breakout & momentum strategies.",
  },
  options: {
    label: "Options",
    color: "violet",
    description: "CE/PE directional plays. Weekly & monthly expiry, strike selection.",
  },
  "mutual-funds": {
    label: "Mutual Funds",
    color: "sky",
    description: "Track SIPs, holdings, NAV & portfolio returns across fund categories.",
  },
};

export const NIFTY500_STOCKS: Array<{ symbol: string; name: string; sector: string }> = [
  { symbol: "RELIANCE", name: "Reliance Industries", sector: "Energy" },
  { symbol: "TCS", name: "Tata Consultancy Services", sector: "IT" },
  { symbol: "HDFCBANK", name: "HDFC Bank", sector: "Banking" },
  { symbol: "INFY", name: "Infosys", sector: "IT" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", sector: "FMCG" },
  { symbol: "ICICIBANK", name: "ICICI Bank", sector: "Banking" },
  { symbol: "SBIN", name: "State Bank of India", sector: "Banking" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", sector: "Telecom" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", sector: "Banking" },
  { symbol: "LT", name: "Larsen & Toubro", sector: "Infrastructure" },
  { symbol: "AXISBANK", name: "Axis Bank", sector: "Banking" },
  { symbol: "ASIANPAINT", name: "Asian Paints", sector: "Paints" },
  { symbol: "MARUTI", name: "Maruti Suzuki", sector: "Auto" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", sector: "Pharma" },
  { symbol: "TITAN", name: "Titan Company", sector: "Consumer" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", sector: "NBFC" },
  { symbol: "NESTLEIND", name: "Nestle India", sector: "FMCG" },
  { symbol: "WIPRO", name: "Wipro", sector: "IT" },
  { symbol: "HCLTECH", name: "HCL Technologies", sector: "IT" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement", sector: "Cement" },
  { symbol: "TECHM", name: "Tech Mahindra", sector: "IT" },
  { symbol: "POWERGRID", name: "Power Grid Corporation", sector: "Utilities" },
  { symbol: "NTPC", name: "NTPC", sector: "Utilities" },
  { symbol: "COALINDIA", name: "Coal India", sector: "Mining" },
  { symbol: "GRASIM", name: "Grasim Industries", sector: "Diversified" },
  { symbol: "BPCL", name: "Bharat Petroleum", sector: "Energy" },
  { symbol: "ONGC", name: "Oil & Natural Gas Corp", sector: "Energy" },
  { symbol: "IOC", name: "Indian Oil Corporation", sector: "Energy" },
  { symbol: "JSWSTEEL", name: "JSW Steel", sector: "Metals" },
  { symbol: "TATASTEEL", name: "Tata Steel", sector: "Metals" },
  { symbol: "TATAMOTORS", name: "Tata Motors", sector: "Auto" },
  { symbol: "MM", name: "Mahindra & Mahindra", sector: "Auto" },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv", sector: "Financial Services" },
  { symbol: "ADANIPORTS", name: "Adani Ports", sector: "Infrastructure" },
  { symbol: "DRREDDY", name: "Dr. Reddy's Laboratories", sector: "Pharma" },
  { symbol: "CIPLA", name: "Cipla", sector: "Pharma" },
  { symbol: "DIVISLAB", name: "Divi's Laboratories", sector: "Pharma" },
  { symbol: "EICHERMOT", name: "Eicher Motors", sector: "Auto" },
  { symbol: "HEROMOTOCO", name: "Hero MotoCorp", sector: "Auto" },
  { symbol: "HINDALCO", name: "Hindalco Industries", sector: "Metals" },
  { symbol: "INDUSINDBK", name: "IndusInd Bank", sector: "Banking" },
  { symbol: "APOLLOHOSP", name: "Apollo Hospitals", sector: "Healthcare" },
  { symbol: "PIDILITIND", name: "Pidilite Industries", sector: "Chemicals" },
  { symbol: "DMART", name: "Avenue Supermarts (DMart)", sector: "Retail" },
  { symbol: "HAVELLS", name: "Havells India", sector: "Consumer Electricals" },
  { symbol: "MUTHOOTFIN", name: "Muthoot Finance", sector: "NBFC" },
  { symbol: "BERGERPAINTS", name: "Berger Paints", sector: "Paints" },
  { symbol: "COLPAL", name: "Colgate-Palmolive India", sector: "FMCG" },
  { symbol: "DABUR", name: "Dabur India", sector: "FMCG" },
  { symbol: "MARICO", name: "Marico", sector: "FMCG" },
  { symbol: "GODREJCP", name: "Godrej Consumer Products", sector: "FMCG" },
  { symbol: "PGHH", name: "Procter & Gamble Hygiene", sector: "FMCG" },
  { symbol: "BRITANNIA", name: "Britannia Industries", sector: "FMCG" },
  { symbol: "ITC", name: "ITC", sector: "FMCG" },
  { symbol: "TATACONSUM", name: "Tata Consumer Products", sector: "FMCG" },
  { symbol: "VEDL", name: "Vedanta", sector: "Metals" },
  { symbol: "SIEMENS", name: "Siemens India", sector: "Industrials" },
  { symbol: "ABB", name: "ABB India", sector: "Industrials" },
  { symbol: "BHEL", name: "Bharat Heavy Electricals", sector: "Industrials" },
  { symbol: "HAL", name: "Hindustan Aeronautics", sector: "Defence" },
  { symbol: "BEL", name: "Bharat Electronics", sector: "Defence" },
  { symbol: "IRCTC", name: "IRCTC", sector: "Travel" },
  { symbol: "DELHIVERY", name: "Delhivery", sector: "Logistics" },
  { symbol: "NYKAA", name: "Nykaa (FSN E-Commerce)", sector: "E-Commerce" },
  { symbol: "PAYTM", name: "Paytm (One97 Communications)", sector: "Fintech" },
  { symbol: "ZOMATO", name: "Zomato", sector: "Food Tech" },
  { symbol: "POLICYBZR", name: "PB Fintech (Policybazaar)", sector: "Fintech" },
  { symbol: "PERSISTENT", name: "Persistent Systems", sector: "IT" },
  { symbol: "COFORGE", name: "Coforge", sector: "IT" },
  { symbol: "MPHASIS", name: "Mphasis", sector: "IT" },
  { symbol: "LTIM", name: "LTIMindtree", sector: "IT" },
  { symbol: "OFSS", name: "Oracle Financial Services", sector: "IT" },
  { symbol: "TRENT", name: "Trent", sector: "Retail" },
  { symbol: "PAGEIND", name: "Page Industries", sector: "Textiles" },
  { symbol: "VARUNBEV", name: "Varun Beverages", sector: "Beverages" },
  { symbol: "JUBLFOOD", name: "Jubilant Foodworks", sector: "QSR" },
  { symbol: "DEVYANI", name: "Devyani International", sector: "QSR" },
  { symbol: "WESTLIFE", name: "Westlife Foodworld", sector: "QSR" },
  { symbol: "CROMPTON", name: "Crompton Greaves Consumer", sector: "Consumer Electricals" },
  { symbol: "VOLTAS", name: "Voltas", sector: "Consumer Electricals" },
  { symbol: "WHIRLPOOL", name: "Whirlpool of India", sector: "Consumer Electricals" },
  { symbol: "TATAPOWER", name: "Tata Power", sector: "Utilities" },
  { symbol: "ADANIGREEN", name: "Adani Green Energy", sector: "Utilities" },
  { symbol: "TORNTPOWER", name: "Torrent Power", sector: "Utilities" },
  { symbol: "CESC", name: "CESC", sector: "Utilities" },
  { symbol: "NHPC", name: "NHPC", sector: "Utilities" },
  { symbol: "RECLTD", name: "REC Limited", sector: "Financial Services" },
  { symbol: "PFC", name: "Power Finance Corporation", sector: "Financial Services" },
  { symbol: "IRFC", name: "Indian Railway Finance Corp", sector: "Financial Services" },
  { symbol: "MMFIN", name: "Mahindra & Mahindra Financial", sector: "NBFC" },
  { symbol: "CHOLAFIN", name: "Cholamandalam Investment", sector: "NBFC" },
  { symbol: "HDFCLIFE", name: "HDFC Life Insurance", sector: "Insurance" },
  { symbol: "ICICIGI", name: "ICICI Lombard General Insurance", sector: "Insurance" },
  { symbol: "SBILIFE", name: "SBI Life Insurance", sector: "Insurance" },
];

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function countLeaves(g: ConditionGroup<any>): number {
  return g.conditions.reduce(
    (n, c) => n + (isGroup(c) ? countLeaves(c) : 1),
    0
  );
}

function hasStopLoss(g: ConditionGroup<any>): boolean {
  return g.conditions.some((c) =>
    isGroup(c) ? hasStopLoss(c) : (c as any).type === "stop_loss"
  );
}

export function validateStrategy(s: StrategyJSON): ValidationResult {
  const errors: string[] = [];
  if (!s.name?.trim()) errors.push("Strategy name is required.");
  if (s.desk === "equity") {
    if (!s.symbol) errors.push("Stock symbol is required.");
  } else if (s.desk === "options") {
    if (!s.index) errors.push("Index is required.");
    if (!s.optionType) errors.push("Option type (CE/PE) is required.");
    if (!s.strike) errors.push("Strike is required.");
    if (!s.expiry) errors.push("Expiry (Weekly/Monthly) is required.");
  }
  if (!s.action) errors.push("Action is required.");
  if (!s.candleTime) errors.push("Candle time is required.");
  if (!s.quantity || s.quantity <= 0) errors.push("Quantity must be greater than zero.");
  if (!s.entry || countLeaves(s.entry) === 0)
    errors.push("At least one entry condition is required.");
  if (!s.exit || countLeaves(s.exit) === 0)
    errors.push("At least one exit condition is required.");
  if (!hasStopLoss(s.exit)) errors.push("Stop loss is required.");
  if (!s.risk?.maxLossPerDay || s.risk.maxLossPerDay <= 0)
    errors.push("Max daily loss must be set.");
  return { ok: errors.length === 0, errors };
}

export function describeCondition(c: EntryCondition | ExitCondition): string {
  switch (c.type) {
    case "level":
      return `Price ${c.operator} ${c.value}`;
    case "indicator": {
      const ic = c as IndicatorCondition;
      const lhs = `${ic.indicator}${ic.period ? `(${ic.period})` : ""}`;
      const rhs =
        ic.compareTo === "indicator" && ic.rhsIndicator
          ? `${ic.rhsIndicator}${ic.rhsPeriod ? `(${ic.rhsPeriod})` : ""}`
          : ic.compareTo === "price"
          ? "Price"
          : `${ic.value}`;
      return `${lhs} ${ic.operator} ${rhs}`;
    }
    case "time":
      return `Time ${c.operator} ${c.time}`;
    case "stop_loss":
      return `Stop loss = ${c.value} pts`;
    case "target":
      return `Target = ${c.value} pts`;
    case "trailing_stop_loss":
      return `Trailing SL = ${c.value} pts`;
    case "time_exit":
      return `Time exit @ ${c.time}`;
    default:
      return JSON.stringify(c);
  }
}

export function describeGroup(g: ConditionGroup<any>): string {
  if (!g.conditions.length) return "(empty)";
  const parts = g.conditions.map((c) =>
    isGroup(c) ? `(${describeGroup(c)})` : describeCondition(c as any)
  );
  return parts.join(` ${g.logic} `);
}

export function describeStrategy(s: StrategyJSON): string {
  if (s.desk === "equity") {
    return `${s.action} ${s.quantity} shares of ${s.symbol ?? "?"} on ${s.candleTime} candle. Enter when ${describeGroup(s.entry)}. Exit when ${describeGroup(s.exit)}.`;
  }
  return `${s.action} ${s.quantity}x ${s.index} ${s.strike ?? ""} ${s.optionType ?? ""} on ${s.candleTime} candle. Enter when ${describeGroup(s.entry)}. Exit when ${describeGroup(s.exit)}.`;
}

export function emptyStrategy(name = "New Strategy"): StrategyJSON {
  return emptyStrategyForDesk("equity", name);
}

export function emptyStrategyForDesk(desk: DeskType, name = "New Strategy"): StrategyJSON {
  const isOptions = desk === "options";
  const isEquity = desk === "equity";
  const base: StrategyJSON = {
    version: 1,
    name,
    desk,
    ...(isOptions ? { index: "NIFTY" as const } : {}),
    ...(isEquity ? { symbol: "RELIANCE", universe: "Nifty 500" } : {}),
    ...(isOptions ? { optionType: "CE" as const, strike: "ATM" as const } : {}),
    action: "BUY",
    candleTime: isEquity ? "EOD" : isOptions ? "5min" : "EOD",
    quantity: isEquity ? 100 : 1,
    mode: "paper",
    status: "draft",
    entry: { logic: "AND", conditions: [] },
    exit: {
      logic: "OR",
      conditions: [
        { type: "stop_loss", value: isOptions ? 20 : 50 },
        { type: "target", value: isOptions ? 50 : 100 },
        ...(isOptions ? [{ type: "time_exit" as const, time: "15:15" }] : []),
      ],
    },
    risk: {
      maxLossPerDay: isEquity ? 10000 : isOptions ? 2000 : 5000,
      maxTradesPerDay: 3,
      maxOpenPositions: isEquity ? 5 : 1,
      ...(isOptions ? { autoSquareOffTime: "15:20" } : {}),
      killSwitch: false,
      ...(isEquity ? { holdDays: 30 } : {}),
    },
    ...(isOptions ? { expiry: "Weekly" as const } : {}),
    ...(isEquity ? { holdDays: 30 } : {}),
  };
  return base;
}

export const TEMPLATES: Record<string, StrategyJSON> = {
  // ── Equity ────────────────────────────────────────────────────────────────
  "EMA Crossover (RELIANCE)": {
    ...emptyStrategyForDesk("equity", "EMA Crossover – RELIANCE"),
    symbol: "RELIANCE",
    candleTime: "EOD",
    entry: {
      logic: "AND",
      conditions: [
        {
          type: "indicator", indicator: "EMA", period: 9,
          operator: "crosses_above", compareTo: "indicator",
          rhsIndicator: "EMA", rhsPeriod: 21,
        },
      ],
    },
    exit: {
      logic: "OR",
      conditions: [
        {
          type: "indicator", indicator: "EMA", period: 9,
          operator: "crosses_below", compareTo: "indicator",
          rhsIndicator: "EMA", rhsPeriod: 21,
        },
        { type: "stop_loss", value: 50 },
      ],
    },
  },
  "RSI Oversold (TCS)": {
    ...emptyStrategyForDesk("equity", "RSI Oversold – TCS"),
    symbol: "TCS",
    candleTime: "EOD",
    entry: {
      logic: "AND",
      conditions: [
        { type: "indicator", indicator: "RSI", period: 14, operator: "<", value: 35 },
      ],
    },
    exit: {
      logic: "OR",
      conditions: [
        { type: "indicator", indicator: "RSI", period: 14, operator: ">", value: 60 },
        { type: "stop_loss", value: 50 },
      ],
    },
  },
  "MACD Signal (HDFCBANK)": {
    ...emptyStrategyForDesk("equity", "MACD Signal – HDFCBANK"),
    symbol: "HDFCBANK",
    candleTime: "EOD",
    entry: {
      logic: "AND",
      conditions: [
        {
          type: "indicator", indicator: "MACD",
          fast: 12, slow: 26, signal: 9,
          operator: "crosses_above", compareTo: "indicator",
        },
      ],
    },
    exit: {
      logic: "OR",
      conditions: [
        {
          type: "indicator", indicator: "MACD",
          fast: 12, slow: 26, signal: 9,
          operator: "crosses_below", compareTo: "indicator",
        },
        { type: "stop_loss", value: 50 },
      ],
    },
  },
  // ── Options ───────────────────────────────────────────────────────────────
  "RSI CE Breakout": {
    ...emptyStrategyForDesk("options", "NIFTY RSI CE Breakout"),
    index: "NIFTY",
    optionType: "CE", expiry: "Weekly",
    entry: {
      logic: "AND",
      conditions: [
        { type: "indicator", indicator: "RSI", period: 14, operator: ">", value: 60 },
        { type: "level", field: "price", operator: ">", value: 22500 },
      ],
    },
  },
  "VWAP CE Entry": {
    ...emptyStrategyForDesk("options", "NIFTY VWAP CE Entry"),
    index: "NIFTY",
    optionType: "CE", expiry: "Weekly",
    entry: {
      logic: "AND",
      conditions: [
        { type: "indicator", indicator: "VWAP", operator: "crosses_above", compareTo: "price" },
      ],
    },
  },
  "Supertrend PE": {
    ...emptyStrategyForDesk("options", "BANKNIFTY Supertrend PE"),
    index: "BANKNIFTY", optionType: "PE", expiry: "Monthly",
    entry: {
      logic: "AND",
      conditions: [
        {
          type: "indicator", indicator: "SUPERTREND",
          period: 10, multiplier: 3,
          operator: "crosses_above", compareTo: "price",
        },
      ],
    },
  },
};

export const DESK_TEMPLATES: Record<DeskType, string[]> = {
  equity:         ["EMA Crossover (RELIANCE)", "RSI Oversold (TCS)", "MACD Signal (HDFCBANK)"],
  options:        ["RSI CE Breakout", "VWAP CE Entry", "Supertrend PE"],
  "mutual-funds": [],
};
