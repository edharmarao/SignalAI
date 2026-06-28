"use client";
import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StockInfo { symbol: string; name: string; sector: string }

interface SymbolResult {
  symbol: string;
  status: "success" | "no_data" | "error" | "pending";
  updated?: boolean;
  action?: string;
  market_cap?: number;
  market_cap_usd?: number;
  source?: string;
  error?: string;
  message?: string;
}

interface ImportResponse {
  total: number;
  success: number;
  failed: number;
  details: SymbolResult[];
}

interface ImportSummary {
  details: SymbolResult[];
  total?: number;
  success?: number;
  failed?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SymbolsUpdatePage() {
  const [stocks, setStocks]       = useState<StockInfo[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [sectorFilter, setSector] = useState<string>("All");
  const [selected, setSelected]   = useState<Set<string>>(new Set());

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

  async function runImport() {
    if (selected.size === 0) return;
    setImporting(true);
    const symbols = Array.from(selected);
    setSummary({ details: symbols.map((s) => ({ symbol: s, status: "pending" })) });

    try {
      const data = await api<ImportResponse>("/data-sync/symbols", {
        method: "POST",
        timeoutMs: 600_000,
        body: JSON.stringify({
          symbols,
          exchange: "NSE",
        }),
      });
      setSummary({
        details: data.details ?? [],
        total: data.total,
        success: data.success,
        failed: data.failed,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSummary({ details: symbols.map((s) => ({ symbol: s, status: "error", error: msg })) });
    } finally {
      setImporting(false);
    }
  }

  const results   = summary?.details ?? [];
  const successCount = results.filter((r) => r.status === "success").length;
  const failCount    = results.filter((r) => r.status === "error" || r.status === "no_data").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">NSE EQ Symbols Update</h1>
        <p className="text-sm text-slate-400 mt-1">Update nse_eq_symbols table with market cap, rankings, and index classifications.</p>
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
            <div className="overflow-y-auto max-h-96 border border-slate-800 rounded-lg divide-y divide-slate-800/80">
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

        {/* ── Info Panel ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="text-sm font-medium text-slate-200 mb-3">What gets updated?</div>
            <ul className="text-xs text-slate-400 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Company name and industry</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Market cap and rankings</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Cap type (Large/Mid/Small/Micro)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Index memberships (NIFTY 50, 100, 500, etc.)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>52-week high/low prices</span>
              </li>
            </ul>
            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="text-xs text-blue-300 font-medium mb-1">ℹ️ Prerequisite</div>
              <div className="text-xs text-slate-400">Import fundamentals data first for these symbols</div>
            </div>
          </div>

          {/* Import button */}
          <button
            onClick={runImport}
            disabled={selected.size === 0 || importing}
            className="w-full py-3 rounded-xl text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-500 hover:bg-emerald-400 text-slate-950">
            {importing
              ? "Updating…"
              : selected.size === 0
              ? "Select symbols to update"
              : `Update ${selected.size} symbol${selected.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>

      {/* ── Results ──────────────────────────────────────────────────── */}
      {results.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Update Results</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              ✓ {successCount} succeeded
            </span>
            {failCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                ✗ {failCount} failed
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase">
                  <th className="text-left py-2 pr-4 font-medium">Symbol</th>
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
                  <th className="text-left py-2 pr-4 font-medium">Action</th>
                  <th className="text-right py-2 pr-4 font-medium">Market Cap</th>
                  <th className="text-left py-2 pl-4 font-medium">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {results.map((r) => (
                  <tr key={r.symbol} className="hover:bg-slate-800/40">
                    <td className="py-2 pr-4 font-mono text-slate-200 font-medium">{r.symbol}</td>
                    <td className="py-2 pr-4">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        r.status === "success" ? "bg-emerald-500/15 text-emerald-400" :
                        r.status === "no_data" ? "bg-amber-500/15 text-amber-400" :
                        r.status === "error"  ? "bg-red-500/15 text-red-400" :
                        "bg-slate-700 text-slate-400"
                      }`}>
                        {r.status === "success" ? "✓" : r.status === "error" ? "✗" : r.status === "no_data" ? "⚠" : "…"}
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-400">{r.action || "—"}</td>
                    <td className="py-2 pr-4 text-right text-slate-300 tabular-nums">
                      {r.market_cap ? (
                        <div>
                          <div>₹{r.market_cap.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr</div>
                          {r.market_cap_usd && (
                            <div className="text-xs text-slate-500">${r.market_cap_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}M</div>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    <td className="py-2 pl-4 text-xs text-slate-400 max-w-md truncate">{r.error || r.message || "—"}</td>
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
