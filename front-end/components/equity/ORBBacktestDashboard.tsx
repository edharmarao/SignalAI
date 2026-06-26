"use client";
/**
 * ORBBacktestDashboard
 * Beautiful dedicated backtesting dashboard for the ORB (Opening Range Breakout) strategy.
 * - Fetches symbols from nse_eq_symbols
 * - Runs backtest via POST /orb/backtest
 * - Shows equity curve (TradingView Lightweight Charts), monthly P&L calendar,
 *   KPI cards, and a full trade log table.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, ColorType, CrosshairMode, LineSeries, HistogramSeries,
  type IChartApi, type UTCTimestamp,
} from "lightweight-charts";
import { api } from "@/lib/api";
import { istToMs } from "@/lib/highcharts";

// ── Types ─────────────────────────────────────────────────────────────────────
interface NSESymbol { symbol: string; company_name: string; industry: string; }

interface ORBTrade {
  date: string;
  side: string;
  entryTime: string;
  entryPrice: number;
  stopLoss: number;
  target: number;
  risk: number;
  exitTime: string;
  exitPrice: number;
  pnl: number;
  exitReason: string;
  trailingActive: boolean;
}

interface BacktestResult {
  symbol: string;
  timeframe: string;
  from_date: string;
  to_date: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  maxDrawdown: number;
  trades: ORBTrade[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TIMEFRAMES = [
  { key: "5min",    label: "5 Min",    table: "stock_data_5min"    },
  { key: "15min",   label: "15 Min",   table: "stock_data_15min"   },
  { key: "25min",   label: "25 Min",   table: "stock_data_25min"   },
  { key: "75min",   label: "75 Min",   table: "stock_data_75min"   },
  { key: "125min",  label: "125 Min",  table: "stock_data_125min"  },
  { key: "daily",   label: "Daily",    table: "stock_data_daily"   },
  { key: "weekly",  label: "Weekly",   table: "stock_data_weekly"  },
  { key: "monthly", label: "Monthly",  table: "stock_data_monthly" },
] as const;
type TFKey = typeof TIMEFRAMES[number]["key"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtRs(n: number, decimals = 2) {
  return `₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%`; }
function fmtTime(s: string) {
  if (!s) return "—";
  return new Date(s.replace(" ", "T") + "+05:30").toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
function fmtDate(s: string) {
  if (!s) return "—";
  return new Date(s.replace(" ", "T") + "+05:30").toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "2-digit",
  });
}

function defaultDates(tf: TFKey) {
  const to = new Date();
  const from = new Date();
  if (tf === "daily" || tf === "weekly" || tf === "monthly") from.setFullYear(from.getFullYear() - 1);
  else from.setMonth(from.getMonth() - 3);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// ── Symbol picker ─────────────────────────────────────────────────────────────
function SymbolPicker({ value, onSelect }: { value: string; onSelect: (s: NSESymbol) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<NSESymbol[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (!q) { setResults([]); return; }
    setLoading(true);
    api<NSESymbol[]>(`/orb/nse-symbols?q=${encodeURIComponent(q)}`)
      .then(setResults).catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <div ref={ref} className="relative">
      <input
        value={open ? q : value}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQ(""); }}
        placeholder="Search NSE symbol…"
        className="w-full bg-[#1e222d] border border-[#2a2e39] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-[#26a69a] transition-colors"
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl max-h-52 overflow-y-auto">
          {loading && <p className="px-3 py-2 text-xs text-slate-500">Searching…</p>}
          {!loading && q && results.length === 0 && <p className="px-3 py-2 text-xs text-slate-600">No matches for "{q}"</p>}
          {!loading && !q && <p className="px-3 py-2 text-xs text-slate-600">Type to search 750 NSE symbols…</p>}
          {results.map(s => (
            <button key={s.symbol} onClick={() => { onSelect(s); setOpen(false); setQ(""); }}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#2a2e39] text-left transition-colors">
              <span className="font-bold text-slate-100 text-xs w-24 shrink-0 font-mono">{s.symbol}</span>
              <span className="text-slate-500 text-[10px] truncate">{s.company_name}</span>
              <span className="ml-auto text-[9px] text-slate-600 shrink-0">{s.industry}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = "default", icon }: {
  label: string; value: string; sub?: string;
  color?: "default" | "green" | "red" | "amber" | "blue";
  icon?: string;
}) {
  const colorMap = {
    default: "text-slate-100",
    green:   "text-[#26a69a]",
    red:     "text-[#ef5350]",
    amber:   "text-amber-400",
    blue:    "text-blue-400",
  };
  return (
    <div className="bg-[#1e222d] border border-[#2a2e39] rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-2">
        {icon && <span className="text-sm">{icon}</span>}
        <p className="text-[10px] font-bold text-[#787b86] uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-xl font-bold font-mono ${colorMap[color]}`}>{value}</p>
      {sub && <p className="text-[10px] text-[#787b86] mt-1">{sub}</p>}
    </div>
  );
}

// ── Equity Curve Chart ─────────────────────────────────────────────────────────
function EquityCurveChart({ trades }: { trades: ORBTrade[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || trades.length === 0) return;

    // Build cumulative P&L series from trades, sorted by entryTime
    const sorted = [...trades].sort((a, b) =>
      istToMs(a.entryTime) - istToMs(b.entryTime)
    );
    let cumPnl = 0;
    const lineData: { time: UTCTimestamp; value: number }[] = [];
    const histData: { time: UTCTimestamp; value: number; color: string }[] = [];

    sorted.forEach(t => {
      cumPnl += t.pnl;
      const sec = Math.floor(istToMs(t.entryTime) / 1000) as UTCTimestamp;
      lineData.push({ time: sec, value: cumPnl });
      histData.push({ time: sec, value: t.pnl, color: t.pnl >= 0 ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)" });
    });

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor: "#d1d4dc",
        fontFamily: "'Inter', ui-sans-serif",
        fontSize: 11,
      },
      grid: { vertLines: { color: "#1e2030" }, horzLines: { color: "#1e2030" } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#758696", width: 1, labelBackgroundColor: "#1e222d" },
        horzLine: { color: "#758696", width: 1, labelBackgroundColor: "#1e222d" },
      },
      rightPriceScale: { borderColor: "#2a2e39" },
      leftPriceScale: { visible: false },
      timeScale: {
        borderColor: "#2a2e39", timeVisible: true, secondsVisible: false,
        tickMarkFormatter: (time: UTCTimestamp) => {
          return new Date((time as number) * 1000).toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata", day: "2-digit", month: "short",
          });
        },
      },
      localization: {
        timeFormatter: (time: UTCTimestamp) => {
          return new Date((time as number) * 1000).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", hour12: false,
          });
        },
        priceFormatter: (p: number) => `₹${p.toFixed(2)}`,
      },
    });

    // Per-trade P&L bars (bottom pane)
    const barSeries = chart.addSeries(HistogramSeries, {
      color: "rgba(38,166,154,0.6)", priceFormat: { type: "price", precision: 2 },
      priceScaleId: "bars",
    });
    chart.priceScale("bars").applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });
    barSeries.setData(histData);

    // Equity curve (main)
    const lineSeries = chart.addSeries(LineSeries, {
      color: cumPnl >= 0 ? "#26a69a" : "#ef5350",
      lineWidth: 2,
      priceFormat: { type: "price", precision: 2 },
      priceScaleId: "right",
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      lastValueVisible: true,
    });
    lineSeries.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.28 } });

    // Gradient fill under equity curve
    const areaSeries = chart.addSeries(LineSeries, {
      color: "transparent",
      lineWidth: 0,
      priceScaleId: "right",
      crosshairMarkerVisible: false,
      lastValueVisible: false,
    } as any);
    void areaSeries; // might not be supported — just use line

    lineSeries.setData(lineData);

    // Zero line
    lineSeries.createPriceLine({ price: 0, color: "#475569", lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });

    // Legend
    el.style.position = "relative";
    const legend = document.createElement("div");
    legend.style.cssText = "position:absolute;top:8px;left:12px;z-index:10;pointer-events:none;font-size:11px;color:#d1d4dc;background:rgba(19,23,34,0.85);padding:4px 10px;border-radius:4px;border:1px solid #2a2e39;";
    el.appendChild(legend);

    chart.subscribeCrosshairMove(param => {
      const ld = param.seriesData.get(lineSeries) as any;
      const bd = param.seriesData.get(barSeries) as any;
      if (!ld && !bd) { legend.innerHTML = ""; return; }
      const col = (ld?.value ?? 0) >= 0 ? "#26a69a" : "#ef5350";
      const bCol = (bd?.value ?? 0) >= 0 ? "#26a69a" : "#ef5350";
      legend.innerHTML =
        `<span style="color:#787b86">Equity</span> <b style="color:${col}">${ld ? `₹${ld.value.toFixed(2)}` : "—"}</b>` +
        (bd ? `  <span style="color:#787b86">Trade P&L</span> <b style="color:${bCol}">₹${bd.value.toFixed(2)}</b>` : "");
    });

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);

    return () => {
      ro.disconnect();
      if (el.contains(legend)) el.removeChild(legend);
      chart.remove();
    };
  }, [trades]);

  if (trades.length === 0) return (
    <div className="flex items-center justify-center h-full text-slate-600 text-sm">
      No trades to display
    </div>
  );

  return <div ref={containerRef} className="w-full h-full" />;
}

// ── Monthly P&L Calendar ──────────────────────────────────────────────────────
function MonthlyPnLGrid({ trades }: { trades: ORBTrade[] }) {
  const monthly = useMemo(() => {
    const map: Record<string, { pnl: number; count: number; wins: number }> = {};
    for (const t of trades) {
      const d = new Date(t.date.replace(" ", "T") + "T00:00:00+05:30");
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map[key]) map[key] = { pnl: 0, count: 0, wins: 0 };
      map[key].pnl += t.pnl;
      map[key].count++;
      if (t.pnl > 0) map[key].wins++;
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [trades]);

  if (monthly.length === 0) return null;

  const maxAbs = Math.max(...monthly.map(([, v]) => Math.abs(v.pnl)), 1);

  return (
    <div>
      <p className="text-[10px] font-bold text-[#787b86] uppercase tracking-widest mb-3">Monthly P&L</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {monthly.map(([key, v]) => {
          const [yr, mo] = key.split("-");
          const monthName = new Date(`${key}-01`).toLocaleDateString("en-IN", { month: "short" });
          const intensity = Math.min(Math.abs(v.pnl) / maxAbs, 1);
          const bg = v.pnl >= 0
            ? `rgba(38,166,154,${0.08 + intensity * 0.4})`
            : `rgba(239,83,80,${0.08 + intensity * 0.4})`;
          const border = v.pnl >= 0 ? "rgba(38,166,154,0.3)" : "rgba(239,83,80,0.3)";
          const textCol = v.pnl >= 0 ? "#26a69a" : "#ef5350";
          return (
            <div key={key} className="rounded-lg p-3 text-center" style={{ background: bg, border: `1px solid ${border}` }}>
              <p className="text-[9px] text-[#787b86] font-bold">{monthName} {yr}</p>
              <p className="text-sm font-bold font-mono mt-1" style={{ color: textCol }}>
                {v.pnl >= 0 ? "+" : "−"}{fmtRs(v.pnl, 0)}
              </p>
              <p className="text-[9px] text-[#787b86] mt-0.5">{v.count} trades · {Math.round(v.wins/v.count*100)}% win</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Day-by-Day P&L Heatmap row ────────────────────────────────────────────────
function DailyPnLBar({ trades }: { trades: ORBTrade[] }) {
  const daily = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of trades) map[t.date] = (map[t.date] ?? 0) + t.pnl;
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [trades]);

  if (daily.length === 0) return null;
  const maxAbs = Math.max(...daily.map(([, v]) => Math.abs(v)), 1);

  return (
    <div>
      <p className="text-[10px] font-bold text-[#787b86] uppercase tracking-widest mb-2">Daily P&L Heat Map</p>
      <div className="flex flex-wrap gap-1">
        {daily.map(([date, pnl]) => {
          const intensity = Math.min(Math.abs(pnl) / maxAbs, 1);
          const bg = pnl >= 0
            ? `rgba(38,166,154,${0.1 + intensity * 0.7})`
            : `rgba(239,83,80,${0.1 + intensity * 0.7})`;
          return (
            <div key={date} title={`${date}: ${pnl >= 0 ? "+" : ""}₹${pnl.toFixed(2)}`}
              className="rounded w-7 h-7 flex items-center justify-center cursor-default"
              style={{ background: bg }}>
              <span className="text-[8px] text-white/80 font-mono leading-none">
                {new Date(date + "T00:00:00+05:30").getDate()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Trade Log Table ────────────────────────────────────────────────────────────
type SortKey = "date" | "side" | "entryPrice" | "exitPrice" | "pnl" | "exitReason";

function TradeLog({ trades }: { trades: ORBTrade[] }) {
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [asc, setAsc] = useState(true);
  const [filter, setFilter] = useState<"all" | "win" | "loss">("all");
  const [search, setSearch] = useState("");

  function toggleSort(k: SortKey) {
    if (sortBy === k) setAsc(a => !a);
    else { setSortBy(k); setAsc(true); }
  }

  const sorted = useMemo(() => {
    let rows = [...trades];
    if (filter === "win") rows = rows.filter(t => t.pnl > 0);
    if (filter === "loss") rows = rows.filter(t => t.pnl <= 0);
    if (search) rows = rows.filter(t => t.exitReason.includes(search) || t.side.includes(search.toUpperCase()) || t.date.includes(search));
    rows.sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sortBy === "date") { va = a.date; vb = b.date; }
      else if (sortBy === "side") { va = a.side; vb = b.side; }
      else if (sortBy === "exitReason") { va = a.exitReason; vb = b.exitReason; }
      else { va = (a as any)[sortBy]; vb = (b as any)[sortBy]; }
      if (va < vb) return asc ? -1 : 1;
      if (va > vb) return asc ? 1 : -1;
      return 0;
    });
    return rows;
  }, [trades, sortBy, asc, filter, search]);

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className={`ml-1 text-[9px] ${sortBy === k ? "text-[#26a69a]" : "text-[#2a2e39]"}`}>
      {sortBy === k ? (asc ? "▲" : "▼") : "⇅"}
    </span>
  );

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="pb-2 pr-4 text-left cursor-pointer hover:text-slate-300 select-none whitespace-nowrap"
      onClick={() => toggleSort(k)}>
      {label}<SortIcon k={k} />
    </th>
  );

  const reasonBadge: Record<string, string> = {
    target: "bg-[#26a69a]/20 text-[#26a69a] border-[#26a69a]/30",
    stop_loss: "bg-[#ef5350]/20 text-[#ef5350] border-[#ef5350]/30",
    trailing: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    eod: "bg-slate-700 text-slate-400 border-slate-600",
  };

  return (
    <div>
      {/* Filter row */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <p className="text-[10px] font-bold text-[#787b86] uppercase tracking-widest">Trade Log</p>
        <div className="flex gap-1">
          {(["all", "win", "loss"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold capitalize transition-all ${
                filter === f
                  ? f === "win" ? "bg-[#26a69a]/20 text-[#26a69a] border border-[#26a69a]/40"
                    : f === "loss" ? "bg-[#ef5350]/20 text-[#ef5350] border border-[#ef5350]/40"
                    : "bg-slate-700 text-slate-300 border border-slate-600"
                  : "text-[#787b86] hover:text-slate-300 border border-transparent"
              }`}>
              {f === "all" ? `All (${trades.length})` : f === "win" ? `✓ Wins (${trades.filter(t=>t.pnl>0).length})` : `✗ Losses (${trades.filter(t=>t.pnl<=0).length})`}
            </button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter…"
          className="ml-auto bg-[#1e222d] border border-[#2a2e39] rounded-lg px-3 py-1 text-xs text-slate-300 focus:outline-none focus:border-[#26a69a] w-32" />
        <span className="text-[10px] text-[#787b86]">{sorted.length} rows</span>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-96 rounded-xl border border-[#2a2e39]">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-[#1a1f2e] z-10">
            <tr className="text-[#787b86] uppercase tracking-widest border-b border-[#2a2e39]">
              <Th k="date" label="Date" />
              <th className="pb-2 pr-4 text-left text-[10px]">Entry Time</th>
              <Th k="side" label="Side" />
              <Th k="entryPrice" label="Entry ₹" />
              <th className="pb-2 pr-4 text-left text-[10px]">SL ₹</th>
              <th className="pb-2 pr-4 text-left text-[10px]">Target ₹</th>
              <th className="pb-2 pr-4 text-left text-[10px]">Exit Time</th>
              <Th k="exitPrice" label="Exit ₹" />
              <Th k="pnl" label="P&L" />
              <Th k="exitReason" label="Exit Reason" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e222d]">
            {sorted.map((t, i) => (
              <tr key={i} className={`transition-colors ${t.pnl > 0 ? "hover:bg-[#26a69a]/5" : "hover:bg-[#ef5350]/5"}`}>
                <td className="py-2 pr-4 text-[#787b86] font-mono whitespace-nowrap">{t.date}</td>
                <td className="py-2 pr-4 text-[#787b86] font-mono whitespace-nowrap">{fmtTime(t.entryTime)}</td>
                <td className="py-2 pr-4">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${t.side === "BUY" ? "bg-[#26a69a]/20 text-[#26a69a]" : "bg-[#ef5350]/20 text-[#ef5350]"}`}>
                    {t.side}
                  </span>
                </td>
                <td className="py-2 pr-4 text-slate-200 font-mono">{t.entryPrice.toFixed(2)}</td>
                <td className="py-2 pr-4 text-[#ef5350]/80 font-mono">{t.stopLoss.toFixed(2)}</td>
                <td className="py-2 pr-4 text-blue-400/80 font-mono">{t.target.toFixed(2)}</td>
                <td className="py-2 pr-4 text-[#787b86] font-mono whitespace-nowrap">{fmtTime(t.exitTime)}</td>
                <td className="py-2 pr-4 text-slate-200 font-mono">{t.exitPrice.toFixed(2)}</td>
                <td className={`py-2 pr-4 font-mono font-bold ${t.pnl > 0 ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
                  {t.pnl > 0 ? "+" : ""}{t.pnl.toFixed(2)}
                </td>
                <td className="py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${reasonBadge[t.exitReason] ?? "text-slate-500 border-slate-700"}`}>
                    {t.exitReason.replace("_", " ")}{t.trailingActive ? " 🔄" : ""}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Win/Loss Distribution ──────────────────────────────────────────────────────
function WinLossStats({ trades }: { trades: ORBTrade[] }) {
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  const bestTrade = trades.reduce((m, t) => t.pnl > m ? t.pnl : m, -Infinity);
  const worstTrade = trades.reduce((m, t) => t.pnl < m ? t.pnl : m, Infinity);
  const profitFactor = losses.reduce((s, t) => s + Math.abs(t.pnl), 0) > 0
    ? wins.reduce((s, t) => s + t.pnl, 0) / losses.reduce((s, t) => s + Math.abs(t.pnl), 0)
    : Infinity;

  const rrBuy = trades.filter(t => t.side === "BUY");
  const rrSell = trades.filter(t => t.side === "SELL");

  const rows = [
    { label: "Avg Win", val: fmtRs(avgWin), col: "text-[#26a69a]" },
    { label: "Avg Loss", val: fmtRs(Math.abs(avgLoss)), col: "text-[#ef5350]" },
    { label: "Best Trade", val: fmtRs(bestTrade), col: "text-[#26a69a]" },
    { label: "Worst Trade", val: fmtRs(Math.abs(worstTrade)), col: "text-[#ef5350]" },
    { label: "Profit Factor", val: isFinite(profitFactor) ? profitFactor.toFixed(2) : "∞", col: profitFactor >= 1 ? "text-[#26a69a]" : "text-[#ef5350]" },
    { label: "BUY Trades", val: String(rrBuy.length), col: "text-[#26a69a]" },
    { label: "SELL Trades", val: String(rrSell.length), col: "text-[#ef5350]" },
  ];

  return (
    <div className="bg-[#1e222d] border border-[#2a2e39] rounded-xl p-4">
      <p className="text-[10px] font-bold text-[#787b86] uppercase tracking-widest mb-3">Statistics</p>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between">
            <span className="text-[11px] text-[#787b86]">{r.label}</span>
            <span className={`text-[11px] font-bold font-mono ${r.col}`}>{r.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Exit Reason Breakdown ──────────────────────────────────────────────────────
function ExitBreakdown({ trades }: { trades: ORBTrade[] }) {
  const breakdown = useMemo(() => {
    const map: Record<string, { count: number; pnl: number }> = {};
    for (const t of trades) {
      if (!map[t.exitReason]) map[t.exitReason] = { count: 0, pnl: 0 };
      map[t.exitReason].count++;
      map[t.exitReason].pnl += t.pnl;
    }
    return Object.entries(map).sort(([, a], [, b]) => b.count - a.count);
  }, [trades]);

  const maxCount = Math.max(...breakdown.map(([, v]) => v.count), 1);

  const colors: Record<string, string> = {
    target: "#26a69a",
    stop_loss: "#ef5350",
    trailing: "#f59e0b",
    eod: "#787b86",
  };

  return (
    <div className="bg-[#1e222d] border border-[#2a2e39] rounded-xl p-4">
      <p className="text-[10px] font-bold text-[#787b86] uppercase tracking-widest mb-3">Exit Breakdown</p>
      <div className="space-y-3">
        {breakdown.map(([reason, v]) => {
          const pct = v.count / trades.length;
          const color = colors[reason] ?? "#787b86";
          return (
            <div key={reason}>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="font-bold" style={{ color }}>{reason.replace("_", " ")}</span>
                <span className="text-[#787b86]">{v.count} ({Math.round(pct * 100)}%)</span>
              </div>
              <div className="h-1.5 bg-[#2a2e39] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${(v.count / maxCount) * 100}%`, background: color }} />
              </div>
              <p className="text-[9px] mt-0.5" style={{ color: v.pnl >= 0 ? "#26a69a" : "#ef5350" }}>
                {v.pnl >= 0 ? "+" : ""}₹{v.pnl.toFixed(0)} total P&L
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function ORBBacktestDashboard() {
  const [selectedSym, setSelectedSym] = useState<NSESymbol>({ symbol: "RELIANCE", company_name: "Reliance Industries", industry: "" });
  const [tf, setTf] = useState<TFKey>("5min");
  const [fromDate, setFromDate] = useState(() => defaultDates("5min").from);
  const [toDate, setToDate] = useState(() => defaultDates("5min").to);
  const [qty, setQty] = useState("1");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const symbol = selectedSym.symbol;

  useEffect(() => {
    const d = defaultDates(tf);
    setFromDate(d.from); setToDate(d.to);
  }, [tf]);

  const runBacktest = useCallback(async () => {
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await api<BacktestResult>("/orb/backtest", {
        method: "POST",
        body: JSON.stringify({ symbol, timeframe: tf, from_date: fromDate, to_date: toDate, qty: parseInt(qty) || 1 }),
      });
      setResult(res);
    } catch (e: any) {
      setError(e.message ?? "Backtest failed");
    } finally { setRunning(false); }
  }, [symbol, tf, fromDate, toDate, qty]);

  const tfLabel = TIMEFRAMES.find(t => t.key === tf)?.label ?? tf;

  // Derived metrics
  const sharpe = useMemo(() => {
    if (!result || result.trades.length < 2) return null;
    const pnls = result.trades.map(t => t.pnl);
    const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const std = Math.sqrt(pnls.reduce((a, b) => a + (b - mean) ** 2, 0) / pnls.length);
    return std > 0 ? (mean / std * Math.sqrt(252)).toFixed(2) : null;
  }, [result]);

  return (
    <div className="fixed flex flex-col" style={{ top: 60, left: 240, right: 0, bottom: 0, zIndex: 5, background: "#131722", overflowY: "auto" }}>
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0" style={{ borderColor: "#2a2e39", background: "#131722" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(245,158,11,0.15)" }}>
            <span className="text-lg">📊</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-100">ORB Backtest</h1>
            <p className="text-[10px] text-[#787b86]">Opening Range Breakout · Price Action Strategy</p>
          </div>
        </div>
        {result && (
          <div className="flex items-center gap-2 text-[10px] text-[#787b86]">
            <span className="font-mono">{result.symbol}</span>
            <span>·</span>
            <span>{tfLabel}</span>
            <span>·</span>
            <span>{result.from_date} → {result.to_date}</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── Config sidebar ────────────────────────────────────────────────── */}
        <div className="w-64 shrink-0 border-r overflow-y-auto p-4 space-y-5" style={{ borderColor: "#2a2e39", background: "#0e1117" }}>
          {/* Strategy info box */}
          <div className="rounded-xl p-3 space-y-1.5 border" style={{ background: "rgba(245,158,11,0.04)", borderColor: "rgba(245,158,11,0.2)" }}>
            <p className="text-xs font-bold text-amber-400">Opening Range Breakout</p>
            <div className="space-y-1 text-[9px] text-[#787b86] leading-relaxed">
              {[
                "🟡 OR = first candle at 09:15 IST",
                "🟢 Volume ≥ 2× 20-bar average",
                "🔵 Enter at breakout candle close",
                "🔴 SL = candle low / high",
                "🟣 Target = 1:1 Risk Reward",
                "⚡ Trailing SL after target hit",
              ].map(r => <p key={r}>{r}</p>)}
            </div>
          </div>

          {/* Symbol */}
          <div>
            <p className="text-[9px] font-bold text-[#787b86] uppercase tracking-widest mb-1.5">Symbol</p>
            <SymbolPicker value={symbol} onSelect={setSelectedSym} />
            {selectedSym.company_name && <p className="text-[9px] text-[#787b86] mt-1 truncate">{selectedSym.company_name}</p>}
            {selectedSym.industry && <p className="text-[8px] text-[#4a4f5a] truncate">{selectedSym.industry}</p>}
          </div>

          {/* Timeframe */}
          <div>
            <p className="text-[9px] font-bold text-[#787b86] uppercase tracking-widest mb-1.5">Timeframe</p>
            <div className="grid grid-cols-2 gap-1">
              {TIMEFRAMES.map(t => (
                <button key={t.key} onClick={() => setTf(t.key)}
                  className="py-1.5 px-2 rounded-lg text-[10px] font-semibold transition-all text-left"
                  style={t.key === tf
                    ? { background: "#f59e0b", color: "#0e1117" }
                    : { background: "#1e222d", border: "1px solid #2a2e39", color: "#787b86" }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div>
            <p className="text-[9px] font-bold text-[#787b86] uppercase tracking-widest mb-1.5">Date Range</p>
            <div className="space-y-1.5">
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="w-full rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none transition-colors"
                style={{ background: "#1e222d", border: "1px solid #2a2e39" }} />
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="w-full rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none transition-colors"
                style={{ background: "#1e222d", border: "1px solid #2a2e39" }} />
            </div>
          </div>

          {/* Quantity */}
          <div>
            <p className="text-[9px] font-bold text-[#787b86] uppercase tracking-widest mb-1.5">Quantity</p>
            <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none"
              style={{ background: "#1e222d", border: "1px solid #2a2e39" }} />
          </div>

          {/* Run button */}
          <button onClick={runBacktest} disabled={running}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: running ? "#1e222d" : "#f59e0b", color: running ? "#787b86" : "#0e1117" }}>
            {running ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Running…
              </>
            ) : "▶ Run Backtest"}
          </button>

          {error && (
            <div className="rounded-xl p-3 text-[10px] text-[#ef5350]" style={{ background: "rgba(239,83,80,0.08)", border: "1px solid rgba(239,83,80,0.2)" }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Results area ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ background: "#131722" }}>
          {!result && !running && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: "rgba(245,158,11,0.1)" }}>
                <span className="text-4xl">📊</span>
              </div>
              <p className="text-slate-300 font-semibold">Ready to Backtest</p>
              <p className="text-[#787b86] text-sm max-w-xs">
                Select a symbol, timeframe, and date range from the left panel, then click Run Backtest.
              </p>
            </div>
          )}

          {running && (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="w-16 h-16 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
              <p className="text-slate-400 text-sm">Running ORB backtest for <span className="text-amber-400 font-bold">{symbol}</span>…</p>
              <p className="text-[#787b86] text-xs">{tfLabel} · {fromDate} → {toDate}</p>
            </div>
          )}

          {result && (
            <>
              {/* KPI Summary */}
              <div>
                <p className="text-[10px] font-bold text-[#787b86] uppercase tracking-widest mb-3">Summary — {result.symbol} · {tfLabel}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <KpiCard icon="📈" label="Total Trades" value={String(result.totalTrades)}
                    sub={`${result.wins}W / ${result.losses}L`} />
                  <KpiCard icon="🎯" label="Win Rate"
                    value={fmtPct(result.winRate)}
                    color={result.winRate >= 0.5 ? "green" : result.winRate >= 0.4 ? "amber" : "red"}
                    sub={`${(result.winRate * 100).toFixed(1)}% accuracy`} />
                  <KpiCard icon="💰" label="Total P&L"
                    value={(result.totalPnl >= 0 ? "+" : "") + fmtRs(result.totalPnl)}
                    color={result.totalPnl >= 0 ? "green" : "red"}
                    sub={`Qty: ${qty}`} />
                  <KpiCard icon="📉" label="Max Drawdown"
                    value={fmtRs(Math.abs(result.maxDrawdown))}
                    color="red" />
                  <KpiCard icon="⚖️" label="Avg P&L / Trade"
                    value={result.totalTrades > 0 ? (result.totalPnl / result.totalTrades >= 0 ? "+" : "") + fmtRs(result.totalPnl / result.totalTrades) : "—"}
                    color={result.totalPnl / result.totalTrades >= 0 ? "green" : "red"} />
                  {sharpe !== null && (
                    <KpiCard icon="📐" label="Sharpe Ratio"
                      value={sharpe}
                      color={parseFloat(sharpe) >= 1 ? "green" : parseFloat(sharpe) >= 0 ? "amber" : "red"}
                      sub="Annualised" />
                  )}
                </div>
              </div>

              {/* Equity Curve */}
              {result.trades.length > 0 && (
                <div className="rounded-xl overflow-hidden border" style={{ height: 280, borderColor: "#2a2e39" }}>
                  <div className="px-4 py-2 border-b flex items-center gap-2" style={{ borderColor: "#2a2e39", background: "#1e222d" }}>
                    <span className="text-[10px] font-bold text-[#787b86] uppercase tracking-widest">Equity Curve</span>
                    <span className="ml-auto text-[9px] text-[#787b86]">{result.trades.length} trades</span>
                  </div>
                  <div style={{ height: 248 }}>
                    <EquityCurveChart trades={result.trades} />
                  </div>
                </div>
              )}

              {/* Monthly + Win/Loss + Exits row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4">
                  <MonthlyPnLGrid trades={result.trades} />
                  <DailyPnLBar trades={result.trades} />
                </div>
                <div className="space-y-4">
                  <WinLossStats trades={result.trades} />
                  <ExitBreakdown trades={result.trades} />
                </div>
              </div>

              {/* Trade Log */}
              {result.trades.length > 0 && <TradeLog trades={result.trades} />}

              {result.trades.length === 0 && (
                <div className="rounded-xl p-8 text-center border" style={{ borderColor: "#2a2e39", background: "#1e222d" }}>
                  <p className="text-slate-400 font-medium mb-1">No trades in this date range</p>
                  <p className="text-[#787b86] text-xs">Try expanding the date range or selecting a more liquid symbol.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
