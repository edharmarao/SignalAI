"use client";
import { Card, Badge } from "@signalai/ui";
import { useLiveTicks } from "@/lib/ws";
import { INDEX_OPTIONS } from "@signalai/utils";
import Link from "next/link";

export default function DashboardPage() {
  const ticks = useLiveTicks();
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-slate-400 text-sm">
            Live index quotes, paper-mode performance, and quick actions.
          </p>
        </div>
        <Link
          href="/strategies/new"
          className="px-3 py-2 text-sm bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md font-medium"
        >
          + Create Strategy
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {INDEX_OPTIONS.map((sym) => {
          const t = ticks[sym];
          return (
            <Card key={sym}>
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-400">{sym}</div>
                <Badge tone={t ? "success" : "neutral"}>{t ? "LIVE" : "—"}</Badge>
              </div>
              <div className="text-2xl font-semibold mt-2 tabular-nums">
                {t ? t.ltp.toFixed(2) : "--"}
              </div>
            </Card>
          );
        })}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Paper P&L (today)">
          <div className="text-3xl font-semibold text-emerald-400">₹0.00</div>
          <div className="text-xs text-slate-500 mt-1">across all paper strategies</div>
        </Card>
        <Card title="Active strategies">
          <div className="text-3xl font-semibold">0</div>
          <Link href="/strategies" className="text-xs text-sky-400">
            View all →
          </Link>
        </Card>
        <Card title="Open positions">
          <div className="text-3xl font-semibold">0</div>
          <Link href="/trades" className="text-xs text-sky-400">
            View live trades →
          </Link>
        </Card>
      </div>
    </div>
  );
}
