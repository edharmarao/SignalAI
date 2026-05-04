/**
 * Mock data + in-browser API simulator.
 *
 * Lets the whole UI run with `npm run dev` and zero backend.
 * When NEXT_PUBLIC_USE_MOCK=false we route through the real FastAPI instead.
 */
import type {
  StrategyJSON,
  StrategyRow,
  TradeRow,
  OrderRow,
  LogRow,
  BacktestResult,
} from "@signalai/types";
import { TEMPLATES } from "@signalai/utils";

const LS_KEY = "signalai:mock:v1";

interface Store {
  strategies: StrategyRow[];
  trades: TradeRow[];
  orders: OrderRow[];
  logs: LogRow[];
  broker_accounts: any[];
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function nowIso() {
  return new Date().toISOString();
}

function seed(): Store {
  const userId = "demo-user";
  const stratFromTemplate = (t: StrategyJSON, status: any = "active"): StrategyRow => ({
    id: uid(),
    user_id: userId,
    name: t.name,
    strategy_json: t,
    is_active: status === "active",
    mode: "paper",
    status,
    created_at: nowIso(),
    updated_at: nowIso(),
  });

  const strategies: StrategyRow[] = [
    stratFromTemplate(TEMPLATES["RSI Breakout"], "active"),
    stratFromTemplate(TEMPLATES["EMA Crossover"], "paused"),
    stratFromTemplate(TEMPLATES["VWAP Reversal"], "draft"),
    stratFromTemplate(TEMPLATES["Supertrend Trend-Following"], "active"),
    stratFromTemplate(TEMPLATES["Level Breakout"], "stopped"),
  ];

  const trades: TradeRow[] = [];
  const orders: OrderRow[] = [];
  const logs: LogRow[] = [];

  // Generate ~20 historical trades
  let pnlRunning = 0;
  for (let i = 0; i < 22; i++) {
    const s = strategies[i % strategies.length];
    const day = new Date(Date.now() - i * 6 * 3600 * 1000);
    const opened = day.toISOString();
    const closed = new Date(day.getTime() + 30 * 60 * 1000).toISOString();
    const entry = 200 + Math.random() * 100;
    const move = (Math.random() - 0.4) * 40;
    const exit = entry + move;
    const qty = s.strategy_json.quantity * 50;
    const pnl = (s.strategy_json.action === "BUY" ? exit - entry : entry - exit) * qty;
    pnlRunning += pnl;
    const isOpen = i < 2;
    const tradeId = uid();
    trades.push({
      id: tradeId,
      user_id: userId,
      strategy_id: s.id,
      symbol: `${s.strategy_json.index}24MAY${
        s.strategy_json.strike === "ATM" ? "22500" : "22600"
      }${s.strategy_json.optionType}`,
      action: s.strategy_json.action,
      quantity: qty,
      entry_price: +entry.toFixed(2),
      exit_price: isOpen ? null : +exit.toFixed(2),
      pnl: isOpen ? null : +pnl.toFixed(2),
      mode: "paper",
      status: isOpen ? "open" : "closed",
      opened_at: opened,
      closed_at: isOpen ? null : closed,
    });
    orders.push({
      id: uid(),
      user_id: userId,
      strategy_id: s.id,
      trade_id: tradeId,
      symbol: trades[trades.length - 1].symbol,
      side: s.strategy_json.action,
      quantity: qty,
      price: +entry.toFixed(2),
      order_type: "MARKET",
      mode: "paper",
      status: "filled",
      broker_order_id: null,
      created_at: opened,
    });
  }

  // Generate logs
  const events: Array<[LogRow["level"], string, any]> = [
    ["info", "Engine started", { mode: "paper" }],
    ["signal", "Entry condition met", { rsi: 62.4, price: 22510 }],
    ["info", "Order placed", { side: "BUY", qty: 50 }],
    ["info", "Order filled", { price: 218.5 }],
    ["signal", "Target hit", { pnl: 2500 }],
    ["info", "Order placed (exit)", { side: "SELL", qty: 50 }],
    ["warn", "Slippage detected", { expected: 218.5, actual: 218.7 }],
    ["error", "Reconnecting to feed", { attempt: 1 }],
    ["info", "Reconnected", {}],
    ["signal", "Stop loss hit", { pnl: -1000 }],
  ];
  for (let i = 0; i < events.length; i++) {
    const [level, event, data] = events[i];
    logs.push({
      id: uid(),
      user_id: userId,
      strategy_id: strategies[i % strategies.length].id,
      level,
      event,
      data,
      created_at: new Date(Date.now() - i * 7 * 60 * 1000).toISOString(),
    });
  }

  return { strategies, trades, orders, logs, broker_accounts: [] };
}

function load(): Store {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const s = seed();
  window.localStorage.setItem(LS_KEY, JSON.stringify(s));
  return s;
}

function save(s: Store) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_KEY, JSON.stringify(s));
}

export function resetMock() {
  if (typeof window !== "undefined") window.localStorage.removeItem(LS_KEY);
}

// ----------------------------- API simulation -----------------------------

async function delay<T>(v: T, ms = 120): Promise<T> {
  await new Promise((r) => setTimeout(r, ms));
  return v;
}

export async function mockApi<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.body ? JSON.parse(init.body as string) : null;
  const store = load();

  // ------------ strategies ------------
  if (path === "/strategies" && method === "GET") {
    return delay(store.strategies as any);
  }
  if (path === "/strategies" && method === "POST") {
    const row: StrategyRow = {
      id: uid(),
      user_id: "demo-user",
      name: body.name,
      strategy_json: body.strategy_json,
      is_active: body.status === "active",
      mode: body.mode ?? "paper",
      status: body.status ?? "draft",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    store.strategies.unshift(row);
    save(store);
    return delay(row as any);
  }
  const strategyMatch = path.match(/^\/strategies\/([^/]+)(\/duplicate)?$/);
  if (strategyMatch) {
    const id = strategyMatch[1];
    const dup = !!strategyMatch[2];
    const idx = store.strategies.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error("404 Not found");
    if (method === "GET") return delay(store.strategies[idx] as any);
    if (method === "DELETE") {
      store.strategies.splice(idx, 1);
      save(store);
      return delay({ ok: true } as any);
    }
    if (method === "PATCH") {
      Object.assign(store.strategies[idx], body, { updated_at: nowIso() });
      save(store);
      return delay({ ok: true } as any);
    }
    if (method === "POST" && dup) {
      const src = store.strategies[idx];
      const copy: StrategyRow = {
        ...src,
        id: uid(),
        name: `${src.name} (Copy)`,
        is_active: false,
        status: "draft",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      store.strategies.unshift(copy);
      save(store);
      return delay(copy as any);
    }
  }

  // ------------ records ------------
  if (path === "/trades" && method === "GET") return delay(store.trades as any);
  if (path === "/orders" && method === "GET") return delay(store.orders as any);
  if (path === "/logs" && method === "GET") return delay(store.logs as any);

  // ------------ broker ------------
  if (path === "/broker/accounts") return delay(store.broker_accounts as any);
  if (path === "/broker/upstox/login-url")
    return delay({ url: "/settings?demo=upstox-login" } as any);
  if (path === "/broker/disconnect" && method === "POST") {
    store.broker_accounts = [];
    save(store);
    return delay({ ok: true } as any);
  }

  // ------------ backtest ------------
  if (path === "/backtest" && method === "POST") {
    return delay(simulateBacktest(body.strategy_json, body.days ?? 5) as any);
  }

  throw new Error(`Mock API: no handler for ${method} ${path}`);
}

// ----------------------------- backtest sim -----------------------------

function simulateBacktest(s: StrategyJSON, days: number): BacktestResult {
  const n = 75 * Math.max(1, days);
  let price = 22500;
  const trades: BacktestResult["trades"] = [];
  let inPos = false;
  let entry = 0;
  let entryTime = "";
  let pnl = 0;
  let peak = 0;
  let dd = 0;

  const sl = ((s.exit.conditions.find((c: any) => c.type === "stop_loss") as any)?.value ?? 20);
  const tp = ((s.exit.conditions.find((c: any) => c.type === "target") as any)?.value ?? 50);

  for (let i = 0; i < n; i++) {
    price += (Math.random() - 0.5) * 18;
    const t = new Date(Date.now() - (n - i) * 5 * 60 * 1000).toISOString();
    if (!inPos && Math.random() < 0.04) {
      inPos = true;
      entry = price;
      entryTime = t;
    } else if (inPos) {
      const move = s.action === "BUY" ? price - entry : entry - price;
      let reason = "";
      if (move >= tp) reason = "target";
      else if (move <= -sl) reason = "stop_loss";
      else if (Math.random() < 0.02) reason = "indicator_exit";
      if (reason) {
        const t_pnl = move * s.quantity * 50;
        pnl += t_pnl;
        peak = Math.max(peak, pnl);
        dd = Math.max(dd, peak - pnl);
        trades.push({
          entryTime,
          exitTime: t,
          entryPrice: +entry.toFixed(2),
          exitPrice: +price.toFixed(2),
          pnl: +t_pnl.toFixed(2),
          reason,
        });
        inPos = false;
      }
    }
  }
  const wins = trades.filter((t) => t.pnl > 0).length;
  return {
    totalTrades: trades.length,
    wins,
    losses: trades.length - wins,
    winRate: trades.length ? wins / trades.length : 0,
    pnl: +pnl.toFixed(2),
    maxDrawdown: +dd.toFixed(2),
    trades,
  };
}
