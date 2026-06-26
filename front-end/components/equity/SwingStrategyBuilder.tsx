"use client";
/**
 * SwingStrategyBuilder — uses nse_eq_symbols for symbol picker, stock_data_* for chart.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { istToMs } from "@/lib/highcharts";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  createChart, ColorType, CrosshairMode,
  CandlestickSeries, HistogramSeries,
  createSeriesMarkers,
  type IChartApi, type UTCTimestamp,
} from "lightweight-charts";

interface NSESymbol { symbol: string; company_name: string; industry: string; }
interface OHLCVRow { time: string; open: number; high: number; low: number; close: number; volume: number; }

const TIMEFRAMES = [
  { key: "5min",    label: "5 Min"   },
  { key: "15min",   label: "15 Min"  },
  { key: "25min",   label: "25 Min"  },
  { key: "75min",   label: "75 Min"  },
  { key: "125min",  label: "125 Min" },
  { key: "daily",   label: "Daily"   },
  { key: "weekly",  label: "Weekly"  },
  { key: "monthly", label: "Monthly" },
] as const;
type TFKey = typeof TIMEFRAMES[number]["key"];

// Shared symbol picker (same as ORBStrategyBuilder)
function SymbolPicker({ symbol, onSelect }: { symbol: string; onSelect: (s: NSESymbol) => void }) {
  const [q, setQ]       = useState("");
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
        value={open ? q : symbol}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQ(""); }}
        placeholder="Search NSE symbol…"
        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-52 overflow-y-auto">
          {loading && <p className="px-3 py-2 text-xs text-slate-500">Searching…</p>}
          {!loading && q && results.length === 0 && <p className="px-3 py-2 text-xs text-slate-600">No matches for "{q}"</p>}
          {!loading && !q && <p className="px-3 py-2 text-xs text-slate-600">Type to search 750 NSE symbols…</p>}
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

function computeSwings(rows: OHLCVRow[], lookback: number) {
  const highs: Array<{x: number; y: number}> = [];
  const lows: Array<{x: number; y: number}> = [];
  for (let i = lookback; i < rows.length - lookback; i++) {
    const h = rows[i].high;
    const l = rows[i].low;
    const isSwingHigh = rows.slice(i - lookback, i).every(r => r.high <= h)
      && rows.slice(i + 1, i + lookback + 1).every(r => r.high <= h);
    const isSwingLow  = rows.slice(i - lookback, i).every(r => r.low >= l)
      && rows.slice(i + 1, i + lookback + 1).every(r => r.low >= l);
    const ms = istToMs(rows[i].time);
    if (isSwingHigh) highs.push({ x: ms, y: h });
    if (isSwingLow)  lows.push({ x: ms, y: l });
  }
  return { highs, lows };
}

const TV = {
  bg: "#131722",
  up: "#26a69a",
  down: "#ef5350",
  upVol: "rgba(38,166,154,0.5)",
  downVol: "rgba(239,83,80,0.5)",
  grid: "#1e2030",
  border: "#2a2e39",
  text: "#d1d4dc",
  axisLabel: "#787b86",
};

function toSec(t: string): UTCTimestamp {
  return Math.floor(istToMs(t) / 1000) as UTCTimestamp;
}

function formatVol(v: number): string {
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} K`;
  return String(v);
}

function SwingChart({ candles, lookback }: { candles: OHLCVRow[]; lookback: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = ref.current;
    chart.current?.remove();
    chart.current = null;
    if (!el || candles.length === 0) return;
    const { highs, lows } = computeSwings(candles, lookback);

    const nextChart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: TV.bg },
        textColor: TV.text,
        fontFamily: "'Inter', ui-sans-serif, system-ui",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: TV.grid },
        horzLines: { color: TV.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#758696", width: 1 as const, labelBackgroundColor: "#1e222d" },
        horzLine: { color: "#758696", width: 1 as const, labelBackgroundColor: "#1e222d" },
      },
      rightPriceScale: { borderColor: TV.border },
      timeScale: {
        borderColor: TV.border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: UTCTimestamp) =>
          new Date((time as number) * 1000).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
          }),
      },
      localization: {
        timeFormatter: (time: UTCTimestamp) =>
          new Date((time as number) * 1000).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", hour12: false,
          }),
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });
    chart.current = nextChart;

    const candleSeries = nextChart.addSeries(CandlestickSeries, {
      upColor: TV.up,
      downColor: TV.down,
      borderUpColor: TV.up,
      borderDownColor: TV.down,
      wickUpColor: TV.up,
      wickDownColor: TV.down,
    });
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.28 } });
    candleSeries.setData(candles.map((r) => ({
      time: toSec(r.time),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
    })));

    const volSeries = nextChart.addSeries(HistogramSeries, {
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
    });
    nextChart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volSeries.setData(candles.map((r) => ({
      time: toSec(r.time),
      value: r.volume,
      color: r.close >= r.open ? TV.upVol : TV.downVol,
    })));

    const markers = [
      ...highs.map((p) => ({
        time: Math.floor(p.x / 1000) as UTCTimestamp,
        position: "aboveBar" as const,
        color: TV.down,
        shape: "arrowDown" as const,
        text: `SH ${p.y.toFixed(2)}`,
        size: 1,
      })),
      ...lows.map((p) => ({
        time: Math.floor(p.x / 1000) as UTCTimestamp,
        position: "belowBar" as const,
        color: TV.up,
        shape: "arrowUp" as const,
        text: `SL ${p.y.toFixed(2)}`,
        size: 1,
      })),
    ].sort((a, b) => (a.time as number) - (b.time as number));
    createSeriesMarkers(candleSeries, markers);

    el.style.position = "relative";
    const legend = document.createElement("div");
    legend.style.cssText = `position:absolute;top:8px;left:12px;z-index:10;pointer-events:none;font-family:'Inter',system-ui;font-size:12px;color:${TV.text};background:rgba(19,23,34,0.9);padding:4px 10px;border-radius:4px;border:1px solid ${TV.border};line-height:1.8;`;
    el.appendChild(legend);

    nextChart.subscribeCrosshairMove((param) => {
      if (!param.time) { legend.innerHTML = ""; return; }
      const cd = param.seriesData.get(candleSeries) as { open: number; high: number; low: number; close: number } | undefined;
      const vd = param.seriesData.get(volSeries) as { value: number } | undefined;
      if (!cd) { legend.innerHTML = ""; return; }
      const chg = cd.close - cd.open;
      const pct = cd.open ? ((chg / cd.open) * 100).toFixed(2) : "0.00";
      const col = chg >= 0 ? TV.up : TV.down;
      const ts = new Date((param.time as number) * 1000).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
      legend.innerHTML = `<span style="color:${TV.axisLabel};font-size:11px">${ts}</span>&nbsp;&nbsp;`
        + `<span style="color:${col}">O</span>&nbsp;<b>${cd.open.toFixed(2)}</b>&nbsp;`
        + `<span style="color:${col}">H</span>&nbsp;<b>${cd.high.toFixed(2)}</b>&nbsp;`
        + `<span style="color:${col}">L</span>&nbsp;<b>${cd.low.toFixed(2)}</b>&nbsp;`
        + `<span style="color:${col}">C</span>&nbsp;<b>${cd.close.toFixed(2)}</b>&nbsp;&nbsp;`
        + `<span style="color:${col};font-weight:700">${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(2)} (${pct}%)</span>`
        + (vd ? `&nbsp;&nbsp;<span style="color:${TV.axisLabel}">Vol</span>&nbsp;<b>${formatVol(vd.value)}</b>` : "");
    });

    nextChart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      nextChart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      if (el.contains(legend)) el.removeChild(legend);
      nextChart.remove();
      chart.current = null;
    };
  }, [candles, lookback]);

  return <div ref={ref} className="w-full h-full" />;
}

export default function SwingStrategyBuilder({ editId }: { editId?: string }) {
  const router = useRouter();

  const [selectedSym, setSelectedSym] = useState<NSESymbol>({ symbol: "RELIANCE", company_name: "Reliance Industries", industry: "" });
  const [tf, setTf]           = useState<TFKey>("daily");
  const [fromDate, setFromDate] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear()-1); return d.toISOString().slice(0,10); });
  const [toDate, setToDate]   = useState(() => new Date().toISOString().slice(0,10));
  const [lookback, setLookback] = useState(5);
  const [direction, setDirection] = useState<"long"|"short"|"both">("both");
  const [qty, setQty]         = useState("1");
  const [name, setName]       = useState("Swing Strategy");

  const [candles, setCandles] = useState<OHLCVRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartError, setChartError] = useState<string|null>(null);
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState<string|null>(null);

  const symbol = selectedSym.symbol;
  const tfLabel = TIMEFRAMES.find(t => t.key === tf)?.label ?? tf;

  const fetchChart = useCallback(async () => {
    setLoading(true); setChartError(null);
    try {
      const data = await api<{ candles: OHLCVRow[] }>(
        `/orb/chart-data?symbol=${encodeURIComponent(symbol)}&timeframe=${tf}&from_date=${fromDate}&to_date=${toDate}&limit=500`
      );
      setCandles(data.candles ?? []);
    } catch (e: any) { setChartError(e.message); setCandles([]); }
    finally { setLoading(false); }
  }, [symbol, tf, fromDate, toDate]);

  useEffect(() => { fetchChart(); }, [fetchChart]);

  const { highs, lows } = candles.length > 0 ? computeSwings(candles, lookback) : { highs: [], lows: [] };

  async function save() {
    setSaving(true); setSaveError(null);
    try {
      const stratJson = {
        version: 1, name, desk: "equity", symbol,
        action: direction === "short" ? "SELL" : "BUY",
        candleTime: tf === "daily" ? "EOD" : tf === "5min" ? "5min" : tf === "15min" ? "15min" : "1H",
        quantity: parseInt(qty)||1, mode:"paper", status:"draft",
        strategyType: "price_action", priceActionType: "swing",
        swingConfig: { timeframe: tf, timeframeLabel: tfLabel, lookback, direction },
        entry: { logic:"AND", conditions:[{ type:"swing_breakout", direction }] },
        exit: { logic:"OR", conditions:[{ type:"stop_loss",value:0 },{ type:"target",value:0 }] },
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

  return (
    <div className="fixed flex flex-col bg-slate-950" style={{ top:60, left:240, right:0, bottom:0, zIndex:5 }}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">Price Action</span>
          <span className="text-xs font-bold text-slate-400 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">Swing H/L</span>
          <input value={name} onChange={e => setName(e.target.value)}
            className="bg-transparent text-sm font-semibold text-slate-100 focus:outline-none border-b border-transparent focus:border-emerald-500 min-w-[160px]"/>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/equity/strategies")}
            className="px-3 py-1.5 border border-slate-800 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors">
            ← Strategies
          </button>
          {saveError && <span className="text-xs text-rose-400">{saveError}</span>}
          <button onClick={save} disabled={saving}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors">
            {saving ? "Saving…" : editId ? "Update" : "Save Strategy"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Config panel */}
        <div className="w-64 shrink-0 border-r border-slate-800 overflow-y-auto p-4 space-y-4 bg-slate-950">
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-1">
            <p className="text-xs font-bold text-amber-400">Swing High / Low</p>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Detects swing highs/lows with a configurable lookback. Enter on breakout above/below.
            </p>
          </div>

          {/* Symbol — NSE EQ (750 stocks) */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Symbol <span className="text-slate-700 font-normal normal-case">(NSE · 750)</span></p>
            <SymbolPicker symbol={symbol} onSelect={setSelectedSym} />
            {selectedSym.company_name && <p className="text-[10px] text-slate-600 mt-1 truncate">{selectedSym.company_name}</p>}
            {selectedSym.industry && <p className="text-[9px] text-slate-700 truncate">{selectedSym.industry}</p>}
          </div>

          {/* Timeframe — all stock_data_* tables */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Timeframe</p>
            <div className="grid grid-cols-2 gap-1">
              {TIMEFRAMES.map(t => (
                <button key={t.key} onClick={() => setTf(t.key)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${t.key === tf ? "bg-amber-500 text-slate-900" : "bg-slate-900 border border-slate-800 text-slate-500 hover:border-slate-600"}`}>
                  {t.label}
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

          {/* Lookback */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              Swing Lookback <span className="text-emerald-400 font-mono ml-1">{lookback}</span>
            </p>
            <input type="range" min="2" max="20" value={lookback} onChange={e => setLookback(Number(e.target.value))}
              className="w-full accent-amber-500"/>
            <div className="flex justify-between text-[9px] text-slate-700 mt-0.5"><span>2 candles</span><span>20</span></div>
          </div>

          {/* Direction */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Direction</p>
            <div className="grid grid-cols-3 gap-1">
              {(["long","short","both"] as const).map(d => (
                <button key={d} onClick={() => setDirection(d)}
                  className={`py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${d === direction ? "bg-amber-500 text-slate-900" : "bg-slate-900 border border-slate-800 text-slate-500 hover:border-slate-600"}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Qty */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Quantity</p>
            <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"/>
          </div>

          {/* Swing stats */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1 text-[10px]">
            <p className="text-slate-500 uppercase tracking-widest font-bold text-[9px]">Detected (lookback={lookback})</p>
            <p><span className="text-rose-400 font-mono font-bold">{highs.length}</span> <span className="text-slate-500">swing highs ▼</span></p>
            <p><span className="text-emerald-400 font-mono font-bold">{lows.length}</span> <span className="text-slate-500">swing lows ▲</span></p>
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 relative min-h-0 flex flex-col">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 shrink-0">
            <span className="text-[10px] font-mono text-slate-500">{symbol} · {tfLabel}</span>
            {candles.length > 0 && <span className="text-[10px] text-slate-700">{candles.length} candles</span>}
          </div>
          <div className="flex-1 relative min-h-0">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-950/80">
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Loading {symbol} · {tfLabel}…
                </div>
              </div>
            )}
            {!loading && chartError ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-2 px-8">
                  <p className="text-slate-400 font-medium">No data found</p>
                  <p className="text-slate-600 text-sm">{symbol} · {tfLabel}</p>
                  <p className="text-[10px] text-slate-700">{chartError}</p>
                </div>
              </div>
            ) : (
              <SwingChart candles={candles} lookback={lookback} key={`${symbol}-${tf}-${lookback}`} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
