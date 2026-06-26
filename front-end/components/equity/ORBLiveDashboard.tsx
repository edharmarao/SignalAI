"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card } from "@signalai/ui";
import type { StrategyRow } from "@signalai/types";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

type LiveStatusKey =
  | "watching"
  | "or_formed"
  | "signal"
  | "in_position"
  | "target_hit"
  | "sl_hit"
  | "eod"
  | "no_signal"
  | "error";

type OrbSignal = {
  symbol?: string;
  date?: string;
  timeframe?: string;
  signal?: "BUY" | "SELL" | null;
  triggered?: boolean;
  breakout_type?: string;
  entry_price?: number;
  stop_loss?: number;
  target?: number;
  risk?: number;
  volume_ok?: boolean;
  current_price?: number;
  pnl?: number;
  pnl_percent?: number;
  in_position?: boolean;
  closed?: boolean;
  target_hit?: boolean;
  sl_hit?: boolean;
  eod_exit?: boolean;
  or_high?: number;
  or_low?: number;
  breakout_candle_time?: string;
  message?: string;
  error?: string;
  status?: string;
};

type SymbolLiveState = {
  symbol: string;
  status: LiveStatusKey;
  label: string;
  className: string;
  direction: "BUY" | "SELL" | null;
  entryPrice?: number;
  stopLoss?: number;
  target?: number;
  orHigh?: number;
  orLow?: number;
  breakoutTime?: string;
  currentPrice?: number;
  pnl?: number;
  pnlPct?: number;
  volumeOk?: boolean;
  error?: string;
};

function getOrbConfig(sj: any) {
  return sj?.orbConfig ?? sj?.config ?? {};
}

function getSymbols(sj: any): string[] {
  return (sj?.symbols ?? [sj?.symbol]).filter((sym: string | undefined) => Boolean(sym));
}

function formatDirection(direction?: string) {
  if (direction === "both") return "⇅ Both";
  if (direction === "short") return "▼ Short";
  return "▲ Long";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPrice(value?: number) {
  return value === undefined ? "—" : Number(value).toFixed(2);
}

function formatPct(value?: number) {
  return value === undefined ? "" : ` (${value >= 0 ? "+" : ""}${value.toFixed(1)}%)`;
}

function formatClock(date: Date) {
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }) + " IST";
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }) + " IST";
}

function statusMeta(status: LiveStatusKey, direction: "BUY" | "SELL" | null) {
  switch (status) {
    case "watching":
      return { label: "⌛ Watching", className: "border-slate-700 bg-slate-800/80 text-slate-200" };
    case "or_formed":
      return { label: "🔍 OR Formed", className: "border-sky-500/30 bg-sky-500/10 text-sky-300" };
    case "signal":
      return { label: "⚡ Signal", className: "animate-pulse border-amber-500/30 bg-amber-500/10 text-amber-300" };
    case "in_position":
      return direction === "SELL"
        ? { label: "▼ In Position", className: "border-orange-500/30 bg-orange-500/10 text-orange-300" }
        : { label: "▲ In Position", className: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" };
    case "target_hit":
      return { label: "✔ Target Hit", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" };
    case "sl_hit":
      return { label: "✖ SL Hit", className: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300" };
    case "eod":
      return { label: "◼ EOD", className: "border-slate-700 bg-slate-800/80 text-slate-200" };
    case "no_signal":
      return { label: "— No Signal", className: "border-slate-800 bg-slate-900 text-slate-500" };
    case "error":
      return { label: "—", className: "border-slate-800 bg-slate-900 text-slate-400" };
    default:
      return { label: "—", className: "border-slate-800 bg-slate-900 text-slate-400" };
  }
}

function mapSignal(symbol: string, signal: OrbSignal | undefined, defaultDirection?: string, qty = 1): SymbolLiveState {
  if (!signal || signal.error) {
    const meta = statusMeta("error", null);
    return {
      symbol,
      status: "error",
      label: meta.label,
      className: meta.className,
      direction: null,
      error: signal?.error ?? "Failed to fetch signal",
    };
  }

  const direction = signal.signal ?? (signal.breakout_type === "SELL" ? "SELL" : signal.breakout_type === "BUY" ? "BUY" : defaultDirection === "short" ? "SELL" : defaultDirection === "long" ? "BUY" : null);

  let status: LiveStatusKey = "watching";
  const explicitStatus = signal.status?.toLowerCase();
  if (explicitStatus === "active") status = "in_position";
  else if (explicitStatus === "target_hit") status = "target_hit";
  else if (explicitStatus === "sl_hit") status = "sl_hit";
  else if (explicitStatus === "eod") status = "eod";
  else if (explicitStatus === "no_signal") status = "no_signal";
  else if (signal.target_hit) status = "target_hit";
  else if (signal.sl_hit) status = "sl_hit";
  else if (signal.eod_exit) status = "eod";
  else if (signal.in_position) status = "in_position";
  else if (signal.signal || signal.triggered || signal.breakout_type) status = "signal";
  else if (signal.or_high !== undefined || signal.or_low !== undefined) status = "or_formed";
  else if (signal.message?.toLowerCase().includes("no orb signal")) status = "watching";

  const currentPrice = signal.current_price;
  const entryPrice = signal.entry_price;
  const pnl = signal.pnl ?? (
    currentPrice !== undefined && entryPrice !== undefined && direction
      ? ((direction === "BUY" ? currentPrice - entryPrice : entryPrice - currentPrice) * qty)
      : undefined
  );
  const pnlPct = signal.pnl_percent ?? (
    currentPrice !== undefined && entryPrice !== undefined && direction
      ? ((direction === "BUY" ? currentPrice - entryPrice : entryPrice - currentPrice) / entryPrice) * 100
      : undefined
  );
  const meta = statusMeta(status, direction);

  return {
    symbol,
    status,
    label: meta.label,
    className: meta.className,
    direction,
    entryPrice,
    stopLoss: signal.stop_loss,
    target: signal.target,
    orHigh: signal.or_high,
    orLow: signal.or_low,
    breakoutTime: signal.breakout_candle_time,
    currentPrice,
    pnl,
    pnlPct,
    volumeOk: signal.volume_ok,
  };
}

export default function ORBLiveDashboard({ strategyId }: { strategyId: string }) {
  const router = useRouter();
  const [strategy, setStrategy] = useState<StrategyRow | null>(null);
  const [signals, setSignals] = useState<SymbolLiveState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadSignals = useCallback(async (row: StrategyRow) => {
    const sj = row.strategy_json as any;
    const orbConfig = getOrbConfig(sj);
    const symbols = getSymbols(sj);
    const timeframe = orbConfig.timeframe ?? sj?.candleTime ?? "5min";
    const qty = Number(orbConfig.qty ?? sj?.quantity ?? 1) || 1;

    setRefreshing(true);
    try {
      const next = await Promise.all(symbols.map(async (symbol) => {
        try {
          const res = await api<OrbSignal[]>(`/orb/signal?symbols=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`);
          return mapSignal(symbol, Array.isArray(res) ? res[0] : undefined, orbConfig.direction, qty);
        } catch (e: any) {
          return mapSignal(symbol, { error: e?.message ?? "Failed to fetch signal" }, orbConfig.direction, qty);
        }
      }));
      setSignals(next);
      setLastUpdated(new Date());
    } finally {
      setRefreshing(false);
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const row = await api<StrategyRow>(`/strategies/${strategyId}`);
      setStrategy(row);
      await loadSignals(row);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load live strategy");
    } finally {
      setLoading(false);
    }
  }, [loadSignals, strategyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!strategy) return;
    const timer = window.setInterval(() => {
      void loadSignals(strategy);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadSignals, strategy]);

  async function handlePause() {
    if (!strategy) return;
    await api(`/strategies/${strategy.id}`, { method: "PATCH", body: JSON.stringify({ status: "paused" }) });
    router.push("/equity/strategies");
  }

  const summary = useMemo(() => {
    const signalStatuses: LiveStatusKey[] = ["signal", "in_position", "target_hit", "sl_hit", "eod"];
    const totalSignals = signals.filter((s) => signalStatuses.includes(s.status)).length;
    const inPosition = signals.filter((s) => s.status === "in_position").length;
    const wins = signals.filter((s) => s.status === "target_hit").length;
    const losses = signals.filter((s) => s.status === "sl_hit").length;
    const dayPnl = signals.reduce((sum, s) => sum + (s.pnl ?? 0), 0);
    return { totalSignals, inPosition, wins, losses, dayPnl };
  }, [signals]);

  if (loading) return <div className="p-8 text-slate-400">Loading live dashboard…</div>;
  if (error || !strategy) return <div className="p-8 text-rose-400">{error ?? "Strategy not found."}</div>;

  const sj = strategy.strategy_json as any;
  const orbConfig = getOrbConfig(sj);
  const timeframe = orbConfig.timeframeLabel ?? orbConfig.timeframe ?? sj?.candleTime ?? "—";
  const direction = orbConfig.direction ?? (sj?.action === "SELL" ? "short" : "long");
  const isLive = strategy.status === "active";

  return (
    <div className="space-y-5">
      <Card className="border border-rose-500/20 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-100">{strategy.name}</h1>
              {isLive ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-400" />
                  LIVE
                </span>
              ) : null}
              <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200">⏱ {timeframe}</span>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">{formatDirection(direction)}</span>
            </div>
            <p className="text-sm text-slate-400">Monitoring {(signals.length || getSymbols(sj).length)} symbol(s) on the live ORB dashboard.</p>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="text-sm font-medium text-slate-200">{formatClock(now)}</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void loadSignals(strategy)} disabled={refreshing}>
                {refreshing ? "Refreshing…" : "Refresh"}
              </Button>
              <Button variant="secondary" className="border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20" onClick={handlePause}>
                ⏸ Pause
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {signals.map((state) => {
          const pnlPositive = (state.pnl ?? 0) >= 0;
          return (
            <Card key={state.symbol} className="border border-slate-800 bg-slate-900/80">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-2xl font-semibold tracking-tight text-amber-300">{state.symbol}</div>
                </div>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${state.className}`}>
                  {state.label}
                </span>
              </div>

              {state.pnl !== undefined ? (
                <div className={`mt-4 text-lg font-semibold ${pnlPositive ? "text-emerald-300" : "text-rose-300"}`}>
                  {`${state.pnl >= 0 ? "+" : "-"}${formatCurrency(Math.abs(state.pnl))}${formatPct(state.pnlPct)}`}
                </div>
              ) : (
                <div className="mt-4 text-sm text-slate-500">P&amp;L will appear once live pricing is available.</div>
              )}

              {state.entryPrice !== undefined ? (
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
                  Entry: {formatPrice(state.entryPrice)}
                  {state.breakoutTime ? ` @ ${state.breakoutTime}` : ""}
                  {` | SL: ${formatPrice(state.stopLoss)} | Target: ${formatPrice(state.target)}`}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1">ORH {formatPrice(state.orHigh)}</span>
                <span className="rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1">ORL {formatPrice(state.orLow)}</span>
                {state.volumeOk !== undefined ? (
                  <span className={`rounded-full border px-2.5 py-1 ${state.volumeOk ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-800 text-slate-300"}`}>
                    Vol {state.volumeOk ? "OK" : "Wait"}
                  </span>
                ) : null}
              </div>

              {state.error ? <div className="mt-4 text-xs text-rose-300">{state.error}</div> : null}
            </Card>
          );
        })}
      </div>

      <Card className="border border-slate-800 bg-slate-900/70">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Total signals today</div>
            <div className="mt-1 text-2xl font-semibold text-slate-100">{summary.totalSignals}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">In position</div>
            <div className="mt-1 text-2xl font-semibold text-slate-100">{summary.inPosition}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Closed</div>
            <div className="mt-1 text-lg font-semibold text-slate-100">wins {summary.wins} / losses {summary.losses}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Day P&amp;L</div>
            <div className={`mt-1 text-2xl font-semibold ${summary.dayPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {`${summary.dayPnl >= 0 ? "+" : "-"}${formatCurrency(Math.abs(summary.dayPnl))}`}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <span>Last updated: {lastUpdated ? formatTime(lastUpdated) : "—"}</span>
        <span>Live status is derived from current ORB signal snapshots.</span>
      </div>
    </div>
  );
}
