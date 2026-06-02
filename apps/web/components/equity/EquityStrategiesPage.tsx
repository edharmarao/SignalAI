"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@signalai/ui";
import type { StrategyRow } from "@signalai/types";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

function StatusBadge({ status }: { status: string }) {
  const toneMap: Record<string, "neutral" | "success" | "warn" | "danger"> = {
    draft: "neutral", active: "success", paused: "warn", stopped: "danger",
  };
  return <Badge tone={toneMap[status] ?? "neutral"}>{status}</Badge>;
}

export default function EquityStrategiesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchStrategies() {
    setLoading(true);
    try {
      const data = await api<StrategyRow[]>("/strategies?desk=equity");
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchStrategies(); }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this strategy?")) return;
    await api(`/strategies/${id}`, { method: "DELETE" });
    fetchStrategies();
  }

  async function handleDuplicate(id: string) {
    await api(`/strategies/${id}/duplicate`, { method: "POST" });
    fetchStrategies();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Equity Strategies</h1>
          <p className="text-slate-400 text-sm">All your Nifty 500 stock strategies.</p>
        </div>
        <Button onClick={() => router.push("/equity/strategies/new")}>
          + New Strategy
        </Button>
      </div>

      {loading ? (
        <div className="text-slate-400 py-8 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <Card>
          <div className="text-center py-12 space-y-3">
            <div className="text-slate-400 text-lg">No equity strategies yet.</div>
            <p className="text-slate-500 text-sm">Create your first strategy to get started.</p>
            <Button onClick={() => router.push("/equity/strategies/new")}>
              Create Strategy
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-800">
                  <th className="pb-3 pr-4">Name</th>
                  <th className="pb-3 pr-4">Symbol</th>
                  <th className="pb-3 pr-4">Timeframe</th>
                  <th className="pb-3 pr-4">Action</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Mode</th>
                  <th className="pb-3 pr-4">Updated</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {rows.map((row) => {
                  const sj = row.strategy_json;
                  return (
                    <tr key={row.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 pr-4">
                        <button
                          className="font-medium text-slate-100 hover:text-emerald-400 transition-colors text-left"
                          onClick={() => router.push(`/equity/strategies/${row.id}`)}
                        >
                          {row.name}
                        </button>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-mono text-emerald-400">{sj.symbol ?? "—"}</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-300">{sj.candleTime}</td>
                      <td className="py-3 pr-4">
                        <Badge tone={sj.action === "BUY" ? "success" : "danger"}>
                          {sj.action}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4"><StatusBadge status={row.status} /></td>
                      <td className="py-3 pr-4">
                        <Badge tone={row.mode === "live" ? "danger" : "neutral"}>{row.mode}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-slate-500 text-xs">
                        {new Date(row.updated_at).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button variant="ghost" onClick={() => router.push(`/equity/strategies/${row.id}?edit=1`)}>
                            Edit
                          </Button>
                          <Button variant="ghost" onClick={() => handleDuplicate(row.id)}>
                            Dup
                          </Button>
                          <Button variant="ghost" onClick={() => handleDelete(row.id)}>
                            Del
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
