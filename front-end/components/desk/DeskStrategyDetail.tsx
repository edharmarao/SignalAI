"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Button, Card } from "@signalai/ui";
import { describeStrategy, DESK_META } from "@signalai/utils";
import type { StrategyRow, BacktestResult, DeskType } from "@signalai/types";

const DESK_ACCENT: Record<DeskType, string> = {
  equity:         "text-emerald-400",
  options:        "text-violet-400",
  "mutual-funds": "text-sky-400",
};

export function DeskStrategyDetail({ desk }: { desk: DeskType }) {
  const { id } = useParams<{ id: string }>();
  const [row, setRow] = useState<StrategyRow | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const accent = DESK_ACCENT[desk];
  const meta = DESK_META[desk];

  useEffect(() => {
    api<StrategyRow>(`/strategies/${id}`).then(setRow);
  }, [id]);

  async function backtest() {
    if (!row) return;
    setRunning(true);
    try {
      const res = await api<BacktestResult>("/backtest", {
        method: "POST",
        body: JSON.stringify({
          strategy_json: row.strategy_json,
          days: desk === "equity" ? 20 : 5,
        }),
      });
      setResult(res);
    } finally {
      setRunning(false);
    }
  }

  async function duplicate() {
    if (!row) return;
    const copy = await api<{ id: string }>(`/strategies/${id}/duplicate`, { method: "POST" });
    window.location.href = `/${desk}/strategies/${copy.id}`;
  }

  if (!row) return <div className="text-slate-400 p-4">Loading…</div>;

  const s = row.strategy_json;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href={`/${desk}/strategies`} className={`text-sm ${accent} hover:underline`}>
          ← {meta.label} Strategies
        </Link>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">{row.name}</h1>
        <Badge tone={row.mode === "live" ? "danger" : "success"}>{row.mode.toUpperCase()}</Badge>
        <Badge tone="info">{row.status}</Badge>
      </div>

      {/* Key parameters */}
      <Card title="Parameters">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            ["Index", s.index],
            ["Option Type", s.optionType],
            ["Strike", s.strike],
            ["Action", s.action],
            ["Candle", s.candleTime],
            ["Quantity", String(s.quantity)],
            ...(s.expiry ? [["Expiry", s.expiry]] : []),
            ...(s.holdDays ? [["Hold Days", `${s.holdDays}d`]] : []),
          ].map(([label, val]) => (
            <div key={label}>
              <div className="text-xs text-slate-500">{label}</div>
              <div className="font-medium text-slate-100">{val}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Plain-English summary">
        <p className="text-slate-200 leading-relaxed">{describeStrategy(s)}</p>
      </Card>

      <Card title="Risk Controls">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            ["Max loss/day", `₹${s.risk.maxLossPerDay}`],
            ["Max trades/day", String(s.risk.maxTradesPerDay)],
            ["Max positions", String(s.risk.maxOpenPositions)],
            ...(s.risk.autoSquareOffTime ? [["Square-off", s.risk.autoSquareOffTime]] : []),
            ...(s.risk.holdDays ? [["Hold days", `${s.risk.holdDays}d`]] : []),
          ].map(([label, val]) => (
            <div key={label}>
              <div className="text-xs text-slate-500">{label}</div>
              <div className="font-medium text-slate-100">{val}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex gap-2">
        <Button onClick={backtest} disabled={running}>
          {running ? "Running…" : "Run backtest"}
        </Button>
        <Button variant="secondary" onClick={duplicate}>Duplicate</Button>
      </div>

      {result && (
        <Card title="Backtest result">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            {[
              { label: "Trades",      v: String(result.totalTrades) },
              { label: "Wins",        v: String(result.wins) },
              { label: "Win rate",    v: `${(result.winRate * 100).toFixed(1)}%` },
              { label: "P&L",         v: `₹${result.pnl.toFixed(2)}`,        cls: result.pnl >= 0 ? "text-emerald-400" : "text-rose-400" },
              { label: "Max drawdown",v: `₹${result.maxDrawdown.toFixed(2)}`, cls: "text-amber-400" },
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
                  <th className="text-left">Entry</th><th className="text-left">Exit</th>
                  <th className="text-right">Entry ₹</th><th className="text-right">Exit ₹</th>
                  <th className="text-right">P&L</th><th className="text-left pl-3">Reason</th>
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

      <Card title="Strategy JSON">
        <pre className="text-[11px] overflow-auto max-h-96">{JSON.stringify(s, null, 2)}</pre>
      </Card>
    </div>
  );
}
