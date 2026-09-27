"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import QuarterlyTable from "./QuarterlyTable";
import YearlyTable from "./YearlyTable";

interface Stock { symbol: string; company_name?: string; sector?: string }
interface Candle { t: number; c: number; h: number; l: number; v: number }
interface FundamentalsData { symbol: string; info: Record<string, any> | null; quarterly: any[]; yearly: any[] }
interface MarketSummary { latestClose: number; latestDate?: string; high52w: number; low52w: number; avgVolume: number }

function numeric(value: unknown, digits = 2) {
  if (value == null || value === "") return "—";
  const parsed = Number(String(value).replace(/,/g, "").replace(/%$/, ""));
  return Number.isFinite(parsed) ? parsed.toLocaleString("en-IN", { maximumFractionDigits: digits }) : "—";
}
function percent(value: unknown) {
  if (value == null || value === "") return "—";
  const raw = String(value);
  const parsed = Number(raw.replace(/,/g, "").replace(/%$/, ""));
  return Number.isFinite(parsed) ? `${(raw.endsWith("%") ? parsed : parsed * 100).toFixed(1)}%` : "—";
}
function rupees(value: unknown, digits = 0) { const valueText = numeric(value, digits); return valueText === "—" ? valueText : `₹${valueText}`; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="border-b border-slate-800 py-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-semibold tabular-nums text-slate-100">{value}</div></div>; }
function PriceChart({ candles }: { candles: Candle[] }) {
  if (candles.length < 2) return <div className="flex h-52 items-center justify-center text-sm text-slate-500">Price history is not available.</div>;
  const width = 900; const height = 220; const values = candles.map((c) => c.c); const low = Math.min(...values); const high = Math.max(...values); const range = high - low || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * width},${height - ((value - low) / range) * (height - 24) - 12}`).join(" ");
  return <div className="relative h-52 overflow-hidden rounded-lg bg-slate-950/60"><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full"><polyline points={`0,${height} ${points} ${width},${height}`} fill="#34d399" fillOpacity="0.08" stroke="none" /><polyline points={points} fill="none" stroke="#34d399" strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg><span className="absolute left-3 top-3 text-xs text-slate-500">₹{numeric(high)}</span><span className="absolute bottom-3 left-3 text-xs text-slate-500">₹{numeric(low)}</span></div>;
}
function RatioGrid({ info }: { info: Record<string, any> }) {
  const ratios = [["Market Cap", rupees(info.market_cap)], ["Current Price", rupees(info.current_price)], ["Stock P/E", numeric(info.trailing_pe)], ["Book Value", rupees(info.book_value)], ["Dividend Yield", percent(info.dividend_yield)], ["ROCE", percent(info.return_on_capital)], ["ROE", percent(info.return_on_equity)], ["Free Cash Flow", rupees(info.free_cashflow)], ["Debt to Equity", numeric(info.debt_to_equity)], ["Price to Book", numeric(info.price_to_book)], ["Profit Margin", percent(info.profit_margins)], ["Sales Growth", percent(info.revenue_growth)]];
  return <section className="rounded-xl border border-slate-800 bg-slate-900 p-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-semibold text-slate-100">Key ratios</h2><span className="text-xs text-slate-500">Fundamentals info</span></div><div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 lg:grid-cols-6">{ratios.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div></section>;
}
function Signals({ info }: { info: Record<string, any> }) {
  const pros = [info.debt_to_equity != null && "Debt profile is available for review.", info.return_on_equity != null && `Return on equity is ${percent(info.return_on_equity)}.`, info.free_cashflow != null && "Free cash flow is reported."] .filter(Boolean) as string[];
  const cons = [info.dividend_yield === 0 && "No dividend yield is currently reported.", info.revenue_growth != null && Number(info.revenue_growth) < 0 && "Revenue growth is under pressure.", info.trailing_pe != null && Number(info.trailing_pe) > 35 && "Valuation is elevated relative to earnings."] .filter(Boolean) as string[];
  const list = (items: string[], fallback: string) => <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">{(items.length ? items : [fallback]).map((item) => <li key={item}>{item}</li>)}</ul>;
  return <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-emerald-500/50 bg-slate-900 p-5"><h2 className="text-lg font-semibold uppercase tracking-wider text-slate-100">Pros</h2>{list(pros, "More positive signals will appear as ratios are imported.")}</div><div className="rounded-xl border border-rose-500/50 bg-slate-900 p-5"><h2 className="text-lg font-semibold uppercase tracking-wider text-slate-100">Cons</h2>{list(cons, "No major warnings detected from available fields.")}</div></section>;
}

export default function FundamentalsViewer() {
  const [search, setSearch] = useState(""); const [symbols, setSymbols] = useState<Stock[]>([]); const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null); const [data, setData] = useState<FundamentalsData | null>(null); const [summary, setSummary] = useState<MarketSummary | null>(null); const [candles, setCandles] = useState<Candle[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [showSuggestions, setShowSuggestions] = useState(false);
  useEffect(() => {
    const loadSymbols = async () => {
      try {
        const fundamentals = await api<{ symbols: Stock[] }>("/fundamentals/");
        const storedSymbols = fundamentals.symbols ?? [];
        if (storedSymbols.length > 0) {
          setSymbols(storedSymbols);
          return;
        }
      } catch {
        // Fall through to the complete market symbol list.
      }

      try {
        const marketSymbols = await api<Array<{ symbol: string; name?: string; sector?: string }>>("/charts/symbols");
        setSymbols(marketSymbols.map((item) => ({ symbol: item.symbol, company_name: item.name, sector: item.sector })));
      } catch {
        setError("Could not load the stock universe.");
      }
    };
    loadSymbols();
  }, []);
  useEffect(() => {
    if (!selectedSymbol) return;
    let active = true;
    const loadResearch = async () => {
      try {
        const fundamentals = await api<any>(`/fundamentals/${selectedSymbol}?quarterly_limit=12&yearly_limit=10`);
        if (!active) return;
        setData({ symbol: selectedSymbol, info: fundamentals.info, quarterly: fundamentals.quarterly ?? [], yearly: fundamentals.yearly ?? [] });

        const [marketResult, candlesResult] = await Promise.allSettled([
          api<MarketSummary>(`/charts/summary?symbol=${encodeURIComponent(selectedSymbol)}`),
          api<{ candles: Candle[] }>(`/charts/candles?symbol=${encodeURIComponent(selectedSymbol)}&timeframe=1D&limit=260`),
        ]);
        if (!active) return;
        if (marketResult.status === "fulfilled") setSummary(marketResult.value);
        if (candlesResult.status === "fulfilled") setCandles(candlesResult.value.candles ?? []);
      } catch {
        if (active) setError(`No fundamentals data is available for ${selectedSymbol}.`);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadResearch();
    return () => { active = false; };
  }, [selectedSymbol]);
  const filtered = useMemo(() => { const query = search.trim().toLowerCase(); return symbols.filter((item) => !query || item.symbol.toLowerCase().includes(query) || item.company_name?.toLowerCase().includes(query)).slice(0, 8); }, [search, symbols]);
  const selectSymbol = (symbol: string) => { setLoading(true); setError(""); setData(null); setSummary(null); setCandles([]); setSearch(symbol); setShowSuggestions(false); setSelectedSymbol(symbol); };
  const submitSearch = () => { const query = search.trim(); if (!query) return; const exact = symbols.find((item) => item.symbol.toUpperCase() === query.toUpperCase()); selectSymbol(exact?.symbol ?? filtered[0]?.symbol ?? query.toUpperCase().replace(/\s+/g, "")); };

  return <div className="min-h-screen space-y-5 pb-10"><section className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Stock lookup</div><div className="mt-1 text-sm text-slate-400">Search by symbol or company name to open its fundamentals.</div></div><form onSubmit={(event) => { event.preventDefault(); submitSearch(); }} className="relative flex w-full gap-2 sm:max-w-xl"><input value={search} onChange={(event) => { setSearch(event.target.value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} placeholder="Search symbol or company" aria-label="Search stocks" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500" /><button type="submit" className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Search</button>{showSuggestions && search.trim() && filtered.length > 0 && <div className="absolute left-0 right-20 top-12 z-30 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl">{filtered.map((item) => <button type="button" key={item.symbol} onClick={() => selectSymbol(item.symbol)} className="flex w-full justify-between border-b border-slate-800 px-3 py-2 text-left last:border-0 hover:bg-slate-800"><span><strong className="block text-sm text-slate-100">{item.symbol}</strong><small className="text-slate-500">{item.company_name || item.sector}</small></span><span className="text-xs text-emerald-400">Open</span></button>)}</div>}</form></div></section><main className="min-w-0">{!selectedSymbol ? <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-6 py-24 text-center"><h1 className="text-3xl font-semibold text-slate-100">Research a company</h1><p className="mx-auto mt-3 max-w-lg text-slate-500">Search a symbol to inspect its profile, ratios, quarterly results, annual statements, and cash flows.</p></div> : loading ? <div className="rounded-xl bg-slate-900 py-28 text-center text-slate-500">Loading fundamentals for {selectedSymbol}...</div> : error || !data || !data.info ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-6 text-rose-300">{error || "No fundamentals data available."}</div> : <div className="space-y-5"><section className="rounded-xl border border-slate-800 bg-slate-900 p-5"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight text-slate-50">{data.info.company_name || data.symbol}</h1><span className="rounded bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-400">NSE: {data.symbol}</span></div><p className="mt-2 text-sm text-slate-500">{data.info.sector || "Sector unavailable"} · {data.info.industry || "Industry unavailable"}</p></div><div className="lg:text-right"><div className="text-3xl font-semibold text-slate-100">{rupees(summary?.latestClose)}</div><div className="mt-1 text-xs text-slate-500">{summary?.latestDate ? `Last close · ${summary.latestDate}` : "Latest market price unavailable"}</div></div></div><div className="mt-6 grid grid-cols-2 gap-x-5 border-t border-slate-800 pt-3 sm:grid-cols-4 lg:grid-cols-8"><Metric label="Market Cap" value={rupees(data.info.market_cap)} /><Metric label="Stock P/E" value={numeric(data.info.trailing_pe)} /><Metric label="Book Value" value={rupees(data.info.book_value)} /><Metric label="ROE" value={percent(data.info.return_on_equity)} /><Metric label="ROCE" value={percent(data.info.return_on_capital)} /><Metric label="Dividend Yield" value={percent(data.info.dividend_yield)} /><Metric label="Debt / Equity" value={numeric(data.info.debt_to_equity)} /><Metric label="EPS" value={rupees(data.info.trailing_eps, 2)} /></div></section><RatioGrid info={data.info} /><Signals info={data.info} /><section className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]"><div className="rounded-xl border border-slate-800 bg-slate-900 p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-semibold text-slate-100">Price chart</h2><p className="mt-1 text-sm text-slate-500">Daily price history</p></div><span className="text-sm text-slate-500">{candles.length ? `${candles.length} sessions` : "No history"}</span></div><PriceChart candles={candles} /></div><div className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-semibold text-slate-100">52-week range</h2><div className="mt-8 flex justify-between"><div><div className="text-xs text-slate-500">Low</div><div className="mt-1 font-semibold text-rose-400">{rupees(summary?.low52w)}</div></div><div className="text-right"><div className="text-xs text-slate-500">High</div><div className="mt-1 font-semibold text-emerald-400">{rupees(summary?.high52w)}</div></div></div></div></section><QuarterlyTable data={data.quarterly} /><YearlyTable data={data.yearly} /></div>}</main></div>;
}
