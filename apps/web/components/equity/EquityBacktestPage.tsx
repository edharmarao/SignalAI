"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label } from "@signalai/ui";
import type { BacktestResult, StrategyRow } from "@signalai/types";
import { api } from "@/lib/api";
import { useSearchParams } from "next/navigation";

function fmt(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default function EquityBacktestPage() {
  const sp = useSearchParams();
  const preId = sp.get("strategyId");

  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>(preId ?? "");
  const [days, setDays] = useState(90);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await api<BacktestResult>("/backtest", {
        method: "POST",
        body: JSON.stringify({ strategy_json: row.strategy_json, days }),
      });
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const selectedRow = strategies.find((s) => s.id === selectedId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equity Backtest</h1>
        <p className="text-slate-400 text-sm">Simulate your stock strategy on historical data.</p>
      </div>

      {/* Controls */}
      <Card title="Backtest Settings">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Label>Strategy</Label>
            <select
              className="bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 w-full"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {strategies.length === 0 ? (
                <option value="">— no strategies —</option>
              ) : (
                strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.strategy_json.symbol ?? "?"}) — {s.status}
                  </option>
                ))
              )}
            </select>
            {selectedRow && (
              <div className="mt-2 flex gap-2 flex-wrap">
                <Badge tone="info">{selectedRow.strategy_json.symbol ?? "?"}</Badge>
                <Badge tone="neutral">{selectedRow.strategy_json.candleTime}</Badge>
                <Badge tone={selectedRow.strategy_json.action === "BUY" ? "success" : "danger"}>
                  {selectedRow.strategy_json.action}
                </Badge>
              </div>
            )}
          </div>
          <div>
            <Label>Days to backtest</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
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

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <div className="text-xs text-slate-500 uppercase tracking-wide">Total Trades</div>
              <div className="text-3xl font-bold text-slate-100 mt-1">{result.totalTrades}</div>
              <div className="text-xs text-slate-500 mt-1">{result.wins}W / {result.losses}L</div>
            </Card>
            <Card>
              <div className="text-xs text-slate-500 uppercase tracking-wide">Win Rate</div>
              <div className={`text-3xl font-bold mt-1 ${result.winRate >= 0.5 ? "text-emerald-400" : "text-amber-400"}`}>
                {(result.winRate * 100).toFixed(1)}%
              </div>
            </Card>
            <Card className={result.pnl >= 0 ? "border-emerald-500/30" : "border-rose-500/30"}>
              <div className="text-xs text-slate-500 uppercase tracking-wide">Total P&L</div>
              <div className={`text-3xl font-bold mt-1 ${result.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {result.pnl >= 0 ? "+" : ""}₹{fmt(result.pnl)}
              </div>
            </Card>
            <Card>
              <div className="text-xs text-slate-500 uppercase tracking-wide">Max Drawdown</div>
              <div className="text-3xl font-bold text-rose-400 mt-1">
                ₹{fmt(result.maxDrawdown)}
              </div>
            </Card>
          </div>

          {/* Trades table */}
          <Card title={`Trades (${result.trades.length})`}>
            {result.trades.length === 0 ? (
              <div className="text-slate-400 text-sm py-4 text-center">
                No trades executed in this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-800">
                      <th className="pb-3 pr-4">Entry Time</th>
                      <th className="pb-3 pr-4">Exit Time</th>
                      <th className="pb-3 pr-4">Entry ₹</th>
                      <th className="pb-3 pr-4">Exit ₹</th>
                      <th className="pb-3 pr-4">P&L</th>
                      <th className="pb-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {result.trades.map((t, i) => (
                      <tr key={i} className={`${t.pnl >= 0 ? "hover:bg-emerald-500/5" : "hover:bg-rose-500/5"} transition-colors`}>
                        <td className="py-2 pr-4 text-slate-400 text-xs">{new Date(t.entryTime).toLocaleDateString()}</td>
                        <td className="py-2 pr-4 text-slate-400 text-xs">{new Date(t.exitTime).toLocaleDateString()}</td>
                        <td className="py-2 pr-4 text-slate-200">{fmt(t.entryPrice)}</td>
                        <td className="py-2 pr-4 text-slate-200">{fmt(t.exitPrice)}</td>
                        <td className={`py-2 pr-4 font-medium ${t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {t.pnl >= 0 ? "+" : ""}₹{fmt(t.pnl)}
                        </td>
                        <td className="py-2">
                          <Badge tone={t.reason === "target" ? "success" : t.reason === "stop_loss" ? "danger" : "neutral"}>
                            {t.reason}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
