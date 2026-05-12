"use client";
import { useEffect, useState } from "react";
import { Card, Badge } from "@signalai/ui";
import { api } from "@/lib/api";
import type { MutualFundHolding } from "@signalai/types";

export function MFHoldingsPage() {
  const [holdings, setHoldings] = useState<MutualFundHolding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<MutualFundHolding[]>("/mf/holdings")
      .then(setHoldings)
      .catch(() => setHoldings([]))
      .finally(() => setLoading(false));
  }, []);

  const totalInvested = holdings.reduce((a, h) => a + h.invested, 0);
  const totalValue = holdings.reduce((a, h) => a + h.current_value, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-sky-400">Holdings</h1>
        <p className="text-slate-400 text-sm mt-0.5">All mutual fund holdings and NAV details.</p>
      </div>

      {!loading && holdings.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <div className="text-xs text-slate-400">Total Invested</div>
            <div className="text-xl font-bold tabular-nums">₹{totalInvested.toLocaleString()}</div>
          </Card>
          <Card>
            <div className="text-xs text-slate-400">Current Value</div>
            <div className={`text-xl font-bold tabular-nums ${totalValue >= totalInvested ? "text-emerald-400" : "text-rose-400"}`}>
              ₹{totalValue.toLocaleString()}
            </div>
          </Card>
          <Card>
            <div className="text-xs text-slate-400">Overall Gain</div>
            <div className={`text-xl font-bold tabular-nums ${totalValue >= totalInvested ? "text-emerald-400" : "text-rose-400"}`}>
              {totalValue >= totalInvested ? "+" : ""}₹{(totalValue - totalInvested).toFixed(0)}
            </div>
          </Card>
        </div>
      )}

      <Card>
        {loading ? (
          <div className="text-slate-400 text-sm">Loading…</div>
        ) : holdings.length === 0 ? (
          <div className="text-slate-400 text-sm">No holdings yet.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="text-left py-2">Fund</th>
                  <th className="text-left">Category</th>
                  <th className="text-right">Invested</th>
                  <th className="text-right">Units</th>
                  <th className="text-right">NAV</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Gain/Loss</th>
                  <th className="text-right">XIRR</th>
                  <th className="text-center">SIP</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const gain = h.current_value - h.invested;
                  const gainPct = ((gain / h.invested) * 100).toFixed(1);
                  return (
                    <tr key={h.id} className="border-t border-slate-800 hover:bg-slate-800/30 transition">
                      <td className="py-2 font-medium max-w-[200px]">
                        <div className="truncate">{h.fund_name}</div>
                        <div className="text-xs text-slate-500">{h.folio}</div>
                      </td>
                      <td>
                        <Badge tone="neutral">{h.category}</Badge>
                      </td>
                      <td className="text-right tabular-nums">₹{h.invested.toLocaleString()}</td>
                      <td className="text-right tabular-nums">{h.units.toFixed(2)}</td>
                      <td className="text-right tabular-nums">₹{h.nav.toFixed(2)}</td>
                      <td className="text-right tabular-nums font-medium">₹{h.current_value.toLocaleString()}</td>
                      <td className={`text-right tabular-nums ${gain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {gain >= 0 ? "+" : ""}₹{gain.toFixed(0)}
                        <div className="text-xs">{gain >= 0 ? "+" : ""}{gainPct}%</div>
                      </td>
                      <td className={`text-right tabular-nums font-medium ${h.xirr >= 15 ? "text-emerald-400" : "text-slate-100"}`}>
                        {h.xirr.toFixed(1)}%
                      </td>
                      <td className="text-center">
                        {h.sip_amount ? (
                          <div className="text-xs text-sky-400">₹{h.sip_amount.toLocaleString()}</div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
