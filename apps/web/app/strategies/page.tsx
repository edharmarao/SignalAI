"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@signalai/ui";
import { api } from "@/lib/api";
import type { StrategyRow } from "@signalai/types";

export default function StrategiesPage() {
  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setRows(await api<StrategyRow[]>("/strategies"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

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
        <h1 className="text-2xl font-semibold">Strategies</h1>
        <Link href="/strategies/new">
          <Button>+ New</Button>
        </Link>
      </div>
      {loading ? (
        <Card>Loading…</Card>
      ) : rows.length === 0 ? (
        <Card>
          <div className="text-slate-400 text-sm">
            No strategies yet. Create your first one.
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((s) => (
            <Card key={s.id}>
              <div className="flex items-center gap-2">
                <Link href={`/strategies/${s.id}`} className="font-medium hover:underline">
                  {s.name}
                </Link>
                <Badge tone={s.mode === "live" ? "danger" : "success"}>
                  {s.mode.toUpperCase()}
                </Badge>
                <Badge tone="info">{s.status}</Badge>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {s.strategy_json.index} · {s.strategy_json.optionType} ·{" "}
                {s.strategy_json.strike} · {s.strategy_json.candleTime}
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={() => duplicate(s.id)}>
                  Duplicate
                </Button>
                <Button variant="ghost" onClick={() => remove(s.id)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
