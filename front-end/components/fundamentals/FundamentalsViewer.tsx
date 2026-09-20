"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import FinancialsChart from "./FinancialsChart";
import RatiosCard from "./RatiosCard";
import QuarterlyTable from "./QuarterlyTable";
import YearlyTable from "./YearlyTable";

interface Stock { symbol: string; company_name?: string; sector?: string; market_cap?: number }
interface Candle { t: number; c: number; h: number; l: number; v: number }
interface FundamentalsData { symbol: string; info: Record<string, any> | null; quarterly: any[]; yearly: any[] }
interface MarketSummary { latestClose: number; latestDate?: string; high52w: number; low52w: number; avgVolume: number; source: string }

function money(value: unknown, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

function percent(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function PriceChart({ candles }: { candles: Candle[] }) {
  if (candles.length < 2) return <div className="h-64 flex items-center justify-center text-sm text-slate-500">Price history is not available for this symbol.</div>;
  const width = 900;
  const height = 260;
  const values = candles.map((c) => c.c);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = high - low || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * width},${height - ((value - low) / range) * (height - 24) - 12}`).join(" ");
  const rising = values[values.length - 1] >= values[0];
  const color = rising ? "#34d399" : "#fb7185";
  return (
    <div className="relative h-64 w-full overflow-hidden rounded-lg bg-slate-950/60">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {[0, 1, 2, 3].map((line) => <line key={line} x1="0" x2={width} y1={line * 78 + 14} y2={line * 78 + 14} stroke="#1e293b" strokeWidth="1" />)}
        <polyline points={`0,${height} ${points} ${width},${height}`} fill={color} fillOpacity="0.07" stroke="none" />
        <polyline points={points} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute left-3 top-3 text-[11px] text-slate-500">₹{money(high)}</div>
      <div className="absolute bottom-3 left-3 text-[11px] text-slate-500">₹{money(low)}</div>
      <div className={`absolute right-3 top-3 text-xs font-semibold ${rising ? "text-emerald-400" : "text-rose-400"}`}>
        {rising ? "▲" : "▼"} {Math.abs(((values[values.length - 1] - values[0]) / values[0]) * 100).toFixed(1)}% period return
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "text-slate-100" }: { label: string; value: string; tone?: string }) {
  return <div className="border-l border-slate-800 pl-4 first:border-l-0 first:pl-0"><div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div><div className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</div></div>;
}

export default function FundamentalsViewer() {
  const [search, setSearch] = useState("");
  const [symbols, setSymbols] = useState<Stock[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [data, setData] = useState<FundamentalsData | null>(null);
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "quarterly" | "annual">("overview");
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const loadSymbols = async () => {
      try {
        const fundamentals = await api<{ symbols: Stock[] }>("/fundamentals/");
        if (fundamentals?.symbols?.length) {
          setSymbols(fundamentals.symbols);
          return;
        }
        const chartSymbols = await api<Array<{ symbol: string; name?: string; sector?: string }>>("/charts/symbols");
        setSymbols(chartSymbols.map((item) => ({ symbol: item.symbol, company_name: item.name, sector: item.sector })));
      } catch {
        try {
          const chartSymbols = await api<Array<{ symbol: string; name?: string; sector?: string }>>("/charts/symbols");
          setSymbols(chartSymbols.map((item) => ({ symbol: item.symbol, company_name: item.name, sector: item.sector })));
        } catch {
          setError("Could not load the stock universe. Enter a symbol above and press Search.");
        }
      }
    };
    loadSymbols();
  }, []);

  useEffect(() => {
    if (!selectedSymbol) return;
    let active = true;
    Promise.all([
      api<any>(`/fundamentals/${selectedSymbol}?quarterly_limit=8&yearly_limit=8`),
      api<MarketSummary>(`/charts/summary?symbol=${encodeURIComponent(selectedSymbol)}`),
      api<{ candles: Candle[] }>(`/charts/candles?symbol=${encodeURIComponent(selectedSymbol)}&timeframe=1D&limit=260`),
    ]).then(([fundamentals, market, priceData]) => {
      if (!active) return;
      setData({ symbol: selectedSymbol, info: fundamentals.info, quarterly: fundamentals.quarterly ?? [], yearly: fundamentals.yearly ?? [] });
      setSummary(market);
      setCandles(priceData.candles ?? []);
    }).catch(() => { if (active) setError(`No complete research data is available for ${selectedSymbol}.`); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedSymbol]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return symbols.filter((item) => !query || item.symbol.toLowerCase().includes(query) || item.company_name?.toLowerCase().includes(query)).slice(0, 80);
  }, [search, symbols]);

  const info = data?.info;
  const rangePosition = summary && summary.high52w > summary.low52w ? Math.max(0, Math.min(100, ((summary.latestClose - summary.low52w) / (summary.high52w - summary.low52w)) * 100)) : 50;
  const selectSymbol = (symbol: string) => {
    setLoading(true);
    setError("");
    setData(null);
    setSummary(null);
    setCandles([]);
    setSearch(symbol);
    setShowSuggestions(false);
    setSelectedSymbol(symbol);
    setTab("overview");
  };
  const searchSuggestions = showSuggestions && search.trim() ? filtered.slice(0, 6) : [];
  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitSearch();
    }
  };
  const submitSearch = () => {
    const query = search.trim();
    if (!query) return;
    const normalized = query.toUpperCase();
    const match = symbols.find((item) => item.symbol.toUpperCase() === normalized) ?? searchSuggestions[0];
    selectSymbol(match?.symbol ?? normalized.replace(/\s+/g, ""));
  };

  return (
    <div className="flex min-h-[calc(100vh-100px)] flex-col gap-4">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Stock lookup</div>
            <div className="mt-1 text-sm text-slate-400">Search by symbol or company name to open its fundamentals.</div>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); submitSearch(); }} className="relative flex w-full gap-2 sm:max-w-xl">
            <span className="absolute left-3 top-2.5 text-slate-500">⌕</span>
            <input value={search} onChange={(event) => { setSearch(event.target.value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} onKeyDown={handleSearchKeyDown} placeholder="Search symbol or company" aria-label="Search stocks" autoComplete="off" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 py-2.5 pl-8 pr-3 text-sm text-slate-200 outline-none transition focus:border-emerald-500" />
            <button type="submit" className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">Search</button>
            {searchSuggestions.length > 0 && <div className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
              {searchSuggestions.map((item) => <button key={`top-suggestion-${item.symbol}`} onMouseDown={(event) => event.preventDefault()} onClick={() => selectSymbol(item.symbol)} className="flex w-full items-center justify-between border-b border-slate-800 px-3 py-2.5 text-left last:border-0 hover:bg-slate-800"><span><span className="block text-sm font-semibold text-slate-100">{item.symbol}</span><span className="block max-w-[280px] truncate text-xs text-slate-500">{item.company_name || item.sector || "NSE equity"}</span></span><span className="text-[10px] uppercase tracking-wider text-emerald-400">View</span></button>)}
            </div>}
          </form>
        </div>
      </section>
      <main className="min-w-0">
        {!selectedSymbol ? <div className="flex min-h-[70vh] items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40"><div className="max-w-md px-6 text-center"><div className="mb-5 text-5xl text-emerald-400">⌁</div><h2 className="text-2xl font-semibold text-slate-100">Find your next compounder</h2><p className="mt-3 text-sm leading-6 text-slate-500">Search a stock to inspect price momentum, valuation, profitability, cash generation, and reported financial trends in one workspace.</p></div></div> : loading ? <div className="flex min-h-[70vh] items-center justify-center rounded-xl border border-slate-800 bg-slate-900"><div className="text-center"><div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" /><div className="text-sm text-slate-400">Assembling research view for {selectedSymbol}...</div></div></div> : error || !data ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-sm text-rose-300">{error || "No data available."}</div> : (
          <div className="space-y-4 pb-8">
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-3xl font-semibold tracking-tight text-slate-50">{data.symbol}</h2><span className="rounded bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">NSE · Equity</span></div><p className="mt-1 text-sm text-slate-400">{info?.company_name || "Company fundamentals"}</p><div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500"><span>{info?.sector || "Sector unavailable"}</span><span className="text-slate-700">•</span><span>{info?.industry || "Industry unavailable"}</span></div></div><div className="lg:text-right"><div className="text-3xl font-semibold tabular-nums text-slate-100">{summary?.latestClose ? `₹${money(summary.latestClose)}` : "—"}</div><div className="mt-1 text-xs text-slate-500">{summary?.latestDate ? `Last close · ${summary.latestDate}` : "Latest market price unavailable"}</div></div></div>
              <div className="mt-6 grid grid-cols-2 gap-5 border-t border-slate-800 pt-5 sm:grid-cols-4"><Metric label="Market cap" value={info?.market_cap ? `₹${money(info.market_cap, 0)} Cr` : "—"} /><Metric label="P / E" value={money(info?.trailing_pe)} /><Metric label="ROE" value={percent(info?.return_on_equity)} tone="text-emerald-400" /><Metric label="Dividend yield" value={percent(info?.dividend_yield)} /></div>
            </section>

            <div className="flex gap-1 border-b border-slate-800 px-1"><button onClick={() => setTab("overview")} className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === "overview" ? "border-emerald-400 text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-300"}`}>Overview</button><button onClick={() => setTab("quarterly")} className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === "quarterly" ? "border-emerald-400 text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-300"}`}>Quarterly results</button><button onClick={() => setTab("annual")} className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === "annual" ? "border-emerald-400 text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-300"}`}>Annual results</button></div>

            {tab === "overview" ? <>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]"><section className="rounded-xl border border-slate-800 bg-slate-900 p-5"><div className="mb-4 flex items-center justify-between"><div><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Price performance</div><h3 className="mt-1 text-lg font-semibold text-slate-100">1 year trend</h3></div><span className="text-xs text-slate-500">{candles.length ? `${candles.length} sessions` : "No history"}</span></div><PriceChart candles={candles} /></section><section className="rounded-xl border border-slate-800 bg-slate-900 p-5"><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Trading range</div><h3 className="mt-1 text-lg font-semibold text-slate-100">52-week position</h3><div className="mt-8 flex items-end justify-between"><div><div className="text-xs text-slate-500">Low</div><div className="mt-1 text-lg font-semibold text-rose-300">₹{money(summary?.low52w)}</div></div><div className="text-right"><div className="text-xs text-slate-500">High</div><div className="mt-1 text-lg font-semibold text-emerald-300">₹{money(summary?.high52w)}</div></div></div><div className="relative mt-7 h-2 rounded-full bg-slate-800"><div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-rose-400 to-emerald-400" style={{ width: `${rangePosition}%` }} /><span className="absolute -top-1.5 h-5 w-1 rounded-full bg-white shadow" style={{ left: `calc(${rangePosition}% - 2px)` }} /></div><div className="mt-3 flex justify-between text-[11px] text-slate-500"><span>52W low</span><span>{rangePosition.toFixed(0)}% of range</span><span>52W high</span></div><div className="mt-8 grid grid-cols-2 gap-4 border-t border-slate-800 pt-4"><Metric label="Avg volume" value={summary?.avgVolume ? money(summary.avgVolume, 0) : "—"} /><Metric label="P / B" value={money(info?.price_to_book)} /></div></section></div>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]"><FinancialsChart quarterly={data.quarterly} yearly={data.yearly} /><RatiosCard info={info} /></div>
            </> : tab === "quarterly" ? <QuarterlyTable data={data.quarterly} /> : <YearlyTable data={data.yearly} />}
          </div>
        )}
      </main>
    </div>
  );
}
