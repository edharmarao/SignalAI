"use client";
/**
 * ORBStrategyBuilder
 * Chart powered by TradingView Lightweight Charts v5.
 * Symbols from nse_eq_symbols (DB), data from stock_data_<timeframe>.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { istToMs } from "@/lib/highcharts";
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, HistogramSeries, LineSeries,
  createSeriesMarkers,
  type IChartApi, type UTCTimestamp,
} from "lightweight-charts";

// ── Types ──────────────────────────────────────────────────────────────────────
interface NSESymbol { symbol: string; company_name: string; industry: string; }
interface OHLCVRow { time: string; open: number; high: number; low: number; close: number; volume: number; }
interface ORBTrade { date: string; side: string; entryTime: string; entryPrice: number; stopLoss: number; target: number; risk: number; exitTime: string; exitPrice: number; pnl: number; exitReason: string; trailingActive: boolean; }
interface BacktestResult { symbol: string; timeframe: string; totalTrades: number; wins: number; losses: number; winRate: number; totalPnl: number; maxDrawdown: number; trades: ORBTrade[]; }

// All available timeframes matching real stock_data_* tables
const TIMEFRAMES = [
  { key: "5min",   label: "5 Min",   table: "stock_data_5min"   },
  { key: "15min",  label: "15 Min",  table: "stock_data_15min"  },
  { key: "25min",  label: "25 Min",  table: "stock_data_25min"  },
  { key: "75min",  label: "75 Min",  table: "stock_data_75min"  },
  { key: "125min", label: "125 Min", table: "stock_data_125min" },
  { key: "daily",  label: "Daily",   table: "stock_data_daily"  },
  { key: "weekly", label: "Weekly",  table: "stock_data_weekly" },
  { key: "monthly",label: "Monthly", table: "stock_data_monthly"},
] as const;

type TFKey = typeof TIMEFRAMES[number]["key"];

function defaultDates(tf: TFKey) {
  const to = new Date();
  const from = new Date();
  if (tf === "daily" || tf === "weekly" || tf === "monthly") from.setFullYear(from.getFullYear() - 1);
  else from.setMonth(from.getMonth() - 3);
  return { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10) };
}

// ── Symbol search dropdown ─────────────────────────────────────────────────────
function SymbolPicker({ symbol, onSelect }: { symbol: string; onSelect: (s: NSESymbol) => void }) {
  const [q, setQ]           = useState("");
  const [open, setOpen]     = useState(false);
  const [results, setResults] = useState<NSESymbol[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Search DB symbols
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
        value={open ? q : symbol}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQ(""); }}
        placeholder="Search NSE symbol…"
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-52 overflow-y-auto">
          {loading && <p className="px-3 py-2 text-xs text-slate-500">Searching…</p>}
          {!loading && q && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-600">No matches for "{q}"</p>
          )}
          {!loading && !q && (
            <p className="px-3 py-2 text-xs text-slate-600">Type to search 750 NSE symbols…</p>
          )}
          {results.map(s => (
            <button key={s.symbol} onClick={() => { onSelect(s); setOpen(false); setQ(""); }}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-700 text-left transition-colors">
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

// ── TradingView Lightweight Chart ─────────────────────────────────────────────
function toSec(t: string): UTCTimestamp {
  return Math.floor(istToMs(t) / 1000) as UTCTimestamp;
}
function formatVol(v: number): string {
  if (v >= 1e7) return `${(v/1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `${(v/1e5).toFixed(2)} L`;
  if (v >= 1e3) return `${(v/1e3).toFixed(1)} K`;
  return String(v);
}

// Build per-day OR High / OR Low as LineSeries segments (no cross-day bleed)
// Uses whitespace entries between days so lines only span within each trading day.
function buildOrLines(
  candles: OHLCVRow[],
  orCandles: number,
): {
  orh: ({ time: UTCTimestamp; value: number } | { time: UTCTimestamp })[];
  orl: ({ time: UTCTimestamp; value: number } | { time: UTCTimestamp })[];
  dayMap: Map<string, { orHigh: number; orLow: number }>;
} {
  // Group candles by calendar day
  const days = new Map<string, OHLCVRow[]>();
  for (const r of candles) {
    const day = r.time.slice(0, 10);
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(r);
  }

  const dayMap = new Map<string, { orHigh: number; orLow: number }>();
  const orh: ({ time: UTCTimestamp; value: number } | { time: UTCTimestamp })[] = [];
  const orl: ({ time: UTCTimestamp; value: number } | { time: UTCTimestamp })[] = [];

  for (const [day, rows] of days) {
    const sorted = [...rows].sort((a, b) => a.time.localeCompare(b.time));
    const orSlice = sorted.slice(0, orCandles);
    if (orSlice.length === 0) continue;

    const orHigh = Math.max(...orSlice.map(r => r.high));
    const orLow  = Math.min(...orSlice.map(r => r.low));
    dayMap.set(day, { orHigh, orLow });

    const firstSec = toSec(sorted[0].time);
    const lastSec  = toSec(sorted[sorted.length - 1].time);
    // gap: 1 second after last candle → whitespace entry breaks line between days
    const gapSec   = (lastSec as number + 1) as UTCTimestamp;

    orh.push({ time: firstSec, value: orHigh });
    orh.push({ time: lastSec,  value: orHigh });
    orh.push({ time: gapSec });               // whitespace gap — no line between days

    orl.push({ time: firstSec, value: orLow  });
    orl.push({ time: lastSec,  value: orLow  });
    orl.push({ time: gapSec });
  }

  return { orh, orl, dayMap };
}

function ORBChart({ candles, trades, orCandles = 1 }: {
  candles: OHLCVRow[];
  trades?: ORBTrade[];
  orCandles?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    chartRef.current?.remove();
    chartRef.current = null;
    if (candles.length === 0) return;

    const chart = createChart(el, {
      width:  el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor:  "#d1d4dc",
        fontFamily: "'Inter', ui-sans-serif, system-ui",
        fontSize:   12,
      },
      grid: {
        vertLines: { color: "#1e2030" },
        horzLines: { color: "#1e2030" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#758696", width: 1, labelBackgroundColor: "#1e222d" },
        horzLine: { color: "#758696", width: 1, labelBackgroundColor: "#1e222d" },
      },
      rightPriceScale: { borderColor: "#2a2e39" },
      leftPriceScale:  { visible: false },
      timeScale: {
        borderColor:    "#2a2e39",
        timeVisible:    true,
        secondsVisible: false,
        tickMarkFormatter: (time: UTCTimestamp) => {
          const d = new Date((time as number) * 1000);
          return d.toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
          });
        },
      },
      localization: {
        timeFormatter: (time: UTCTimestamp) => {
          const d = new Date((time as number) * 1000);
          return d.toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", hour12: false,
          });
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale:  { mouseWheel: true, pinch: true },
    });
    chartRef.current = chart;

    // ── Candlestick ─────────────────────────────────────────────────────────
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a", downColor: "#ef5350",
      borderUpColor: "#26a69a", borderDownColor: "#ef5350",
      wickUpColor: "#26a69a", wickDownColor: "#ef5350",
      priceScaleId: "right",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.28 } });
    candleSeries.setData(candles.map(r => ({
      time: toSec(r.time), open: r.open, high: r.high, low: r.low, close: r.close,
    })));

    // ── Volume histogram ────────────────────────────────────────────────────
    const volSeries = chart.addSeries(HistogramSeries, {
      color: "#26a69a", priceFormat: { type: "volume" }, priceScaleId: "vol",
      lastValueVisible: false, priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volSeries.setData(candles.map(r => ({
      time: toSec(r.time), value: r.volume,
      color: r.close >= r.open ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)",
    })));

    // ── Per-day ORH / ORL line segments ─────────────────────────────────────
    // Using whitespace-gapped LineSeries so lines only appear within each day.
    const { orh, orl, dayMap } = buildOrLines(candles, orCandles);

    const orhSeries = chart.addSeries(LineSeries, {
      color: "rgba(38,166,154,0.8)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceScaleId: "right",
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    orhSeries.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.28 } });
    orhSeries.setData(orh as any);

    const orlSeries = chart.addSeries(LineSeries, {
      color: "rgba(239,83,80,0.8)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceScaleId: "right",
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    orlSeries.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.28 } });
    orlSeries.setData(orl as any);

    // ── Trade markers ────────────────────────────────────────────────────────
    if (trades?.length) {
      const markers = [
        ...trades.filter(t => t.entryTime).map(t => ({
          time: toSec(t.entryTime), position: "belowBar" as const, color: "#26a69a",
          shape: "arrowUp" as const, size: 1,
          text: `${t.side === "BUY" ? "▲ B" : "▼ S"} ${t.entryPrice.toFixed(2)}`,
        })),
        ...trades.filter(t => t.exitTime).map(t => ({
          time: toSec(t.exitTime), position: "aboveBar" as const,
          color: t.exitReason === "stop_loss" ? "#ef5350" : t.exitReason === "target" ? "#3b82f6" : "#f59e0b",
          shape: "arrowDown" as const, size: 1,
          text: `${t.exitReason === "stop_loss" ? "SL" : t.exitReason === "target" ? "TP" : "TR"} ${t.exitPrice.toFixed(2)}`,
        })),
      ].sort((a, b) => (a.time as number) - (b.time as number));
      createSeriesMarkers(candleSeries, markers);
    }

    // ── Floating OHLCV + OR legend ───────────────────────────────────────────
    el.style.position = "relative";
    const legend = document.createElement("div");
    legend.style.cssText = "position:absolute;top:8px;left:12px;z-index:10;pointer-events:none;font-family:'Inter',system-ui;font-size:12px;color:#d1d4dc;background:rgba(19,23,34,0.9);padding:4px 10px;border-radius:4px;border:1px solid #2a2e39;line-height:1.8;";
    el.appendChild(legend);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) { legend.innerHTML = ""; return; }
      const cd = param.seriesData.get(candleSeries) as any;
      const vd = param.seriesData.get(volSeries) as any;
      if (!cd) { legend.innerHTML = ""; return; }
      const { open: o, high: h, low: l, close: c } = cd;
      const chg = c - o;
      const pct = ((chg / o) * 100).toFixed(2);
      const col = chg >= 0 ? "#26a69a" : "#ef5350";
      const ts = new Date((param.time as number) * 1000).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
      // Find OR values for this candle's day
      const day = new Date((param.time as number) * 1000)
        .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
      const or = dayMap.get(day);
      legend.innerHTML =
        `<span style="color:#787b86;font-size:11px">${ts}</span>&nbsp;&nbsp;`
        + `<span style="color:${col}">O</span>&nbsp;<b>${o.toFixed(2)}</b>&nbsp;`
        + `<span style="color:${col}">H</span>&nbsp;<b>${h.toFixed(2)}</b>&nbsp;`
        + `<span style="color:${col}">L</span>&nbsp;<b>${l.toFixed(2)}</b>&nbsp;`
        + `<span style="color:${col}">C</span>&nbsp;<b>${c.toFixed(2)}</b>&nbsp;&nbsp;`
        + `<span style="color:${col};font-weight:700">${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(2)} (${pct}%)</span>`
        + (vd ? `&nbsp;&nbsp;<span style="color:#787b86">Vol</span>&nbsp;<b>${formatVol(vd.value)}</b>` : "")
        + (or
          ? `&nbsp;&nbsp;<span style="color:#26a69a;font-size:10px">ORH&nbsp;<b>${or.orHigh.toFixed(2)}</b></span>`
            + `&nbsp;<span style="color:#ef5350;font-size:10px">ORL&nbsp;<b>${or.orLow.toFixed(2)}</b></span>`
          : "");
    });

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (el) chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      if (el.contains(legend)) el.removeChild(legend);
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, trades, orCandles]);

  return <div ref={containerRef} className="w-full h-full" />;
}



function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-lg font-bold text-slate-100">{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function ORBStrategyBuilder({ editId }: { editId?: string }) {
  const router = useRouter();

  // ── Basic params ─────────────────────────────────────────────────────────────
  const [selectedSym, setSelectedSym] = useState<NSESymbol>({ symbol: "RELIANCE", company_name: "Reliance Industries", industry: "" });
  const [tf, setTf]         = useState<TFKey>("5min");
  const [fromDate, setFromDate] = useState(() => defaultDates("5min").from);
  const [toDate, setToDate]   = useState(() => defaultDates("5min").to);
  const [qty, setQty]         = useState("1");
  const [name, setName]       = useState("ORB Strategy");

  // ── Configurable strategy params ──────────────────────────────────────────────
  const [orCandles, setOrCandles]           = useState(1);           // # candles forming OR
  const [marketOpen, setMarketOpen]         = useState("09:15");     // IST HH:MM
  const [volMultiplier, setVolMultiplier]   = useState(2.0);         // volume filter ×
  const [volLookback, setVolLookback]       = useState(20);          // vol avg periods
  const [direction, setDirection]           = useState<"both"|"long"|"short">("both");
  const [riskReward, setRiskReward]         = useState(1.0);         // target = entry ± risk × RR
  const [trailingSl, setTrailingSl]         = useState(true);        // trailing SL enabled
  const [trailFactor, setTrailFactor]       = useState(1.0);         // trail at n× risk
  const [eodExit, setEodExit]               = useState(true);        // exit at EOD

  const [candles, setCandles]     = useState<OHLCVRow[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartError, setChartError]     = useState<string|null>(null);

  const [btResult, setBtResult]   = useState<BacktestResult|null>(null);
  const [btRunning, setBtRunning] = useState(false);
  const [btError, setBtError]     = useState<string|null>(null);
  const [activePane, setActivePane] = useState<"chart"|"backtest">("chart");

  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string|null>(null);

  const symbol = selectedSym.symbol;

  // Update dates when timeframe changes
  useEffect(() => {
    const d = defaultDates(tf);
    setFromDate(d.from);
    setToDate(d.to);
  }, [tf]);

  // Fetch chart data from stock_data_<tf>
  const fetchChart = useCallback(async () => {
    setLoadingChart(true); setChartError(null); setCandles([]);
    try {
      const data = await api<{ candles: OHLCVRow[] }>(
        `/orb/chart-data?symbol=${encodeURIComponent(symbol)}&timeframe=${tf}&from_date=${fromDate}&to_date=${toDate}&limit=500`
      );
      const rows = data.candles ?? [];
      if (rows.length === 0) {
        setChartError(`No data in stock_data_${tf} for ${symbol} in this date range.`);
      } else {
        setCandles(rows);
      }
    } catch (e: any) {
      setChartError(e.message); setCandles([]);
    } finally { setLoadingChart(false); }
  }, [symbol, tf, fromDate, toDate]);

  useEffect(() => { fetchChart(); }, [fetchChart]);

  async function runBacktest() {
    setBtRunning(true); setBtError(null); setBtResult(null);
    try {
      const res = await api<BacktestResult>("/orb/backtest", {
        method: "POST",
        body: JSON.stringify({
          symbol, timeframe: tf, from_date: fromDate, to_date: toDate,
          qty: parseInt(qty) || 1,
          or_candles: orCandles,
          market_open: marketOpen,
          volume_multiplier: volMultiplier,
          volume_lookback: volLookback,
          direction,
          risk_reward: riskReward,
          trailing_sl: trailingSl,
          trail_factor: trailFactor,
          eod_exit: eodExit,
        }),
      });
      setBtResult(res); setActivePane("backtest");
    } catch (e: any) { setBtError(e.message); }
    finally { setBtRunning(false); }
  }

  async function save() {
    setSaving(true); setSaveError(null);
    try {
      const tfLabel = TIMEFRAMES.find(t => t.key === tf)?.label ?? tf;
      const orbConfig = {
        timeframe: tf, timeframeLabel: tfLabel, from_date: fromDate, to_date: toDate,
        or_candles: orCandles, market_open: marketOpen,
        volume_multiplier: volMultiplier, volume_lookback: volLookback,
        direction, risk_reward: riskReward,
        trailing_sl: trailingSl, trail_factor: trailFactor, eod_exit: eodExit,
      };
      const stratJson = {
        version: 1, name, desk: "equity", symbol,
        action: direction === "short" ? "SELL" : "BUY",
        candleTime: tf === "daily" ? "EOD" : tf === "5min" ? "5min" : tf === "15min" ? "15min" : "1H",
        quantity: parseInt(qty)||1, mode:"paper", status:"draft",
        strategyType:"price_action", priceActionType:"orb",
        orbConfig,
        entry: { logic:"AND", conditions:[{ type:"orb_breakout", direction }] },
        exit: { logic:"OR", conditions:[
          { type:"stop_loss" },
          { type:"target", value: riskReward },
          ...(trailingSl ? [{ type:"trailing_stop_loss", value: trailFactor }] : []),
        ]},
        risk: { maxLossPerDay:5000, maxTradesPerDay:3, maxOpenPositions:1 },
      };
      if (editId) {
        await api(`/strategies/${editId}`, { method:"PATCH", body:JSON.stringify({ name, strategy_json: stratJson }) });
        router.push(`/equity/strategies/${editId}`);
      } else {
        const created = await api<{ id: string }>("/strategies", {
          method:"POST", body:JSON.stringify({ name, strategy_json: stratJson, mode:"paper", status:"draft" }),
        });
        router.push(`/equity/strategies/${created.id}`);
      }
    } catch (e: any) { setSaveError(e.message); }
    finally { setSaving(false); }
  }

  const chartTrades = activePane === "backtest" && btResult ? btResult.trades : undefined;
  const tfLabel = TIMEFRAMES.find(t => t.key === tf)?.label ?? tf;

  return (
    <div className="fixed flex flex-col bg-slate-950" style={{ top:60, left:240, right:0, bottom:0, zIndex:5 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">Price Action</span>
          <span className="text-xs font-bold text-slate-400 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">ORB</span>
          <input value={name} onChange={e => setName(e.target.value)}
            className="bg-transparent text-sm font-semibold text-slate-100 focus:outline-none border-b border-transparent focus:border-emerald-500 min-w-[160px]"/>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/equity/strategies")}
            className="px-3 py-1.5 border border-slate-800 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors">
            ← Strategies
          </button>
          {saveError && <span className="text-xs text-rose-400 max-w-[160px] truncate">{saveError}</span>}
          <button onClick={save} disabled={saving}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
            {saving ? "Saving…" : editId ? "Update" : "Save Strategy"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left config panel */}
        <div className="w-72 shrink-0 border-r border-slate-800 overflow-y-auto p-4 space-y-4 bg-slate-950">

          {/* Symbol */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Symbol <span className="text-slate-700 font-normal normal-case">(NSE · 750 stocks)</span></p>
            <SymbolPicker symbol={symbol} onSelect={setSelectedSym} />
            {selectedSym.company_name && <p className="text-[10px] text-slate-600 mt-1 truncate">{selectedSym.company_name}</p>}
            {selectedSym.industry && <p className="text-[9px] text-slate-700 truncate">{selectedSym.industry}</p>}
          </div>

          {/* Timeframe */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Timeframe</p>
            <div className="grid grid-cols-2 gap-1">
              {TIMEFRAMES.map(t => (
                <button key={t.key} onClick={() => setTf(t.key)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all text-left flex items-center justify-between ${t.key === tf
                    ? "bg-amber-500 text-slate-900"
                    : "bg-slate-900 border border-slate-800 text-slate-500 hover:border-slate-600"}`}>
                  <span>{t.label}</span>
                  <span className="text-[8px] font-mono text-slate-700">{t.table.replace("stock_data_","")}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Date Range</p>
            <div className="space-y-1.5">
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"/>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"/>
            </div>
          </div>

          {/* ── Entry Config ─────────────────────────────────────────────────── */}
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-900/60 px-3 py-2 border-b border-slate-800">
              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Entry Rules</p>
            </div>
            <div className="p-3 space-y-3">

              {/* OR Candles */}
              <div>
                <div className="flex justify-between mb-1">
                  <p className="text-[10px] text-slate-500">Opening Range Candles</p>
                  <span className="text-[10px] font-mono font-bold text-amber-400">{orCandles}</span>
                </div>
                <input type="range" min={1} max={6} step={1} value={orCandles}
                  onChange={e => setOrCandles(Number(e.target.value))}
                  className="w-full accent-amber-500 h-1"/>
                <div className="flex justify-between text-[9px] text-slate-700 mt-0.5"><span>1 candle</span><span>6 candles</span></div>
                <p className="text-[9px] text-slate-600 mt-1">OR = high/low of first {orCandles} candle{orCandles>1?"s":""} after {marketOpen}</p>
              </div>

              {/* Market open time */}
              <div>
                <p className="text-[10px] text-slate-500 mb-1">Market Open Time (IST)</p>
                <input type="time" value={marketOpen} onChange={e => setMarketOpen(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"/>
              </div>

              {/* Volume multiplier */}
              <div>
                <div className="flex justify-between mb-1">
                  <p className="text-[10px] text-slate-500">Volume Filter (×avg)</p>
                  <span className="text-[10px] font-mono font-bold text-amber-400">{volMultiplier.toFixed(1)}×</span>
                </div>
                <input type="range" min={0.5} max={5} step={0.5} value={volMultiplier}
                  onChange={e => setVolMultiplier(Number(e.target.value))}
                  className="w-full accent-amber-500 h-1"/>
                <div className="flex justify-between text-[9px] text-slate-700 mt-0.5"><span>0.5×</span><span>5×</span></div>
              </div>

              {/* Volume lookback */}
              <div>
                <div className="flex justify-between mb-1">
                  <p className="text-[10px] text-slate-500">Volume Avg Lookback</p>
                  <span className="text-[10px] font-mono font-bold text-amber-400">{volLookback} candles</span>
                </div>
                <input type="range" min={5} max={50} step={5} value={volLookback}
                  onChange={e => setVolLookback(Number(e.target.value))}
                  className="w-full accent-amber-500 h-1"/>
                <div className="flex justify-between text-[9px] text-slate-700 mt-0.5"><span>5</span><span>50</span></div>
              </div>

              {/* Direction */}
              <div>
                <p className="text-[10px] text-slate-500 mb-1.5">Trade Direction</p>
                <div className="grid grid-cols-3 gap-1">
                  {(["long","short","both"] as const).map(d => (
                    <button key={d} onClick={() => setDirection(d)}
                      className={`py-1.5 rounded-lg text-[10px] font-bold capitalize transition-all ${d === direction
                        ? d === "long" ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-400"
                          : d === "short" ? "bg-rose-500/20 border border-rose-500/50 text-rose-400"
                          : "bg-amber-500/20 border border-amber-500/50 text-amber-400"
                        : "bg-slate-900 border border-slate-800 text-slate-500 hover:border-slate-600"}`}>
                      {d === "long" ? "▲ Long" : d === "short" ? "▼ Short" : "⇅ Both"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Exit Config ───────────────────────────────────────────────────── */}
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-900/60 px-3 py-2 border-b border-slate-800">
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Exit Rules</p>
            </div>
            <div className="p-3 space-y-3">

              {/* Risk:Reward */}
              <div>
                <div className="flex justify-between mb-1">
                  <p className="text-[10px] text-slate-500">Risk : Reward Ratio</p>
                  <span className="text-[10px] font-mono font-bold text-blue-400">1 : {riskReward.toFixed(1)}</span>
                </div>
                <input type="range" min={0.5} max={5} step={0.5} value={riskReward}
                  onChange={e => setRiskReward(Number(e.target.value))}
                  className="w-full accent-blue-500 h-1"/>
                <div className="flex justify-between text-[9px] text-slate-700 mt-0.5"><span>1:0.5</span><span>1:5</span></div>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {[0.5,1,1.5,2,3].map(v => (
                    <button key={v} onClick={() => setRiskReward(v)}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${riskReward===v?"bg-blue-500/20 text-blue-400 border border-blue-500/40":"bg-slate-900 border border-slate-800 text-slate-600 hover:text-slate-400"}`}>
                      1:{v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trailing SL toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-400 font-medium">Trailing Stop-Loss</p>
                  <p className="text-[9px] text-slate-600">Activates after target is hit</p>
                </div>
                <button onClick={() => setTrailingSl(s => !s)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${trailingSl ? "bg-emerald-500" : "bg-slate-700"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${trailingSl ? "left-[22px]" : "left-0.5"}`}/>
                </button>
              </div>

              {/* Trail factor (only if trailing enabled) */}
              {trailingSl && (
                <div>
                  <div className="flex justify-between mb-1">
                    <p className="text-[10px] text-slate-500">Trail Factor (× Risk)</p>
                    <span className="text-[10px] font-mono font-bold text-emerald-400">{trailFactor.toFixed(1)}×</span>
                  </div>
                  <input type="range" min={0.5} max={3} step={0.5} value={trailFactor}
                    onChange={e => setTrailFactor(Number(e.target.value))}
                    className="w-full accent-emerald-500 h-1"/>
                  <div className="flex justify-between text-[9px] text-slate-700 mt-0.5"><span>0.5×</span><span>3×</span></div>
                </div>
              )}

              {/* EOD exit */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-400 font-medium">Force Exit at EOD</p>
                  <p className="text-[9px] text-slate-600">Close all positions at day end</p>
                </div>
                <button onClick={() => setEodExit(s => !s)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${eodExit ? "bg-emerald-500" : "bg-slate-700"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${eodExit ? "left-[22px]" : "left-0.5"}`}/>
                </button>
              </div>
            </div>
          </div>

          {/* ── Position Sizing ─────────────────────────────────────────────── */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Quantity</p>
            <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"/>
          </div>

          {/* Live config summary */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 space-y-1.5 text-[9px] text-slate-600">
            <p className="font-bold text-slate-500 text-[9px] uppercase tracking-widest mb-2">Active Config</p>
            <p>📐 OR = <span className="text-slate-400">{orCandles} candle{orCandles>1?"s":""} from {marketOpen}</span></p>
            <p>📊 Volume = <span className="text-slate-400">{volMultiplier}× avg of {volLookback} bars</span></p>
            <p>↕️ Direction = <span className="text-slate-400 capitalize">{direction}</span></p>
            <p>🎯 R:R = <span className="text-slate-400">1 : {riskReward}</span></p>
            <p>⚡ Trailing = <span className={trailingSl ? "text-emerald-500" : "text-slate-600"}>{trailingSl ? `Yes (${trailFactor}× risk)` : "Off"}</span></p>
            <p>🔚 EOD exit = <span className={eodExit ? "text-emerald-500" : "text-slate-600"}>{eodExit ? "Yes" : "No"}</span></p>
          </div>

          {/* Run backtest */}
          <button onClick={runBacktest} disabled={btRunning || loadingChart}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 text-xs font-bold rounded-xl transition-colors">
            {btRunning ? "Running…" : "▶ Run Backtest"}
          </button>
          {btError && <p className="text-[10px] text-rose-400">{btError}</p>}
        </div>

        {/* Right: chart + backtest */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Pane switcher */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-800 bg-slate-950 shrink-0">
            {(["chart","backtest"] as const).map(p => (
              <button key={p} onClick={() => setActivePane(p)}
                disabled={p === "backtest" && !btResult}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all capitalize disabled:opacity-40 ${activePane===p?"bg-slate-800 text-amber-300":"text-slate-600 hover:text-slate-400"}`}>
                {p} {p === "backtest" && btResult ? `(${btResult.totalTrades})` : ""}
              </button>
            ))}
            <span className="ml-auto text-[10px] font-mono text-slate-600">{symbol} · {tfLabel}</span>
            {candles.length > 0 && <span className="text-[10px] text-slate-700 ml-2">{candles.length} candles</span>}
          </div>

          {/* Chart area */}
          <div className="relative flex-1 min-h-0" style={{ minHeight: 320 }}>
            {loadingChart && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-950/80">
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Loading {symbol} · {tfLabel} from stock_data_{tf}…
                </div>
              </div>
            )}
            {!loadingChart && chartError ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-2 px-8">
                  <p className="text-slate-400 font-medium">No data found</p>
                  <p className="text-slate-600 text-sm">{symbol} · {tfLabel}</p>
                  <p className="text-[10px] text-slate-700">{chartError}</p>
                  <p className="text-[10px] text-slate-700">Try importing data via Upstox Historical Data Import.</p>
                  <button onClick={fetchChart} className="mt-2 px-3 py-1.5 text-xs border border-slate-700 rounded-lg text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-colors">
                    Retry
                  </button>
                </div>
              </div>
            ) : candles.length > 0 ? (
              <ORBChart candles={candles} trades={chartTrades} orCandles={orCandles} key={`${symbol}-${tf}-${activePane}-${orCandles}`} />
            ) : !loadingChart ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-slate-600 text-sm">Select a symbol to load chart data</p>
              </div>
            ) : null}
          </div>

          {/* Backtest stats */}
          {activePane === "backtest" && btResult && (
            <div className="shrink-0 border-t border-slate-800 bg-slate-950 p-4 space-y-3">
              <div className="grid grid-cols-5 gap-2">
                <Stat label="Trades"     value={String(btResult.totalTrades)} />
                <Stat label="Win Rate"   value={`${(btResult.winRate*100).toFixed(1)}%`} sub={`${btResult.wins}W / ${btResult.losses}L`} />
                <Stat label="Total P&L"  value={`₹${btResult.totalPnl.toFixed(2)}`} />
                <Stat label="Max DD"     value={`₹${btResult.maxDrawdown.toFixed(2)}`} />
                <Stat label="Avg P&L"    value={btResult.totalTrades > 0 ? `₹${(btResult.totalPnl/btResult.totalTrades).toFixed(2)}` : "—"} />
              </div>
              {btResult.trades.length > 0 && (
                <div className="overflow-x-auto max-h-40 overflow-y-auto">
                  <table className="w-full text-[10px] text-slate-400">
                    <thead>
                      <tr className="text-slate-600 uppercase tracking-widest border-b border-slate-800">
                        {["Date","Side","Entry","Exit","SL","Target","P&L","Reason"].map(h=>(
                          <th key={h} className="pb-1 pr-3 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {btResult.trades.map((t,i) => (
                        <tr key={i} className={`border-b border-slate-800/40 ${t.pnl>0?"text-emerald-400/80":"text-rose-400/80"}`}>
                          <td className="py-1 pr-3">{t.date}</td>
                          <td className="py-1 pr-3">{t.side}</td>
                          <td className="py-1 pr-3 font-mono">{t.entryPrice.toFixed(2)}</td>
                          <td className="py-1 pr-3 font-mono">{t.exitPrice.toFixed(2)}</td>
                          <td className="py-1 pr-3 font-mono text-rose-400/70">{t.stopLoss.toFixed(2)}</td>
                          <td className="py-1 pr-3 font-mono text-blue-400/70">{t.target.toFixed(2)}</td>
                          <td className="py-1 pr-3 font-mono font-bold">{t.pnl>0?"+":""}{t.pnl.toFixed(2)}</td>
                          <td className="py-1 text-slate-500">{t.exitReason}{t.trailingActive?" 🔄":""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
