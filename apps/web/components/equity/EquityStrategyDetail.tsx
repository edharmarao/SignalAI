"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@signalai/ui";
import { describeGroup } from "@signalai/utils";
import type { StrategyRow } from "@signalai/types";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

function StatusBadge({ status }: { status: string }) {
  const toneMap: Record<string, "neutral" | "success" | "warn" | "danger"> = {
    draft: "neutral", active: "success", paused: "warn", stopped: "danger",
  };
  return <Badge tone={toneMap[status] ?? "neutral"}>{status}</Badge>;
}

export default function EquityStrategyDetail({ id }: { id: string }) {
  const router = useRouter();
  const [row, setRow] = useState<StrategyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "conditions" | "risk" | "json">("overview");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api<StrategyRow>(`/strategies/${id}`)
      .then(setRow)
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!confirm("Delete this strategy?")) return;
    setDeleting(true);
    try {
      await api(`/strategies/${id}`, { method: "DELETE" });
      router.push("/equity/strategies");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDuplicate() {
    const copy = await api<StrategyRow>(`/strategies/${id}/duplicate`, { method: "POST" });
    router.push(`/equity/strategies/${copy.id}`);
  }

  if (loading) return <div className="text-slate-400 p-8">Loading…</div>;
  if (!row) return <div className="text-rose-400 p-8">Strategy not found.</div>;

  const sj = row.strategy_json;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold tracking-tight">{row.name}</h1>
            <StatusBadge status={row.status} />
            <Badge tone={row.mode === "live" ? "danger" : "neutral"}>{row.mode}</Badge>
          </div>
          <p className="text-slate-400 text-sm">
            {sj.symbol} · {sj.candleTime} · Created {new Date(row.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="secondary" onClick={() => router.push(`/equity/strategies/${id}?edit=1`)}>
            Edit Strategy
          </Button>
          <Button variant="secondary" onClick={handleDuplicate}>
            Duplicate
          </Button>
          <Button variant="secondary" onClick={() => router.push(`/equity/backtest?strategyId=${id}`)}>
            Run Backtest
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {(["overview", "conditions", "risk", "json"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize ${
              tab === t
                ? "border-b-2 border-emerald-500 text-emerald-400"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            ["Symbol", sj.symbol ?? "—"],
            ["Timeframe", sj.candleTime],
            ["Action", sj.action],
            ["Quantity", `${sj.quantity} shares`],
            ["Universe", sj.universe ?? "—"],
            ["Hold Days", sj.holdDays ? `${sj.holdDays} days` : "—"],
            ["Mode", sj.mode],
            ["Status", sj.status],
          ].map(([label, value]) => (
            <Card key={label}>
              <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
              <div className="text-lg font-medium text-slate-100 mt-1">{value}</div>
            </Card>
          ))}
        </div>
      )}

      {tab === "conditions" && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card title="Entry Conditions">
            <p className="text-sm text-slate-300 leading-relaxed font-mono">
              {describeGroup(sj.entry)}
            </p>
          </Card>
          <Card title="Exit Conditions">
            <p className="text-sm text-slate-300 leading-relaxed font-mono">
              {describeGroup(sj.exit)}
            </p>
          </Card>
        </div>
      )}

      {tab === "risk" && (
        <Card title="Risk Controls">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-800">
              {[
                ["Max Loss / Day", `₹${sj.risk.maxLossPerDay.toLocaleString()}`],
                ["Max Trades / Day", sj.risk.maxTradesPerDay],
                ["Max Open Positions", sj.risk.maxOpenPositions],
                ["Max Hold Days", sj.holdDays ?? sj.risk.holdDays ?? "—"],
                ["Kill Switch", sj.risk.killSwitch ? "Enabled" : "Disabled"],
                ["Stop Loss %", (sj.risk as any).stopLossPercent ? `${(sj.risk as any).stopLossPercent}%` : "—"],
                ["Target %", (sj.risk as any).targetPercent ? `${(sj.risk as any).targetPercent}%` : "—"],
              ].map(([k, v]) => (
                <tr key={String(k)}>
                  <td className="py-2 text-slate-400">{k}</td>
                  <td className="py-2 text-slate-100 text-right">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "json" && (
        <Card title="Raw JSON">
          <pre className="text-[11px] leading-relaxed text-slate-300 overflow-auto max-h-[600px]">
            {JSON.stringify(sj, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}
