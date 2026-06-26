"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Badge } from "@signalai/ui";
import { useLiveTicks } from "@/lib/ws";
import { INDEX_OPTIONS, DESK_META } from "@signalai/utils";
import { api } from "@/lib/api";
import type { StrategyRow, TradeRow, DeskType } from "@signalai/types";

const DESK_ACCENT: Record<DeskType, string> = {
  equity:         "text-emerald-400",
  options:        "text-violet-400",
  "mutual-funds": "text-sky-400",
};
const DESK_BTN: Record<DeskType, string> = {
  equity:         "bg-emerald-500 hover:bg-emerald-400 text-slate-950",
  options:        "bg-violet-500 hover:bg-violet-400 text-slate-950",
  "mutual-funds": "bg-sky-500 hover:bg-sky-400 text-slate-950",
};

export function DeskDashboard({ desk }: { desk: DeskType }) {
  const ticks = useLiveTicks();
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const meta = DESK_META[desk];
  const accent = DESK_ACCENT[desk];

  useEffect(() => {
    api<StrategyRow[]>(`/strategies?desk=${desk}`).then(setStrategies).catch(() => {});
    api<TradeRow[]>(`/trades?desk=${desk}`).then(setTrades).catch(() => {});
  }, [desk]);

  const todayPnl = trades.reduce((acc, t) => acc + (t.pnl ?? 0), 0);
  const active = strategies.filter((s) => s.status === "active").length;
  const open = trades.filter((t) => t.status === "open").length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className={`text-2xl font-semibold tracking-tight ${accent}`}>
            {meta.label} Desk
          </h1>
          <p className="text-slate-400 text-sm">{meta.description}</p>
        </div>
        <Link
          href={`/${desk}/strategies/new`}
          className={`px-3 py-2 text-sm rounded-md font-medium ${DESK_BTN[desk]}`}
        >
          + New Strategy
        </Link>
      </div>

      {/* Live ticks */}
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Paper P&L (cumulative)">
          <div className={`text-3xl font-semibold ${todayPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            ₹{todayPnl.toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 mt-1">across {trades.length} paper trades</div>
        </Card>
        <Card title="Active strategies">
          <div className="text-3xl font-semibold">{active}</div>
          <Link href={`/${desk}/strategies`} className={`text-xs ${accent}`}>View all →</Link>
        </Card>
        <Card title="Open positions">
          <div className="text-3xl font-semibold">{open}</div>
          <Link href={`/${desk}/trades`} className={`text-xs ${accent}`}>View trades →</Link>
        </Card>
      </div>

      {strategies.length > 0 && (
        <Card title="Recent strategies">
          <ul className="divide-y divide-slate-800">
            {strategies.slice(0, 5).map((s) => (
              <li key={s.id} className="py-2 flex items-center gap-3">
                <Link href={`/${desk}/strategies/${s.id}`} className="font-medium hover:underline">
                  {s.name}
                </Link>
                <Badge tone={s.mode === "live" ? "danger" : "success"}>{s.mode.toUpperCase()}</Badge>
                <Badge tone="info">{s.status}</Badge>
                <div className="ml-auto text-xs text-slate-500">
                  {s.strategy_json.index} · {s.strategy_json.optionType} · {s.strategy_json.candleTime}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
