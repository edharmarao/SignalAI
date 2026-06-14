"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@signalai/ui";
import type { StrategyRow } from "@signalai/types";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

type CategoryTab = "all" | "technical" | "price_action" | "combined";

const TABS: Array<{ id: CategoryTab; label: string; icon: string }> = [
  { id: "all",          label: "All",          icon: "▤" },
  { id: "technical",    label: "Technical",    icon: "📊" },
  { id: "price_action", label: "Price Action", icon: "🕯️" },
  { id: "combined",     label: "Combined",     icon: "⚡" },
];

const STRATEGY_TYPE_LABELS: Record<string, string> = {
  orb:       "ORB",
  swing:     "Swing H/L",
  orb_rsi:   "ORB+RSI",
  swing_ema: "Swing+EMA",
};

const STRATEGY_TYPE_COLORS: Record<string, string> = {
  orb:       "bg-amber-500/10 text-amber-400 border-amber-500/20",
  swing:     "bg-amber-500/10 text-amber-400 border-amber-500/20",
  orb_rsi:   "bg-purple-500/10 text-purple-400 border-purple-500/20",
  swing_ema: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

function getRowCategory(row: StrategyRow): CategoryTab {
  const sj = row.strategy_json as any;
  const st = sj?.strategyType;
  if (!st || st === "technical") return "technical";
  if (st === "price_action") return "price_action";
  if (st === "combined") return "combined";
  return "technical";
}

function StatusBadge({ status }: { status: string }) {
  const toneMap: Record<string, "neutral" | "success" | "warn" | "danger"> = {
    draft: "neutral", active: "success", paused: "warn", stopped: "danger",
  };
  return <Badge tone={toneMap[status] ?? "neutral"}>{status}</Badge>;
}

function StrategyTypeBadge({ row }: { row: StrategyRow }) {
  const sj = row.strategy_json as any;
  const pat = sj?.priceActionType;
  if (!pat) return null;
  return (
    <span className={`text-[9px] font-bold border rounded-full px-1.5 py-0.5 ${STRATEGY_TYPE_COLORS[pat] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
      {STRATEGY_TYPE_LABELS[pat] ?? pat.toUpperCase()}
    </span>
  );
}

export default function EquityStrategiesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<CategoryTab>("all");

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

  const filtered = tab === "all" ? rows : rows.filter(r => getRowCategory(r) === tab);

  // Count per category
  const counts: Record<CategoryTab, number> = {
    all: rows.length,
    technical:    rows.filter(r => getRowCategory(r) === "technical").length,
    price_action: rows.filter(r => getRowCategory(r) === "price_action").length,
    combined:     rows.filter(r => getRowCategory(r) === "combined").length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Equity Strategies</h1>
          <p className="text-slate-400 text-sm">All your Nifty 500 stock strategies.</p>
        </div>
        <Button onClick={() => router.push("/equity/strategies/new")}>
          + New Strategy
        </Button>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1 border-b border-slate-800 pb-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-all -mb-px ${
              tab === t.id
                ? "border-blue-500 text-blue-300"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {counts[t.id] > 0 && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${tab === t.id ? "bg-blue-500/20 text-blue-400" : "bg-slate-800 text-slate-600"}`}>
                {counts[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-slate-400 py-8 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="text-center py-12 space-y-3">
            <div className="text-slate-400 text-lg">
              {tab === "all" ? "No equity strategies yet." : `No ${TABS.find(t=>t.id===tab)?.label} strategies yet.`}
            </div>
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
                  <th className="pb-3 pr-4">Type</th>
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
                {filtered.map((row) => {
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
                        <StrategyTypeBadge row={row} />
                        {!(sj as any)?.priceActionType && (
                          <span className="text-[9px] text-slate-600 border border-slate-800 rounded-full px-1.5 py-0.5">Indicator</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-mono text-emerald-400">{sj.symbol ?? "—"}</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-300">{sj.candleTime}</td>
                      <td className="py-3 pr-4">
                        <Badge tone={sj.action === "BUY" ? "success" : "danger"}>{sj.action}</Badge>
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
                          <Button variant="ghost" onClick={() => router.push(`/equity/strategies/${row.id}?edit=1`)}>Edit</Button>
                          <Button variant="ghost" onClick={() => handleDuplicate(row.id)}>Dup</Button>
                          <Button variant="ghost" onClick={() => handleDelete(row.id)}>Del</Button>
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
