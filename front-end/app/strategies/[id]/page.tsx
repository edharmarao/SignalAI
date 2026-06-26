"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Badge, Button, Card } from "@signalai/ui";
import { describeStrategy } from "@signalai/utils";
import type { StrategyRow, BacktestResult } from "@signalai/types";

export default function StrategyDetail() {
  const { id } = useParams<{ id: string }>();
  const [row, setRow] = useState<StrategyRow | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api<StrategyRow>(`/strategies/${id}`).then(setRow);
  }, [id]);

  async function backtest() {
    if (!row) return;
    setRunning(true);
    try {
      const res = await api<BacktestResult>("/backtest", {
        method: "POST",
        body: JSON.stringify({ strategy_json: row.strategy_json, days: 5 }),
      });
      setResult(res);
    } finally {
      setRunning(false);
    }
  }

  if (!row) return <div>Loading…</div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">{row.name}</h1>
        <Badge tone={row.mode === "live" ? "danger" : "success"}>
          {row.mode.toUpperCase()}
        </Badge>
        <Badge tone="info">{row.status}</Badge>
      </div>
      <Card title="Plain-English summary">
        <p className="text-slate-200 leading-relaxed">
          {describeStrategy(row.strategy_json)}
        </p>
      </Card>

      <div className="flex gap-2">
        <Button onClick={backtest} disabled={running}>
          {running ? "Running…" : "Run backtest"}
        </Button>
      </div>

      {result && (
        <Card title="Backtest result">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <Stat label="Trades" v={String(result.totalTrades)} />
            <Stat label="Wins" v={String(result.wins)} />
            <Stat label="Win rate" v={`${(result.winRate * 100).toFixed(1)}%`} />
            <Stat
              label="P&L"
              v={`₹${result.pnl.toFixed(2)}`}
              tone={result.pnl >= 0 ? "success" : "danger"}
            />
            <Stat
              label="Max drawdown"
              v={`₹${result.maxDrawdown.toFixed(2)}`}
              tone="warn"
            />
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
                    <td>{t.entryTime}</td>
                    <td>{t.exitTime}</td>
                    <td className="text-right tabular-nums">
                      {t.entryPrice.toFixed(2)}
                    </td>
                    <td className="text-right tabular-nums">
                      {t.exitPrice.toFixed(2)}
                    </td>
                    <td
                      className={`text-right tabular-nums ${
                        t.pnl >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
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

      <Card title="Strategy JSON">
        <pre className="text-[11px] overflow-auto max-h-96">
{JSON.stringify(row.strategy_json, null, 2)}
        </pre>
      </Card>
    </div>
  );
}

function Stat({
  label,
  v,
  tone = "neutral",
}: {
  label: string;
  v: string;
  tone?: "neutral" | "success" | "danger" | "warn";
}) {
  const colors = {
    neutral: "text-slate-100",
    success: "text-emerald-400",
    danger: "text-rose-400",
    warn: "text-amber-400",
  };
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-2xl font-semibold ${colors[tone]}`}>{v}</div>
    </div>
  );
}
