"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Badge } from "@signalai/ui";
import { api } from "@/lib/api";
import type { MutualFundHolding, SIPEntry } from "@signalai/types";

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${color ?? "text-slate-100"}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </Card>
  );
}

export function MFDashboard() {
  const [holdings, setHoldings] = useState<MutualFundHolding[]>([]);
  const [sips, setSips] = useState<SIPEntry[]>([]);

  useEffect(() => {
    api<MutualFundHolding[]>("/mf/holdings").then(setHoldings).catch(() => {});
    api<SIPEntry[]>("/mf/sips").then(setSips).catch(() => {});
  }, []);

  const totalInvested = holdings.reduce((a, h) => a + h.invested, 0);
  const totalValue = holdings.reduce((a, h) => a + h.current_value, 0);
  const totalGain = totalValue - totalInvested;
  const gainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
  const avgXirr = holdings.length > 0 ? holdings.reduce((a, h) => a + h.xirr, 0) / holdings.length : 0;
  const activeSIPs = sips.filter((s) => s.status === "active").length;
  const monthlySIP = sips.filter((s) => s.status === "active").reduce((a, s) => a + s.amount, 0);

  // Category breakdown
  const byCategory = holdings.reduce<Record<string, number>>((acc, h) => {
    acc[h.category] = (acc[h.category] ?? 0) + h.current_value;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-sky-400">Mutual Funds</h1>
          <p className="text-slate-400 text-sm">Portfolio overview · SIPs · Holdings</p>
        </div>
        <div className="flex gap-2">
          <Link href="/mutual-funds/sips" className="px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md">
            Manage SIPs
          </Link>
          <Link href="/mutual-funds/holdings" className="px-3 py-2 text-sm bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-md font-medium">
            View Holdings
          </Link>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Invested" value={`₹${(totalInvested / 1000).toFixed(1)}K`} />
        <StatCard
          label="Current Value"
          value={`₹${(totalValue / 1000).toFixed(1)}K`}
          sub={`${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}% absolute`}
          color={totalGain >= 0 ? "text-emerald-400" : "text-rose-400"}
        />
        <StatCard
          label="Total Gain / Loss"
          value={`${totalGain >= 0 ? "+" : ""}₹${Math.abs(totalGain).toFixed(0)}`}
          color={totalGain >= 0 ? "text-emerald-400" : "text-rose-400"}
        />
        <StatCard label="Avg XIRR" value={`${avgXirr.toFixed(1)}%`} sub="annualised return" color="text-sky-400" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Active SIPs" value={String(activeSIPs)} sub={`₹${monthlySIP.toLocaleString()}/month`} />
        <StatCard label="Funds" value={String(holdings.length)} sub="across all categories" />
      </div>

      {/* Category breakdown */}
      {Object.keys(byCategory).length > 0 && (
        <Card title="Allocation by Category">
          <div className="space-y-2">
            {Object.entries(byCategory)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([cat, val]) => {
                const numVal = val as number;
                const pct = (numVal / totalValue) * 100;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300">{cat}</span>
                      <span className="text-slate-400 tabular-nums">
                        ₹{(numVal / 1000).toFixed(1)}K · {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Top funds */}
      {holdings.length > 0 && (
        <Card title="Top Holdings">
          <ul className="divide-y divide-slate-800">
            {holdings
              .sort((a, b) => b.current_value - a.current_value)
              .slice(0, 5)
              .map((h) => {
                const gain = h.current_value - h.invested;
                return (
                  <li key={h.id} className="py-2 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{h.fund_name}</div>
                      <div className="text-xs text-slate-500">{h.category}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium tabular-nums">₹{(h.current_value / 1000).toFixed(1)}K</div>
                      <div className={`text-xs tabular-nums ${gain >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {gain >= 0 ? "+" : ""}₹{gain.toFixed(0)} · {h.xirr.toFixed(1)}% XIRR
                      </div>
                    </div>
                  </li>
                );
              })}
          </ul>
        </Card>
      )}
    </div>
  );
}
