/**
 * Mock data + in-browser API simulator.
 * Supports three desks: equity, options, mutual-funds.
 * Set NEXT_PUBLIC_USE_MOCK=false to route through real FastAPI instead.
 */
import type {
  StrategyJSON,
  StrategyRow,
  TradeRow,
  OrderRow,
  LogRow,
  BacktestResult,
  DeskType,
  MutualFundHolding,
  SIPEntry,
} from "@signalai/types";
import { DESK_TEMPLATES, TEMPLATES, NIFTY500_STOCKS } from "@signalai/utils";

const LS_KEY = "signalai:mock:v4";

interface Store {
  strategies: StrategyRow[];
  trades: TradeRow[];
  orders: OrderRow[];
  logs: LogRow[];
  broker_accounts: any[];
  mf_holdings: MutualFundHolding[];
  sips: SIPEntry[];
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function nowIso() {
  return new Date().toISOString();
}
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

function seed(): Store {
  const userId = "demo-user";

  // ── Strategies ────────────────────────────────────────────────────────────
  const statuses = ["active", "paused", "draft"] as const;
  const strategies: StrategyRow[] = (["equity", "options"] as DeskType[]).flatMap(
    (desk, di) =>
      DESK_TEMPLATES[desk].map((name, i): StrategyRow => ({
        id: uid(),
        user_id: userId,
        name: TEMPLATES[name].name,
        strategy_json: TEMPLATES[name],
        is_active: statuses[(di + i) % 3] === "active",
        mode: "paper",
        status: statuses[(di + i) % 3],
        created_at: daysAgo(10 - i),
        updated_at: nowIso(),
      }))
  );

  // ── Trades ────────────────────────────────────────────────────────────────
  const trades: TradeRow[] = [];
  const orders: OrderRow[] = [];

  for (let i = 0; i < strategies.length * 4; i++) {
    const s = strategies[i % strategies.length];
    const isEquity = s.strategy_json.desk === "equity";
    const opened = daysAgo(i * 0.5);
    // Equity: realistic stock prices 500-5000; options: 100-350
    const basePrice = isEquity ? 500 + Math.random() * 4500 : 100 + Math.random() * 250;
    const move = isEquity
      ? (Math.random() - 0.45) * basePrice * 0.06
      : (Math.random() - 0.4) * 60;
    const entry = basePrice;
    const exit = entry + move;
    const qty = isEquity ? (s.strategy_json.quantity ?? 100) : (s.strategy_json.quantity ?? 1) * 50;
    const pnl = ((s.strategy_json.action ?? "BUY") === "BUY" ? exit - entry : entry - exit) * qty;
    const isOpen = i < 2;
    const tradeId = uid();

    let symbol: string;
    if (isEquity) {
      symbol = s.strategy_json.symbol ?? "RELIANCE";
    } else {
      const idx = s.strategy_json.index ?? "NIFTY";
      const optType = s.strategy_json.optionType ?? "";
      const strike = (s.strategy_json.strike ?? "ATM") === "ATM" ? "22500" : "22600";
      symbol = optType ? `${idx}24MAY${strike}${optType}` : `${idx}-FUT`;
    }

    trades.push({
      id: tradeId,
      user_id: userId,
      strategy_id: s.id,
      symbol,
      action: s.strategy_json.action ?? "BUY",
      quantity: qty,
      entry_price: +entry.toFixed(2),
      exit_price: isOpen ? null : +exit.toFixed(2),
      pnl: isOpen ? null : +pnl.toFixed(2),
      mode: "paper",
      status: isOpen ? "open" : "closed",
      opened_at: opened,
      closed_at: isOpen ? null : new Date(new Date(opened).getTime() + 3600000).toISOString(),
    });
    orders.push({
      id: uid(),
      user_id: userId,
      strategy_id: s.id,
      trade_id: tradeId,
      symbol,
      side: s.strategy_json.action ?? "BUY",
      quantity: qty,
      price: +entry.toFixed(2),
      order_type: "MARKET",
      mode: "paper",
      status: "filled",
      broker_order_id: null,
      created_at: opened,
    });
  }

  // ── Logs ──────────────────────────────────────────────────────────────────
  const logEvents: Array<[LogRow["level"], string, any, DeskType]> = [
    ["info",   "Engine started",      { mode: "paper" },              "equity"],
    ["signal", "Entry condition met", { ema: "9>21", price: 2510 },   "equity"],
    ["info",   "Order placed",        { side: "BUY", qty: 100 },      "equity"],
    ["signal", "Target hit",          { pnl: 3200 },                  "equity"],
    ["info",   "RSI CE entry",        { rsi: 63, strike: "ATM+100" }, "options"],
    ["signal", "Options SL hit",      { pnl: -1200 },                 "options"],
    ["warn",   "Slippage detected",   { expected: 220, actual: 221 }, "options"],
    ["info",   "NAV updated",         { nav: 82.34 },                 "mutual-funds"],
    ["error",  "Reconnecting",        { attempt: 1 },                 "equity"],
    ["info",   "Reconnected",         {},                              "equity"],
  ];
  const logs: LogRow[] = logEvents.map(([level, event, data, desk], i) => {
    const deskStrats = strategies.filter((s) => s.strategy_json.desk === desk);
    return {
      id: uid(),
      user_id: userId,
      strategy_id: deskStrats[i % Math.max(deskStrats.length, 1)]?.id ?? null,
      level,
      event,
      data,
      created_at: new Date(Date.now() - i * 8 * 60 * 1000).toISOString(),
    };
  });

  // ── Mutual Fund Holdings ──────────────────────────────────────────────────
  const mfData: Array<[string, string, number, number, number, number]> = [
    ["Parag Parikh Flexi Cap Fund",    "Flexi Cap",  120000, 1502.3, 82.34, 18.2],
    ["Mirae Asset Emerging Bluechip",  "Mid Cap",     80000,  980.1, 94.12, 22.5],
    ["SBI Bluechip Fund",              "Large Cap",   60000, 3210.5, 21.40, 14.8],
    ["Axis Long Term Equity (ELSS)",   "ELSS",        50000, 2100.0, 28.70, 16.3],
    ["HDFC Index Fund – NIFTY 50",     "Index",       40000, 1850.2, 24.65, 13.9],
    ["Nippon India Small Cap Fund",    "Small Cap",   30000,  620.4, 62.10, 31.4],
  ];
  const mf_holdings: MutualFundHolding[] = mfData.map(
    ([fund_name, category, invested, units, nav, xirr]): MutualFundHolding => ({
      id: uid(),
      user_id: userId,
      fund_name,
      category: category as any,
      folio: `FOLIO${Math.floor(10000 + Math.random() * 90000)}`,
      invested,
      units,
      nav,
      current_value: +(units * nav).toFixed(2),
      xirr,
      sip_amount: Math.random() > 0.4 ? [5000, 3000, 2000][Math.floor(Math.random() * 3)] : undefined,
      sip_day: 5,
      sip_frequency: "Monthly",
      started_at: daysAgo(365 + Math.floor(Math.random() * 730)),
      updated_at: nowIso(),
    })
  );

  // ── SIPs ──────────────────────────────────────────────────────────────────
  const activeMF = mf_holdings.filter((h) => h.sip_amount);
  const sips: SIPEntry[] = activeMF.map((h): SIPEntry => ({
    id: uid(),
    user_id: userId,
    fund_id: h.id,
    fund_name: h.fund_name,
    amount: h.sip_amount!,
    frequency: h.sip_frequency ?? "Monthly",
    day: h.sip_day ?? 5,
    next_date: new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      h.sip_day ?? 5
    ).toISOString(),
    status: "active",
    created_at: h.started_at,
  }));

  return { strategies, trades, orders, logs, broker_accounts: [], mf_holdings, sips };
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

// ── API simulation ────────────────────────────────────────────────────────────

async function delay<T>(v: T, ms = 100): Promise<T> {
  await new Promise((r) => setTimeout(r, ms));
  return v;
}

function parsePath(raw: string): { pathname: string; desk: DeskType | null } {
  const [pathname, qs = ""] = raw.split("?");
  const params = new URLSearchParams(qs);
  return { pathname, desk: (params.get("desk") as DeskType | null) ?? null };
}

export async function mockApi<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.body ? JSON.parse(init.body as string) : null;
  const store = load();
  const { pathname, desk } = parsePath(path);

  // ── Equity stocks list ──
  if (pathname === "/equity/stocks" && method === "GET") {
    return delay(NIFTY500_STOCKS as any);
  }

  // ── Strategies ──
  if (pathname === "/strategies" && method === "GET") {
    const rows = desk
      ? store.strategies.filter((s) => s.strategy_json.desk === desk)
      : store.strategies;
    return delay(rows as any);
  }
  if (pathname === "/strategies" && method === "POST") {
    const row: StrategyRow = {
      id: uid(), user_id: "demo-user",
      name: body.name, strategy_json: body.strategy_json,
      is_active: body.status === "active", mode: body.mode ?? "paper",
      status: body.status ?? "draft", created_at: nowIso(), updated_at: nowIso(),
    };
    store.strategies.unshift(row);
    save(store);
    return delay(row as any);
  }
  const stratMatch = pathname.match(/^\/strategies\/([^/]+)(\/duplicate)?$/);
  if (stratMatch) {
    const id = stratMatch[1]; const dup = !!stratMatch[2];
    const idx = store.strategies.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error("404 Not found");
    if (method === "GET") return delay(store.strategies[idx] as any);
    if (method === "DELETE") { store.strategies.splice(idx, 1); save(store); return delay({ ok: true } as any); }
    if (method === "PATCH") { Object.assign(store.strategies[idx], body, { updated_at: nowIso() }); save(store); return delay({ ok: true } as any); }
    if (method === "POST" && dup) {
      const src = store.strategies[idx];
      const copy: StrategyRow = { ...src, id: uid(), name: `${src.name} (Copy)`, is_active: false, status: "draft", created_at: nowIso(), updated_at: nowIso() };
      store.strategies.unshift(copy); save(store); return delay(copy as any);
    }
  }

  // ── Trades / Orders / Logs (desk-filtered) ──
  function deskStratIds(d: DeskType | null) {
    if (!d) return null;
    return new Set(store.strategies.filter((s) => s.strategy_json.desk === d).map((s) => s.id));
  }
  if (pathname === "/trades" && method === "GET") {
    const ids = deskStratIds(desk);
    return delay((ids ? store.trades.filter((t) => ids.has(t.strategy_id)) : store.trades) as any);
  }
  if (pathname === "/orders" && method === "GET") {
    const ids = deskStratIds(desk);
    return delay((ids ? store.orders.filter((o) => ids.has(o.strategy_id)) : store.orders) as any);
  }
  if (pathname === "/logs" && method === "GET") {
    const ids = deskStratIds(desk);
    return delay((ids ? store.logs.filter((l) => !l.strategy_id || ids.has(l.strategy_id)) : store.logs) as any);
  }

  // ── Mutual Funds ──
  if (pathname === "/mf/holdings" && method === "GET") return delay(store.mf_holdings as any);
  if (pathname === "/mf/sips"     && method === "GET") return delay(store.sips as any);
  if (pathname === "/mf/holdings" && method === "POST") {
    const h: MutualFundHolding = { id: uid(), user_id: "demo-user", ...body, updated_at: nowIso() };
    store.mf_holdings.push(h); save(store); return delay(h as any);
  }

  // ── Broker ──
  if (pathname === "/broker/accounts") return delay(store.broker_accounts as any);
  if (pathname === "/broker/upstox/login-url") return delay({ url: "/settings?demo=upstox-login" } as any);
  if (pathname === "/broker/disconnect" && method === "POST") { store.broker_accounts = []; save(store); return delay({ ok: true } as any); }

  // ── Backtest ──
  if (pathname === "/backtest" && method === "POST")
    return delay(simulateBacktest(body.strategy_json, body.days ?? 90) as any);

  throw new Error(`Mock API: no handler for ${method} ${pathname}`);
}

// ── Backtest sim ──────────────────────────────────────────────────────────────

function simulateBacktest(s: StrategyJSON, days: number): BacktestResult {
  const isEquity = s.desk === "equity";
  // For equity EOD strategies, one candle per day; for intraday, more candles
  const candlesPerDay = isEquity && s.candleTime === "EOD" ? 1 : 75;
  const n = candlesPerDay * Math.max(1, days);

  // Equity: start at realistic stock price; options: 22500
  let price = isEquity ? 1000 + Math.random() * 3000 : 22500;
  const trades: BacktestResult["trades"] = [];
  let inPos = false, entry = 0, entryTime = "", pnl = 0, peak = 0, dd = 0;
  const sl = ((s.exit.conditions.find((c: any) => c.type === "stop_loss") as any)?.value ?? (isEquity ? 50 : 30));
  const tp = ((s.exit.conditions.find((c: any) => c.type === "target") as any)?.value ?? (isEquity ? 100 : 60));

  // Price move per candle: equity stocks move more in absolute terms
  const moveScale = isEquity ? price * 0.015 : 18;

  for (let i = 0; i < n; i++) {
    price = Math.max(10, price + (Math.random() - 0.5) * moveScale);
    const msPerCandle = isEquity ? 86400000 : 5 * 60 * 1000;
    const t = new Date(Date.now() - (n - i) * msPerCandle).toISOString();
    if (!inPos && Math.random() < 0.04) { inPos = true; entry = price; entryTime = t; }
    else if (inPos) {
      const move = (s.action ?? "BUY") === "BUY" ? price - entry : entry - price;
      let reason = move >= tp ? "target" : move <= -sl ? "stop_loss" : Math.random() < 0.02 ? "indicator_exit" : "";
      if (reason) {
        const qty = s.quantity ?? (isEquity ? 100 : 1);
        const multiplier = isEquity ? 1 : 50;
        const tPnl = move * qty * multiplier;
        pnl += tPnl; peak = Math.max(peak, pnl); dd = Math.max(dd, peak - pnl);
        trades.push({ entryTime, exitTime: t, entryPrice: +entry.toFixed(2), exitPrice: +price.toFixed(2), pnl: +tPnl.toFixed(2), reason });
        inPos = false;
      }
    }
  }
  const wins = trades.filter((t) => t.pnl > 0).length;
  return { totalTrades: trades.length, wins, losses: trades.length - wins, winRate: trades.length ? wins / trades.length : 0, pnl: +pnl.toFixed(2), maxDrawdown: +dd.toFixed(2), trades };
}
