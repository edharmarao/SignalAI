"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@signalai/ui";
import { api } from "@/lib/api";
import type { StrategyRow, DeskType } from "@signalai/types";
import { DESK_META } from "@signalai/utils";

const DESK_ACCENT: Record<DeskType, string> = {
  equity:         "text-emerald-400",
  options:        "text-violet-400",
  "mutual-funds": "text-sky-400",
};

export function DeskStrategiesPage({ desk }: { desk: DeskType }) {
  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const accent = DESK_ACCENT[desk];
  const meta = DESK_META[desk];

  async function load() {
    setLoading(true);
    try {
      setRows(await api<StrategyRow[]>(`/strategies?desk=${desk}`));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [desk]);

  async function duplicate(id: string) {
    await api(`/strategies/${id}/duplicate`, { method: "POST" });
    load();
  }
  async function remove(id: string) {
    if (!confirm("Delete this strategy?")) return;
    await api(`/strategies/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-semibold ${accent}`}>{meta.label} Strategies</h1>
          <p className="text-slate-400 text-sm mt-0.5">{meta.description}</p>
        </div>
        <Link href={`/${desk}/strategies/new`}>
          <Button>+ New</Button>
        </Link>
      </div>
      {loading ? (
        <Card>Loading…</Card>
      ) : rows.length === 0 ? (
        <Card>
          <div className="text-slate-400 text-sm">
            No {meta.label.toLowerCase()} strategies yet.{" "}
            <Link href={`/${desk}/strategies/new`} className={`${accent} hover:underline`}>
              Create your first one
            </Link>
            .
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((s) => (
            <Card key={s.id}>
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/${desk}/strategies/${s.id}`} className="font-medium hover:underline">
                  {s.name}
                </Link>
                <Badge tone={s.mode === "live" ? "danger" : "success"}>{s.mode.toUpperCase()}</Badge>
                <Badge tone={s.status === "active" ? "success" : s.status === "paused" ? "warn" : "neutral"}>
                  {s.status}
                </Badge>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {s.strategy_json.index} · {s.strategy_json.optionType} · {s.strategy_json.strike} · {s.strategy_json.candleTime}
                {s.strategy_json.expiry ? ` · ${s.strategy_json.expiry}` : ""}
                {s.strategy_json.holdDays ? ` · ${s.strategy_json.holdDays}d hold` : ""}
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={() => duplicate(s.id)}>Duplicate</Button>
                <Button variant="ghost" onClick={() => remove(s.id)}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
