"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import type { StrategyRow } from "@signalai/types";

function getOrbConfig(sj: any) { return sj?.orbConfig ?? sj?.config ?? {}; }
function getSymbols(sj: any): string[] {
  return (sj?.symbols ?? (sj?.symbol ? [sj.symbol] : [])).filter(Boolean);
}

function statusStyle(s: string) {
  return s === "active"  ? "bg-emerald-500/15 text-emerald-400 border-emerald-600/40" :
         s === "paused"  ? "bg-amber-500/15 text-amber-400 border-amber-600/40" :
         s === "stopped" ? "bg-rose-500/15 text-rose-400 border-rose-600/40" :
                           "bg-slate-800 text-slate-400 border-slate-700";
}

function statusDot(s: string) {
  return s === "active"  ? "bg-emerald-400 animate-pulse" :
         s === "paused"  ? "bg-amber-400" :
         s === "stopped" ? "bg-rose-400" : "bg-slate-600";
}

function quickDesc(sj: any): string {
  const c = getOrbConfig(sj);
  const tf = c.timeframeLabel ?? c.timeframe ?? sj?.candleTime ?? "—";
  const or = c.or_candles ? `OR ${c.or_candles}` : "";
  const vol = c.volume_multiplier ? `Vol ${c.volume_multiplier}×` : "";
  const dir = c.direction === "long" ? "▲ Long" : c.direction === "short" ? "▼ Short" : "⇅ Both";
  const rr = c.risk_reward ? `R:R 1:${c.risk_reward}` : "";
  const trail = c.trailing_sl ? "↷ Trail" : "";
  return [tf, or, vol, dir, rr, trail].filter(Boolean).join("  ·  ");
}

export default function EquityStrategiesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    api<StrategyRow[]>("/strategies?desk=equity", { signal: ctrl.signal })
      .then(setRows)
      .catch((e: any) => { if (e?.name !== "AbortError") console.error(e); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, []);

  async function refresh() {
    const data = await api<StrategyRow[]>("/strategies?desk=equity");
    setRows(data);
  }

  async function handleLive(id: string) {
    setBusyId(id);
    try {
      await api(`/strategies/${id}`, { method: "PATCH", body: JSON.stringify({ status: "active", mode: "live" }) });
      router.push(`/equity/live/${id}`);
    } catch { setBusyId(null); }
  }

  async function handlePause(id: string) {
    setBusyId(id);
    await api(`/strategies/${id}`, { method: "PATCH", body: JSON.stringify({ status: "paused" }) });
    await refresh();
    setBusyId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this strategy?")) return;
    await api(`/strategies/${id}`, { method: "DELETE" });
    await refresh();
  }

  const active = rows.filter(r => r.status === "active").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Strategies</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {rows.length} saved{active > 0 ? ` · ${active} live` : ""}
          </p>
        </div>
        <button
          onClick={() => router.push("/equity/strategies/new")}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-bold rounded-xl transition-colors"
        >
          + New Strategy
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-slate-500 text-sm py-16 text-center">Loading strategies…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl">
          <p className="text-4xl mb-3">🕯️</p>
          <p className="text-slate-400 text-lg mb-1">No strategies yet</p>
          <p className="text-slate-600 text-sm mb-6">Build your first ORB strategy and save it here.</p>
          <button onClick={() => router.push("/equity/strategies/new")}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-bold rounded-xl transition-colors">
            Create Strategy
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(row => {
            const sj = row.strategy_json as any;
            const symbols = getSymbols(sj);
            const desc = quickDesc(sj);
            const busy = busyId === row.id;

            return (
              <div key={row.id}
                className={`group flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all
                  ${row.status === "active"
                    ? "border-emerald-700/40 bg-emerald-950/10"
                    : "border-slate-800 bg-slate-900/50 hover:bg-slate-900"}`}
              >
                {/* Status dot */}
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(row.status)}`} />

                {/* Name + description */}
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => router.push(`/equity/strategies/${row.id}?edit=1`)}
                    className="text-[15px] font-bold text-slate-100 hover:text-amber-300 transition-colors text-left block truncate"
                  >
                    {row.name}
                  </button>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{desc}</p>
                </div>

                {/* Symbols */}
                <div className="hidden lg:flex flex-wrap gap-1 max-w-[200px] shrink-0">
                  {symbols.slice(0, 4).map(s => (
                    <span key={s} className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 font-mono text-[10px] text-emerald-400">
                      {s}
                    </span>
                  ))}
                  {symbols.length > 4 && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 text-[10px]">
                      +{symbols.length - 4}
                    </span>
                  )}
                </div>

                {/* Status badge */}
                <span className={`shrink-0 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide ${statusStyle(row.status)}`}>
                  {row.status}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => router.push(`/equity/strategies/${row.id}?edit=1`)}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                  >
                    Edit
                  </button>

                  {row.status === "active" ? (
                    <>
                      <button
                        onClick={() => router.push(`/equity/live/${row.id}`)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-600/40 text-emerald-400 text-xs font-semibold hover:bg-emerald-600/30 transition-colors"
                      >
                        ● View Live
                      </button>
                      <button
                        onClick={() => handlePause(row.id)}
                        disabled={busy}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-600/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
                      >
                        ⏸ Pause
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleLive(row.id)}
                      disabled={busy}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-sm shadow-emerald-900/50 transition-colors"
                    >
                      {busy ? "…" : "▶ Take Live"}
                    </button>
                  )}

                  <button
                    onClick={() => handleDelete(row.id)}
                    className="px-2 py-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 text-xs transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
