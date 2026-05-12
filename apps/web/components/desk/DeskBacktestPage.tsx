"use client";
import { useEffect, useState } from "react";
import { Button, Card, Select } from "@signalai/ui";
import { api } from "@/lib/api";
import type { StrategyRow, BacktestResult, DeskType } from "@signalai/types";
import { DESK_META } from "@signalai/utils";

const DESK_ACCENT: Record<DeskType, string> = {
  equity:         "text-emerald-400",
  options:        "text-violet-400",
  "mutual-funds": "text-sky-400",
};

export function DeskBacktestPage({ desk }: { desk: DeskType }) {
  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [days, setDays] = useState(5);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const accent = DESK_ACCENT[desk];
  const meta = DESK_META[desk];

  useEffect(() => {
    api<StrategyRow[]>(`/strategies?desk=${desk}`).then((r) => {
      setRows(r);
      if (r.length) setSelected(r[0].id);
    });
  }, [desk]);

  async function run() {
    const s = rows.find((r) => r.id === selected);
    if (!s) return;
    setRunning(true);
    try {
      const res = await api<BacktestResult>("/backtest", {
        method: "POST",
        body: JSON.stringify({ strategy_json: s.strategy_json, days }),
      });
      setResult(res);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className={`text-2xl font-semibold ${accent}`}>{meta.label} Backtest</h1>
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs uppercase text-slate-400">Strategy</label>
            <Select
              options={rows.map((r) => r.name)}
              value={rows.find((r) => r.id === selected)?.name ?? ""}
              onChange={(e) => setSelected(rows.find((r) => r.name === e.target.value)?.id ?? "")}
            />
          </div>
          <div>
            <label className="text-xs uppercase text-slate-400">Days</label>
            <Select
              options={desk === "equity" ? [5, 10, 20, 30] : [1, 3, 5, 10, 20]}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </div>
          <Button onClick={run} disabled={!selected || running}>
            {running ? "Running…" : "Run Backtest"}
          </Button>
        </div>
      </Card>

      {result && (
        <Card title="Result">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            {[
              { label: "Trades",      v: String(result.totalTrades) },
              { label: "Win rate",    v: `${(result.winRate * 100).toFixed(1)}%` },
              { label: "P&L",         v: `₹${result.pnl.toFixed(2)}`,         cls: result.pnl >= 0 ? "text-emerald-400" : "text-rose-400" },
              { label: "Max drawdown",v: `₹${result.maxDrawdown.toFixed(2)}`,  cls: "text-amber-400" },
              { label: "W / L",       v: `${result.wins} / ${result.losses}` },
            ].map(({ label, v, cls }) => (
              <div key={label}>
                <div className="text-xs text-slate-400">{label}</div>
                <div className={`text-2xl font-semibold ${cls ?? "text-slate-100"}`}>{v}</div>
              </div>
            ))}
          </div>
          <div className="overflow-auto">
            <table className="text-xs w-full">
              <thead className="text-slate-400">
                <tr>
                  <th className="text-left">Entry</th>
                  <th className="text-left">Exit</th>
                  <th className="text-right">Entry ₹</th>
                  <th className="text-right">Exit ₹</th>
                  <th className="text-right">P&L</th>
                  <th className="text-left pl-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {result.trades.map((t, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="py-1">{t.entryTime}</td>
                    <td>{t.exitTime}</td>
                    <td className="text-right tabular-nums">{t.entryPrice.toFixed(2)}</td>
                    <td className="text-right tabular-nums">{t.exitPrice.toFixed(2)}</td>
                    <td className={`text-right tabular-nums ${t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {t.pnl.toFixed(2)}
                    </td>
                    <td className="pl-3">{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
