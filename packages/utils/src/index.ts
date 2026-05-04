import type {
  StrategyJSON,
  EntryCondition,
  ExitCondition,
  IndicatorCondition,
} from "@signalai/types";

export const INDEX_OPTIONS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"] as const;
export const OPTION_TYPES = ["CE", "PE"] as const;
export const STRIKES = ["ATM-100", "ATM-50", "ATM", "ATM+50", "ATM+100"] as const;
export const ACTIONS = ["BUY", "SELL"] as const;
export const CANDLE_TIMES = ["15sec", "1min", "5min", "15min"] as const;
export const INDICATORS = [
  "RSI",
  "EMA",
  "SMA",
  "VWAP",
  "SUPERTREND",
  "MACD",
  "BBANDS",
] as const;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateStrategy(s: StrategyJSON): ValidationResult {
  const errors: string[] = [];
  if (!s.name?.trim()) errors.push("Strategy name is required.");
  if (!s.index) errors.push("Index is required.");
  if (!s.optionType) errors.push("Option type is required.");
  if (!s.strike) errors.push("Strike is required.");
  if (!s.action) errors.push("Action is required.");
  if (!s.candleTime) errors.push("Candle time is required.");
  if (!s.quantity || s.quantity <= 0) errors.push("Quantity must be greater than zero.");
  if (!s.entry?.conditions?.length) errors.push("At least one entry condition is required.");
  if (s.entry?.conditions?.length > 2)
    errors.push("Maximum two entry indicator conditions are supported.");
  if (!s.exit?.conditions?.length) errors.push("At least one exit condition is required.");
  const hasSL = s.exit?.conditions?.some((c) => c.type === "stop_loss");
  if (!hasSL) errors.push("Stop loss is required.");
  if (!s.risk?.maxLossPerDay || s.risk.maxLossPerDay <= 0)
    errors.push("Max daily loss must be set.");
  if (!s.risk?.autoSquareOffTime) errors.push("Auto square-off time is required.");
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

export function describeStrategy(s: StrategyJSON): string {
  const entry = s.entry.conditions.map(describeCondition).join(` ${s.entry.logic} `);
  const exit = s.exit.conditions.map(describeCondition).join(` ${s.exit.logic} `);
  return `${s.action} ${s.quantity}x ${s.index} ${s.strike} ${s.optionType} on ${s.candleTime} candle. Enter when ${entry}. Exit when ${exit}.`;
}

export function emptyStrategy(name = "New Strategy"): StrategyJSON {
  return {
    version: 1,
    name,
    index: "NIFTY",
    optionType: "CE",
    strike: "ATM",
    action: "BUY",
    candleTime: "5min",
    quantity: 1,
    mode: "paper",
    status: "draft",
    entry: { logic: "AND", conditions: [] },
    exit: {
      logic: "OR",
      conditions: [
        { type: "stop_loss", value: 20 },
        { type: "target", value: 50 },
        { type: "time_exit", time: "15:15" },
      ],
    },
    risk: {
      maxLossPerDay: 2000,
      maxTradesPerDay: 3,
      maxOpenPositions: 1,
      autoSquareOffTime: "15:20",
      killSwitch: false,
    },
  };
}

export const TEMPLATES: Record<string, StrategyJSON> = {
  "RSI Breakout": {
    ...emptyStrategy("NIFTY RSI Breakout"),
    entry: {
      logic: "AND",
      conditions: [
        { type: "indicator", indicator: "RSI", period: 14, operator: ">", value: 60 },
      ],
    },
  },
  "EMA Crossover": {
    ...emptyStrategy("NIFTY EMA Crossover"),
    entry: {
      logic: "AND",
      conditions: [
        {
          type: "indicator",
          indicator: "EMA",
          period: 9,
          operator: "crosses_above",
          compareTo: "indicator",
          rhsIndicator: "EMA",
          rhsPeriod: 21,
        },
      ],
    },
  },
  "VWAP Reversal": {
    ...emptyStrategy("NIFTY VWAP Reversal"),
    entry: {
      logic: "AND",
      conditions: [
        {
          type: "indicator",
          indicator: "VWAP",
          operator: "crosses_above",
          compareTo: "price",
        },
      ],
    },
  },
  "Supertrend Trend-Following": {
    ...emptyStrategy("NIFTY Supertrend"),
    entry: {
      logic: "AND",
      conditions: [
        {
          type: "indicator",
          indicator: "SUPERTREND",
          period: 10,
          multiplier: 3,
          operator: "crosses_above",
          compareTo: "price",
        },
      ],
    },
  },
  "Level Breakout": {
    ...emptyStrategy("NIFTY Level Breakout"),
    entry: {
      logic: "AND",
      conditions: [{ type: "level", field: "price", operator: ">", value: 22500 }],
    },
  },
};
