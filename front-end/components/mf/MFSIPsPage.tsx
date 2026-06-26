"use client";
import { useEffect, useState } from "react";
import { Card, Badge } from "@signalai/ui";
import { api } from "@/lib/api";
import type { SIPEntry } from "@signalai/types";

export function MFSIPsPage() {
  const [sips, setSips] = useState<SIPEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<SIPEntry[]>("/mf/sips")
      .then(setSips)
      .catch(() => setSips([]))
      .finally(() => setLoading(false));
  }, []);

  const activeSIPs = sips.filter((s) => s.status === "active");
  const monthly = activeSIPs.reduce((a, s) => a + s.amount, 0);

  const statusTone = (s: SIPEntry["status"]) =>
    s === "active" ? "success" : s === "paused" ? "warn" : "neutral";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-sky-400">SIP Tracker</h1>
        <p className="text-slate-400 text-sm mt-0.5">Systematic Investment Plans — active & history.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <div className="text-xs text-slate-400">Active SIPs</div>
          <div className="text-2xl font-bold">{activeSIPs.length}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-400">Monthly outflow</div>
          <div className="text-2xl font-bold tabular-nums">₹{monthly.toLocaleString()}</div>
        </Card>
      </div>

      <Card>
        {loading ? (
          <div className="text-slate-400 text-sm">Loading…</div>
        ) : sips.length === 0 ? (
          <div className="text-slate-400 text-sm">No SIPs configured yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="text-left py-2">Fund</th>
                <th className="text-right">Amount</th>
                <th className="text-center">Frequency</th>
                <th className="text-center">Day</th>
                <th className="text-left">Next Date</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {sips.map((s) => (
                <tr key={s.id} className="border-t border-slate-800 hover:bg-slate-800/30 transition">
                  <td className="py-2 font-medium max-w-[220px]">
                    <div className="truncate">{s.fund_name}</div>
                  </td>
                  <td className="text-right tabular-nums font-medium">₹{s.amount.toLocaleString()}</td>
                  <td className="text-center text-slate-400">{s.frequency}</td>
                  <td className="text-center text-slate-400">{s.day}</td>
                  <td className="text-slate-400 text-xs">
                    {new Date(s.next_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="text-center">
                    <Badge tone={statusTone(s.status)}>{s.status}</Badge>
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
