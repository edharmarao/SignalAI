"use client";
import { useEffect, useState } from "react";
import { Button, Card, Select } from "@signalai/ui";
import { api } from "@/lib/api";
import type { StrategyRow, BacktestResult } from "@signalai/types";

export default function BacktestPage() {
  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [days, setDays] = useState(5);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api<StrategyRow[]>("/strategies").then((r) => {
      setRows(r);
      if (r.length) setSelected(r[0].id);
    });
  }, []);

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
      <h1 className="text-2xl font-semibold">Backtest</h1>
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs uppercase text-slate-400">Strategy</label>
            <Select
              options={rows.map((r) => r.name)}
              value={rows.find((r) => r.id === selected)?.name ?? ""}
              onChange={(e) =>
                setSelected(rows.find((r) => r.name === e.target.value)?.id ?? "")
              }
            />
          </div>
          <div>
            <label className="text-xs uppercase text-slate-400">Days</label>
            <Select
              options={[1, 3, 5, 10, 20]}
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div className="text-xs text-slate-400">Trades</div>
              <div className="text-2xl font-semibold">{result.totalTrades}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Win rate</div>
              <div className="text-2xl font-semibold">
                {(result.winRate * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">P&L</div>
              <div
                className={`text-2xl font-semibold ${
                  result.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                ₹{result.pnl.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Max drawdown</div>
              <div className="text-2xl font-semibold text-amber-400">
                ₹{result.maxDrawdown.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">W / L</div>
              <div className="text-2xl font-semibold">
                {result.wins} / {result.losses}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
