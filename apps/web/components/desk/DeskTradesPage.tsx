"use client";
import { useEffect, useState } from "react";
import { Card, Badge } from "@signalai/ui";
import { api } from "@/lib/api";
import type { TradeRow, DeskType } from "@signalai/types";
import { DESK_META } from "@signalai/utils";

const DESK_ACCENT: Record<DeskType, string> = {
  equity:         "text-emerald-400",
  options:        "text-violet-400",
  "mutual-funds": "text-sky-400",
};

export function DeskTradesPage({ desk }: { desk: DeskType }) {
  const [rows, setRows] = useState<TradeRow[]>([]);
  const accent = DESK_ACCENT[desk];
  const meta = DESK_META[desk];

  useEffect(() => {
    api<TradeRow[]>(`/trades?desk=${desk}`).then(setRows).catch(() => setRows([]));
  }, [desk]);

  const openPnl = rows.filter((r) => r.status === "open").reduce((a, r) => a + (r.pnl ?? 0), 0);
  const closedPnl = rows.filter((r) => r.status === "closed").reduce((a, r) => a + (r.pnl ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className={`text-2xl font-semibold ${accent}`}>{meta.label} Trades</h1>
        <p className="text-slate-400 text-sm mt-0.5">Live & historical paper trades for this desk.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-xs text-slate-400">Total trades</div>
          <div className="text-2xl font-semibold">{rows.length}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-400">Open P&L</div>
          <div className={`text-2xl font-semibold ${openPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            ₹{openPnl.toFixed(2)}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-400">Realised P&L</div>
          <div className={`text-2xl font-semibold ${closedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            ₹{closedPnl.toFixed(2)}
          </div>
        </Card>
      </div>

      <Card>
        {rows.length === 0 ? (
          <div className="text-slate-400 text-sm">No trades yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="text-left">Symbol</th>
                <th className="text-left">Side</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Entry</th>
                <th className="text-right">Exit</th>
                <th className="text-right">P&L</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-800">
                  <td className="py-1.5">{r.symbol}</td>
                  <td>{r.action}</td>
                  <td className="text-right">{r.quantity}</td>
                  <td className="text-right tabular-nums">{r.entry_price}</td>
                  <td className="text-right tabular-nums">{r.exit_price ?? "—"}</td>
                  <td className={`text-right tabular-nums ${(r.pnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {r.pnl != null ? `₹${r.pnl.toFixed(2)}` : "—"}
                  </td>
                  <td className="text-center">
                    <Badge tone={r.status === "open" ? "warn" : "neutral"}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
