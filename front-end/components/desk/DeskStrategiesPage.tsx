"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, ConfirmDialog } from "@signalai/ui";
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
  const [deleteModal, setDeleteModal] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
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

  async function confirmDelete() {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      await api(`/strategies/${deleteModal.id}`, { method: "DELETE" });
      await load();
      setDeleteModal(null);
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setDeleting(false);
    }
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
                <Button variant="ghost" onClick={() => setDeleteModal({ id: s.id, name: s.name })}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onConfirm={confirmDelete}
        title="Delete Strategy"
        message={
          <div className="space-y-3">
            <p>
              Are you sure you want to delete <span className="font-bold text-amber-400">{deleteModal?.name}</span>?
            </p>
            <p className="text-slate-400 text-xs">
              This action cannot be undone. All associated trades, logs, and backtest data will be permanently removed.
            </p>
          </div>
        }
        confirmText="Delete Strategy"
        cancelText="Cancel"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
