"use client";
import { useEffect, useState } from "react";
import { Card, Badge } from "@signalai/ui";
import { api } from "@/lib/api";
import type { TradeRow } from "@signalai/types";

export default function TradesPage() {
  const [rows, setRows] = useState<TradeRow[]>([]);
  useEffect(() => {
    api<TradeRow[]>("/trades").then(setRows).catch(() => setRows([]));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Live Trades</h1>
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
                <th>Mode</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-800">
                  <td>{r.symbol}</td>
                  <td>{r.action}</td>
                  <td className="text-right">{r.quantity}</td>
                  <td className="text-right tabular-nums">{r.entry_price}</td>
                  <td className="text-right tabular-nums">{r.exit_price ?? "—"}</td>
                  <td
                    className={`text-right tabular-nums ${
                      (r.pnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {r.pnl ?? "—"}
                  </td>
                  <td>
                    <Badge tone={r.mode === "live" ? "danger" : "success"}>
                      {r.mode}
                    </Badge>
                  </td>
                  <td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
