"use client";
/**
 * ORBStrategyBuilder
 * Symbols loaded from nse_eq_symbols (DB). Chart data from stock_data_<timeframe>.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import Highcharts from "highcharts/highstock";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

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

// ── Chart ──────────────────────────────────────────────────────────────────────
function ORBChart({ candles, trades }: { candles: OHLCVRow[]; trades?: ORBTrade[] }) {
  const ref  = useRef<HTMLDivElement>(null);
  const chart = useRef<Highcharts.StockChart | null>(null);

  useEffect(() => {
    chart.current?.destroy(); chart.current = null;
    if (!ref.current || candles.length === 0) return;
    const toMs = (t: string) => new Date(t).getTime();

    const series: Highcharts.SeriesOptionsType[] = [
      {
        type: "candlestick", id: "candle", name: "Price",
        data: candles.map(r => [toMs(r.time), r.open, r.high, r.low, r.close]),
        color: "#f43f5e", upColor: "#10b981", lineColor: "#f43f5e", upLineColor: "#10b981",
        dataGrouping: { enabled: false },
      } as Highcharts.SeriesCandlestickOptions,
      {
        type: "column", name: "Volume", id: "volume", yAxis: 1,
        data: candles.map(r => [toMs(r.time), r.volume]),
        color: "#334155", dataGrouping: { enabled: false },
      } as Highcharts.SeriesColumnOptions,
    ];

    if (trades?.length) {
      series.push({
        type: "flags", name: "Entries", onSeries: "candle", shape: "arrowUp", yAxis: 0,
        color: "#10b981", fillColor: "#10b981", style: { color: "#fff", fontSize: "9px" },
        data: trades.map(t => ({ x: toMs(t.entryTime), title: t.side === "BUY" ? "B" : "S" })),
        dataGrouping: { enabled: false },
      } as any);
      series.push({
        type: "flags", name: "Exits", onSeries: "candle", shape: "arrowDown", yAxis: 0,
        data: trades.map(t => ({
          x: toMs(t.exitTime), title: t.exitReason.slice(0,3).toUpperCase(),
          color: t.exitReason === "stop_loss" ? "#f43f5e" : t.exitReason === "target" ? "#3b82f6" : "#f97316",
          fillColor: t.exitReason === "stop_loss" ? "#f43f5e" : t.exitReason === "target" ? "#3b82f6" : "#f97316",
        })),
        style: { color: "#fff", fontSize: "9px" }, dataGrouping: { enabled: false },
      } as any);
    }

    chart.current = Highcharts.stockChart(ref.current, {
      accessibility: { enabled: false },
      chart: { backgroundColor: "#020617", margin: [0,60,30,0], style: { fontFamily:"inherit" } },
      title: { text: undefined },
      rangeSelector: { enabled: false }, navigator: { enabled: false }, scrollbar: { enabled: false },
      xAxis: { type:"datetime", lineColor:"#1e293b", tickColor:"#1e293b", gridLineColor:"#0f172a", labels:{ style:{color:"#475569"} }, crosshair:{color:"#334155"} },
      yAxis: [
        { height:"75%", top:"0%", offset:0, lineWidth:1, lineColor:"#1e293b", gridLineColor:"#0f172a", labels:{align:"right",x:-5,style:{color:"#475569"}} },
        { height:"20%", top:"78%", offset:0, lineWidth:1, lineColor:"#1e293b", gridLineColor:"#0f172a", labels:{align:"right",x:-5,style:{color:"#475569"}} },
      ],
      series,
      tooltip: { split:false, shared:true, backgroundColor:"#1e293b", borderColor:"#334155", style:{color:"#e2e8f0"} },
      legend: { enabled: false }, credits: { enabled: false },
    });
    return () => { chart.current?.destroy(); chart.current = null; };
  }, [candles, trades]);

  return <div ref={ref} className="w-full h-full" />;
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
  const [selectedSym, setSelectedSym] = useState<NSESymbol>({ symbol: "RELIANCE", company_name: "Reliance Industries", industry: "" });
  const [tf, setTf]         = useState<TFKey>("5min");
  const [fromDate, setFromDate] = useState(() => defaultDates("5min").from);
  const [toDate, setToDate]   = useState(() => defaultDates("5min").to);
  const [qty, setQty]         = useState("1");
  const [name, setName]       = useState("ORB Strategy");

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
    setLoadingChart(true); setChartError(null);
    try {
      const data = await api<{ candles: OHLCVRow[] }>(
        `/orb/chart-data?symbol=${encodeURIComponent(symbol)}&timeframe=${tf}&from_date=${fromDate}&to_date=${toDate}&limit=500`
      );
      setCandles(data.candles ?? []);
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
        body: JSON.stringify({ symbol, timeframe: tf, from_date: fromDate, to_date: toDate, qty: parseInt(qty)||1 }),
      });
      setBtResult(res); setActivePane("backtest");
    } catch (e: any) { setBtError(e.message); }
    finally { setBtRunning(false); }
  }

  async function save() {
    setSaving(true); setSaveError(null);
    try {
      const tfLabel = TIMEFRAMES.find(t => t.key === tf)?.label ?? tf;
      const stratJson = {
        version: 1, name, desk: "equity", symbol,
        action: "BUY",
        candleTime: tf === "daily" ? "EOD" : tf === "5min" ? "5min" : tf === "15min" ? "15min" : "1H",
        quantity: parseInt(qty)||1, mode:"paper", status:"draft",
        strategyType:"price_action", priceActionType:"orb",
        orbConfig: { timeframe: tf, timeframeLabel: tfLabel, from_date: fromDate, to_date: toDate },
        entry: { logic:"AND", conditions:[{ type:"orb_breakout" }] },
        exit: { logic:"OR", conditions:[{ type:"stop_loss",value:0 },{ type:"target",value:0 },{ type:"trailing_stop_loss",value:0 }] },
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
        <div className="w-64 shrink-0 border-r border-slate-800 overflow-y-auto p-4 space-y-4 bg-slate-950">
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-1">
            <p className="text-xs font-bold text-amber-400">Opening Range Breakout</p>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Entry when price breaks first-candle high/low with 2× avg volume. SL = candle low/high. TP = 1:1 R:R. Trailing SL after TP.
            </p>
          </div>

          {/* Symbol — from nse_eq_symbols */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Symbol <span className="text-slate-700 font-normal normal-case">(NSE · 750 stocks)</span></p>
            <SymbolPicker symbol={symbol} onSelect={setSelectedSym} />
            {selectedSym.company_name && (
              <p className="text-[10px] text-slate-600 mt-1 truncate">{selectedSym.company_name}</p>
            )}
            {selectedSym.industry && (
              <p className="text-[9px] text-slate-700 truncate">{selectedSym.industry}</p>
            )}
          </div>

          {/* Timeframe — matches stock_data_* tables */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Timeframe</p>
            <div className="grid grid-cols-2 gap-1">
              {TIMEFRAMES.map(t => (
                <button key={t.key} onClick={() => setTf(t.key)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-all text-left flex items-center justify-between ${t.key === tf
                    ? "bg-amber-500 text-slate-900"
                    : "bg-slate-900 border border-slate-800 text-slate-500 hover:border-slate-600"}`}>
                  <span>{t.label}</span>
                  <span className={`text-[8px] font-mono ${t.key === tf ? "text-slate-700" : "text-slate-700"}`}>
                    {t.table.replace("stock_data_","")}
                  </span>
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

          {/* Quantity */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Quantity</p>
            <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"/>
          </div>

          {/* Rules */}
          <div className="border border-slate-800 rounded-xl p-3 space-y-2 text-[10px] text-slate-500">
            <p className="font-bold text-slate-400 uppercase tracking-widest text-[9px]">Rules</p>
            {[
              ["🟡","OR = 1st candle at 09:15"],
              ["🟢","Volume ≥ 2× 20-candle avg"],
              ["🔵","Enter at close of breakout candle"],
              ["🔴","SL = candle low / high"],
              ["🟣","Target = 1:1 R:R"],
              ["🔵","Trailing SL after target"],
            ].map(([icon,text]) => (
              <div key={text} className="flex items-start gap-2"><span>{icon}</span><span>{text}</span></div>
            ))}
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
          <div className="relative flex-1 min-h-0">
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
                </div>
              </div>
            ) : (
              <ORBChart candles={candles} trades={chartTrades} key={`${symbol}-${tf}-${activePane}`} />
            )}
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
