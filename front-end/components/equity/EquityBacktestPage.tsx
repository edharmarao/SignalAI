"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label } from "@signalai/ui";
import type { StrategyRow } from "@signalai/types";
import { api } from "@/lib/api";
import { useSearchParams } from "next/navigation";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

interface StockResult {
  symbol: string;
  totalTrades: number;
  winTrades: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  maxDD: number;
  sharpe: number;
  trades: Array<{
    entryDate: string; entryPrice: number;
    exitDate: string; exitPrice: number;
    exitReason: string; pnl: number; pnlPct: number; holdDays: number;
  }>;
  error?: string;
}

const TF_MAP: Record<string, string> = {
  "1D": "daily", "1W": "weekly", "1H": "75min",
  "15m": "15min", "5m": "5min", "3m": "5min",
  "EOD": "daily", "15min": "15min", "5min": "5min", "75min": "75min",
};

export default function EquityBacktestPage() {
  const sp = useSearchParams();
  const preId = sp.get("strategyId");

  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>(preId ?? "");
  const [period, setPeriod] = useState<"180"|"365"|"730">("365");
  const [qty, setQty] = useState("100");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<StockResult[]>([]);
  const [selectedSym, setSelectedSym] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"totalPnl"|"winRate"|"maxDD"|"sharpe"|"totalTrades">("totalPnl");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");

  useEffect(() => {
    api<StrategyRow[]>("/strategies?desk=equity").then((data) => {
      setStrategies(data);
      if (preId && data.find((s) => s.id === preId)) {
        setSelectedId(preId);
      } else if (data.length > 0 && !preId) {
        setSelectedId(data[0].id);
      }
    });
  }, [preId]);

  async function runBacktest() {
    if (!selectedId) return;
    const row = strategies.find((s) => s.id === selectedId);
    if (!row) return;
    const sj = row.strategy_json as any;

    const symbols: string[] = sj.symbols?.length ? sj.symbols : sj.symbol ? [sj.symbol] : [];
    if (!symbols.length) { setError("Strategy has no symbols configured."); return; }

    const conditions = sj.rawConditions?.map((c: any) => ({ lhs: c.lhs, op: c.op, rhs: c.rhs }))
      ?? sj.entry?.conditions ?? [];
    if (!conditions.length) { setError("Strategy has no entry conditions."); return; }

    const sl_pct = sj.sl ?? sj.exit?.conditions?.find((c: any) => c.type === "stop_loss")?.value ?? 2;
    const tp_pct = sj.tp ?? sj.exit?.conditions?.find((c: any) => c.type === "target")?.value ?? 0;
    const tsl_pct = sj.tsl ?? sj.exit?.conditions?.find((c: any) => c.type === "trailing_stop_loss")?.value ?? 0;

    const tfRaw = sj.tf ?? sj.candleTime ?? "1D";
    const timeframe = TF_MAP[tfRaw] ?? "daily";
    const toDate = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - parseInt(period) * 86400000).toISOString().slice(0, 10);

    setRunning(true); setError(null); setResults([]); setSelectedSym(null);
    try {
      const res = await api<{ results: StockResult[] }>("/charts/indicator-backtest", {
        method: "POST",
        body: JSON.stringify({
          symbols, timeframe, from_date: fromDate, to_date: toDate,
          conditions, action: sj.action ?? "BUY",
          sl_pct, tp_pct, tsl_pct,
          qty: parseInt(qty) || 100,
          max_hold_days: sj.risk?.holdDays ?? 30,
        }),
      });
      setResults(res.results ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  };
  const sortIcon = (col: typeof sortBy) => sortBy === col ? (sortDir === "desc" ? " ▼" : " ▲") : "";

  const sorted = [...results].sort((a, b) => {
    const v = sortDir === "desc" ? -1 : 1;
    return (a[sortBy] - b[sortBy]) * v;
  });

  const summary = results.length ? {
    totalTrades: results.reduce((a, r) => a + r.totalTrades, 0),
    wins: results.reduce((a, r) => a + r.winTrades, 0),
    totalPnl: results.reduce((a, r) => a + r.totalPnl, 0),
    maxDD: Math.max(...results.map(r => r.maxDD)),
    winRate: (() => {
      const t = results.reduce((a, r) => a + r.totalTrades, 0);
      const w = results.reduce((a, r) => a + r.winTrades, 0);
      return t ? w / t * 100 : 0;
    })(),
  } : null;

  const selectedResult = results.find(r => r.symbol === selectedSym) ?? null;
  const selectedRow = strategies.find((s) => s.id === selectedId);
  const selectedSymbols: string[] = (selectedRow?.strategy_json as any)?.symbols
    ?? ((selectedRow?.strategy_json as any)?.symbol ? [(selectedRow?.strategy_json as any).symbol] : []);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equity Backtest</h1>
        <p className="text-slate-400 text-sm">Simulate your indicator strategy on real historical data.</p>
      </div>

      {/* Controls */}
      <Card title="Backtest Settings">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <Label>Strategy</Label>
            <select
              className="bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 w-full"
              value={selectedId}
              onChange={(e) => { setSelectedId(e.target.value); setResults([]); setSelectedSym(null); }}
            >
              {strategies.length === 0 ? (
                <option value="">— no strategies —</option>
              ) : (
                strategies.map((s) => {
                  const sj = s.strategy_json as any;
                  const syms: string[] = sj.symbols?.length ? sj.symbols : sj.symbol ? [sj.symbol] : [];
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name} ({syms.join(", ") || "?"}) — {s.status}
                    </option>
                  );
                })
              )}
            </select>
            {selectedRow && (
              <div className="mt-2 flex gap-2 flex-wrap">
                {selectedSymbols.map(sym => (
                  <Badge key={sym} tone="info">{sym}</Badge>
                ))}
                <Badge tone="neutral">{(selectedRow.strategy_json as any).tf ?? (selectedRow.strategy_json as any).candleTime ?? "?"}</Badge>
                <Badge tone={(selectedRow.strategy_json as any).action === "BUY" ? "success" : "danger"}>
                  {(selectedRow.strategy_json as any).action ?? "BUY"}
                </Badge>
              </div>
            )}
          </div>
          <div>
            <Label>Period</Label>
            <select
              className="bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 w-full"
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
            >
              <option value="180">6 Months</option>
              <option value="365">1 Year</option>
              <option value="730">2 Years</option>
            </select>
          </div>
          <div>
            <Label>Quantity</Label>
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={runBacktest} disabled={running || !selectedId}>
            {running ? "Running…" : "▶ Run Backtest"}
          </Button>
        </div>
        {error && (
          <div className="mt-3 text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-md p-3">
            {error}
          </div>
        )}
      </Card>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <div className="text-xs text-slate-500 uppercase tracking-wide">Total Trades</div>
            <div className="text-3xl font-bold text-slate-100 mt-1">{summary.totalTrades}</div>
            <div className="text-xs text-slate-500 mt-1">{summary.wins}W / {summary.totalTrades - summary.wins}L</div>
          </Card>
          <Card>
            <div className="text-xs text-slate-500 uppercase tracking-wide">Win Rate</div>
            <div className={`text-3xl font-bold mt-1 ${summary.winRate >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
              {summary.winRate.toFixed(1)}%
            </div>
          </Card>
          <Card className={summary.totalPnl >= 0 ? "border-emerald-500/30" : "border-rose-500/30"}>
            <div className="text-xs text-slate-500 uppercase tracking-wide">Total P&L</div>
            <div className={`text-3xl font-bold mt-1 ${summary.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {summary.totalPnl >= 0 ? "+" : ""}₹{fmt(summary.totalPnl)}
            </div>
          </Card>
          <Card>
            <div className="text-xs text-slate-500 uppercase tracking-wide">Max Drawdown</div>
            <div className="text-3xl font-bold text-rose-400 mt-1">₹{fmt(summary.maxDD)}</div>
          </Card>
        </div>
      )}

      {/* Per-symbol results table */}
      {sorted.length > 0 && (
        <Card title={`Results — ${sorted.length} symbol${sorted.length !== 1 ? "s" : ""}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                  {[
                    { label: "Symbol", col: null },
                    { label: "Trades", col: "totalTrades" as const },
                    { label: "Win %", col: "winRate" as const },
                    { label: "Net P&L (₹)", col: "totalPnl" as const },
                    { label: "Max DD (₹)", col: "maxDD" as const },
                    { label: "Sharpe", col: "sharpe" as const },
                    { label: "Status", col: null },
                  ].map(({ label, col }) => (
                    <th key={label}
                      onClick={col ? () => toggleSort(col) : undefined}
                      className={`pb-3 pr-4 whitespace-nowrap ${col ? "cursor-pointer hover:text-slate-300" : ""}`}>
                      {label}{col ? sortIcon(col) : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sorted.map((r, idx) => {
                  const isSelected = r.symbol === selectedSym;
                  return (
                    <tr key={r.symbol}
                      onClick={() => setSelectedSym(isSelected ? null : r.symbol)}
                      className={`cursor-pointer transition-colors ${isSelected ? "bg-blue-500/10" : idx % 2 === 0 ? "" : "bg-slate-900/30"} hover:bg-slate-800/50`}>
                      <td className="py-2 pr-4 font-semibold text-slate-200">{r.symbol}</td>
                      <td className="py-2 pr-4 text-slate-400">{r.totalTrades}</td>
                      <td className="py-2 pr-4 text-emerald-400">{r.winRate.toFixed(1)}%</td>
                      <td className={`py-2 pr-4 font-semibold ${r.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {r.totalPnl >= 0 ? "+" : ""}₹{fmt(r.totalPnl)}
                      </td>
                      <td className="py-2 pr-4 text-rose-400">₹{fmt(r.maxDD)}</td>
                      <td className={`py-2 pr-4 ${r.sharpe >= 0 ? "text-blue-400" : "text-slate-500"}`}>{r.sharpe.toFixed(2)}</td>
                      <td className="py-2">
                        {r.error ? (
                          <Badge tone="danger">No Data</Badge>
                        ) : r.totalTrades === 0 ? (
                          <Badge tone="neutral">No Signal</Badge>
                        ) : (
                          <Badge tone="success">Done</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Trade drill-down */}
      {selectedResult && selectedResult.trades.length > 0 && (
        <Card title={`${selectedResult.symbol} — ${selectedResult.totalTrades} trade${selectedResult.totalTrades !== 1 ? "s" : ""}`}>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800">
                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                  {["#", "Entry Date", "Entry ₹", "Exit Date", "Exit ₹", "Reason", "P&L (₹)", "Hold"].map(h => (
                    <th key={h} className="pb-2 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {selectedResult.trades.map((t, i) => (
                  <tr key={i} className={t.pnl >= 0 ? "bg-emerald-950/20" : "bg-rose-950/10"}>
                    <td className="py-1.5 pr-4 text-slate-600">{i + 1}</td>
                    <td className="py-1.5 pr-4 text-slate-400 font-mono">{t.entryDate}</td>
                    <td className="py-1.5 pr-4 text-slate-200">{fmt(t.entryPrice)}</td>
                    <td className="py-1.5 pr-4 text-slate-400 font-mono">{t.exitDate}</td>
                    <td className="py-1.5 pr-4 text-slate-200">{fmt(t.exitPrice)}</td>
                    <td className="py-1.5 pr-4">
                      <Badge tone={t.exitReason === "SL" ? "danger" : t.exitReason === "TP" ? "success" : "neutral"}>
                        {t.exitReason}
                      </Badge>
                    </td>
                    <td className={`py-1.5 pr-4 font-semibold ${t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {t.pnl >= 0 ? "+" : ""}₹{fmt(t.pnl)}
                    </td>
                    <td className="py-1.5 text-slate-500">{t.holdDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!running && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-3xl">▶</div>
          <p className="text-slate-500 font-medium">Select a strategy and run backtest</p>
          <p className="text-xs text-slate-700 mt-1">Uses real historical data from your database</p>
        </div>
      )}
    </div>
  );
}
