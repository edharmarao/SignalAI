"use client";
import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StockInfo { symbol: string; name: string; sector: string }

interface SymbolResult {
  symbol: string;
  status: "success" | "failed" | "pending";
  records: number;
  error?: string;
}

interface ImportResponse {
  status: string;
  total_symbols: number;
  successful_imports: number;
  failed_imports: number;
  total_records_imported: number;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  fetch_seconds: number;
  db_seconds: number;
  details: SymbolResult[];
}

interface ImportSummary {
  details: SymbolResult[];
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  fetch_seconds?: number;
  db_seconds?: number;
  total_records_imported?: number;
}

const INTERVALS = [
  { label: "1 min",    type: "minutes", value: "1" },
  { label: "5 min",    type: "minutes", value: "5" },
  { label: "15 min",   type: "minutes", value: "15" },
  { label: "30 min",   type: "minutes", value: "30" },
  { label: "1 Hour",   type: "hours",   value: "1" },
  { label: "Daily",    type: "days",    value: "1" },
  { label: "Weekly",   type: "weeks",   value: "1" },
  { label: "Monthly",  type: "months",  value: "1" },
];

const EXCHANGES = ["NSE_EQ", "BSE_EQ", "NSE_FO"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().split("T")[0]; }
function monthAgo() {
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  return d.toISOString().split("T")[0];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DataImportPage() {
  const [stocks, setStocks]       = useState<StockInfo[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [sectorFilter, setSector] = useState<string>("All");
  const [selected, setSelected]   = useState<Set<string>>(new Set());

  const [mode, setMode]           = useState<"intraday" | "historical">("intraday");
  const [exchange, setExchange]   = useState("NSE_EQ");
  const [interval, setInterval]   = useState(INTERVALS[1]);   // 5 min default
  const [fromDate, setFromDate]   = useState(monthAgo());
  const [toDate, setToDate]       = useState(today());

  const [importing, setImporting] = useState(false);
  const [summary, setSummary]     = useState<ImportSummary | null>(null);

  // Load symbols
  useEffect(() => {
    api<StockInfo[]>("/charts/symbols")
      .then(setStocks)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const sectors = useMemo(() => {
    const s = new Set(stocks.map((s) => s.sector).filter(Boolean));
    return ["All", ...Array.from(s).sort()];
  }, [stocks]);

  const filtered = useMemo(() => {
    return stocks.filter((s) => {
      const matchSearch =
        !search ||
        s.symbol.toLowerCase().includes(search.toLowerCase()) ||
        s.name.toLowerCase().includes(search.toLowerCase());
      const matchSector = sectorFilter === "All" || s.sector === sectorFilter;
      return matchSearch && matchSector;
    });
  }, [stocks, search, sectorFilter]);

  function toggleSymbol(sym: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(sym) ? n.delete(sym) : n.add(sym);
      return n;
    });
  }

  function selectAll() { setSelected(new Set(filtered.map((s) => s.symbol))); }
  function clearAll()  { setSelected(new Set()); }

  function toggleSectorSelect(sector: string) {
    const syms = filtered.filter((s) => s.sector === sector).map((s) => s.symbol);
    const allSelected = syms.every((s) => selected.has(s));
    setSelected((prev) => {
      const n = new Set(prev);
      allSelected ? syms.forEach((s) => n.delete(s)) : syms.forEach((s) => n.add(s));
      return n;
    });
  }

  async function runImport() {
    if (selected.size === 0) return;
    setImporting(true);
    const symbols = Array.from(selected);
    setSummary({ details: symbols.map((s) => ({ symbol: s, status: "pending", records: 0 })) });

    try {
      let data: ImportResponse;
      if (mode === "intraday") {
        data = await api<ImportResponse>("/upstox/intraday-data-import", {
          method: "POST",
          timeoutMs: 600_000,
          body: JSON.stringify({
            stock_codes: symbols,
            exchange,
            interval_type: interval.type,
            interval_value: interval.value,
          }),
        });
      } else {
        data = await api<ImportResponse>("/upstox/historical-data-import", {
          method: "POST",
          timeoutMs: 600_000,
          body: JSON.stringify({
            stock_codes: symbols,
            exchange,
            from_date: fromDate,
            to_date: toDate,
            interval_type: interval.type,
            interval_value: interval.value,
          }),
        });
      }
      setSummary({
        details: data.details ?? [],
        started_at: data.started_at,
        ended_at: data.ended_at,
        duration_seconds: data.duration_seconds,
        fetch_seconds: data.fetch_seconds,
        db_seconds: data.db_seconds,
        total_records_imported: data.total_records_imported,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSummary({ details: symbols.map((s) => ({ symbol: s, status: "failed", records: 0, error: msg })) });
    } finally {
      setImporting(false);
    }
  }

  const results   = summary?.details ?? [];
  const successCount = results.filter((r) => r.status === "success").length;
  const failCount    = results.filter((r) => r.status === "failed").length;
  const totalRecords = summary?.total_records_imported ?? results.reduce((s, r) => s + (r.records ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Data Import</h1>
        <p className="text-sm text-slate-400 mt-1">Import OHLCV candle data from Upstox into the database.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Symbol Selector ──────────────────────────────────────── */}
        <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-200">
              Symbols
              {selected.size > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                  {selected.size} selected
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded border border-emerald-500/30 hover:border-emerald-500/60 transition">
                Select all ({filtered.length})
              </button>
              <button onClick={clearAll} className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded border border-slate-700 hover:border-slate-600 transition">
                Clear
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search symbol or company name…"
              className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>

          {/* Sector filter */}
          <div className="flex flex-wrap gap-1.5">
            {sectors.map((s) => (
              <button key={s} onClick={() => setSector(s)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  sectorFilter === s
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200"
                }`}>
                {s}
              </button>
            ))}
          </div>

          {/* Symbol list */}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-500 text-sm">Loading symbols…</div>
          ) : (
            <div className="overflow-y-auto max-h-80 border border-slate-800 rounded-lg divide-y divide-slate-800/80">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-sm">No symbols found</div>
              ) : (
                filtered.map((stock) => {
                  const isChecked = selected.has(stock.symbol);
                  return (
                    <label key={stock.symbol}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-800/60 transition ${isChecked ? "bg-emerald-500/5" : ""}`}>
                      <input
                        type="checkbox" checked={isChecked}
                        onChange={() => toggleSymbol(stock.symbol)}
                        className="w-4 h-4 rounded border-slate-600 text-emerald-500 accent-emerald-500 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-200">{stock.symbol}</div>
                        <div className="text-xs text-slate-500 truncate">{stock.name}</div>
                      </div>
                      <span className="text-xs text-slate-600 shrink-0">{stock.sector}</span>
                    </label>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ── Config Panel ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Mode */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="text-sm font-medium text-slate-200 mb-3">Import Mode</div>
            <div className="grid grid-cols-2 gap-2">
              {(["intraday", "historical"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`py-2 rounded-lg text-sm font-medium border transition ${
                    mode === m
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                      : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                  }`}>
                  {m === "intraday" ? "⚡ Intraday" : "📅 Historical"}
                </button>
              ))}
            </div>
            {mode === "intraday" && (
              <p className="text-xs text-slate-500 mt-2">Imports today's candles.</p>
            )}
          </div>

          {/* Exchange */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="text-sm font-medium text-slate-200 mb-3">Exchange</div>
            <div className="flex flex-col gap-2">
              {EXCHANGES.map((ex) => (
                <label key={ex} className="flex items-center gap-2.5 cursor-pointer group">
                  <input type="radio" name="exchange" value={ex} checked={exchange === ex}
                    onChange={() => setExchange(ex)} className="accent-emerald-500" />
                  <span className={`text-sm font-mono transition ${exchange === ex ? "text-slate-200" : "text-slate-400 group-hover:text-slate-200"}`}>
                    {ex}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Interval */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="text-sm font-medium text-slate-200 mb-3">Candle Interval</div>
            <div className="grid grid-cols-2 gap-1.5">
              {INTERVALS.map((iv) => (
                <button key={`${iv.type}-${iv.value}`} onClick={() => setInterval(iv)}
                  className={`py-1.5 rounded-md text-xs font-medium border transition ${
                    interval.type === iv.type && interval.value === iv.value
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                      : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                  }`}>
                  {iv.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date range (historical only) */}
          {mode === "historical" && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="text-sm font-medium text-slate-200 mb-3">Date Range</div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">From</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">To</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50" />
                </div>
              </div>
            </div>
          )}

          {/* Import button */}
          <button
            onClick={runImport}
            disabled={selected.size === 0 || importing}
            className="w-full py-3 rounded-xl text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-500 hover:bg-emerald-400 text-slate-950">
            {importing
              ? "Importing…"
              : selected.size === 0
              ? "Select symbols to import"
              : `Import ${selected.size} symbol${selected.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>

      {/* ── Results ──────────────────────────────────────────────────── */}
      {results.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">

          {/* Timing banner */}
          {summary?.duration_seconds !== undefined && (
            <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-slate-800/60 border border-slate-700 rounded-lg text-xs">
              <span className="text-slate-400">🕐 Started</span>
              <span className="font-mono text-slate-200">{summary.started_at}</span>
              <span className="text-slate-600">→</span>
              <span className="text-slate-400">Ended</span>
              <span className="font-mono text-slate-200">{summary.ended_at}</span>
              <span className="ml-auto flex items-center gap-4">
                <span className="text-slate-400">Fetch <span className="text-amber-400 font-semibold">{summary.fetch_seconds}s</span></span>
                <span className="text-slate-400">DB write <span className="text-sky-400 font-semibold">{summary.db_seconds}s</span></span>
                <span className="text-emerald-400 font-bold text-sm">Total {summary.duration_seconds}s</span>
              </span>
            </div>
          )}

          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Import Results</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              ✓ {successCount} succeeded
            </span>
            {failCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                ✗ {failCount} failed
              </span>
            )}
            <span className="text-xs text-slate-500 ml-auto">{totalRecords.toLocaleString()} records imported</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase">
                  <th className="text-left py-2 pr-4 font-medium">Symbol</th>
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
                  <th className="text-right py-2 font-medium">Records</th>
                  <th className="text-left py-2 pl-4 font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {results.map((r) => (
                  <tr key={r.symbol} className="hover:bg-slate-800/40">
                    <td className="py-2 pr-4 font-mono text-slate-200 font-medium">{r.symbol}</td>
                    <td className="py-2 pr-4">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        r.status === "success" ? "bg-emerald-500/15 text-emerald-400" :
                        r.status === "failed"  ? "bg-red-500/15 text-red-400" :
                        "bg-slate-700 text-slate-400"
                      }`}>
                        {r.status === "success" ? "✓" : r.status === "failed" ? "✗" : "…"}
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 text-right text-slate-300 tabular-nums">{r.records?.toLocaleString() ?? "—"}</td>
                    <td className="py-2 pl-4 text-xs text-red-400 max-w-xs truncate">{r.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
