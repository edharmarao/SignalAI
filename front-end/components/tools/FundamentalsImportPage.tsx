"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StockInfo { symbol: string; name: string; sector: string }

interface SymbolResult {
  symbol: string;
  status: "success" | "error" | "pending";
  updated?: boolean;
  error?: string;
  message?: string;
}

interface ImportResponse {
  total: number;
  success: number;
  failed: number;
  details: SymbolResult[];
}

interface ScreenerResponse {
  total: number;
  success: number;
  failed: number;
  batches: number;
  batch_results: Array<{ batch: number; total: number; success: number; failed: number }>;
  failed_downloads: Array<{ stock_code: string; error: string }>;
}

interface ImportSummary {
  details: SymbolResult[];
  total?: number;
  success?: number;
  failed?: number;
  batches?: number;
  batch_results?: ScreenerResponse["batch_results"];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FundamentalsImportPage({ infoOnly = false }: { infoOnly?: boolean }) {
  const [stocks, setStocks]       = useState<StockInfo[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [sectorFilter, setSector] = useState<string>("All");
  const [selected, setSelected]   = useState<Set<string>>(new Set());

  const [importing, setImporting] = useState(false);
  const [summary, setSummary]     = useState<ImportSummary | null>(null);
  const [source, setSource]       = useState<"yahoo" | "screener">("yahoo");
  const [logLines, setLogLines]   = useState<string[]>([]);
  const importController = useRef<AbortController | null>(null);
  const logPanel = useRef<HTMLPreElement | null>(null);

  // Load symbols
  useEffect(() => {
    api<StockInfo[]>("/charts/symbols", { timeoutMs: 60_000 })
      .then(setStocks)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!importing || source !== "screener") return;
    let active = true;
    const loadLogs = () => {
      api<{ lines: string[] }>("/fundamentals/screener/logs/tail?lines=100")
        .then((data) => { if (active) setLogLines(data.lines ?? []); })
        .catch(console.error);
    };
    loadLogs();
    const timer = window.setInterval(loadLogs, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [importing, source]);

  useEffect(() => {
    const panel = logPanel.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [logLines]);

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
    const controller = new AbortController();
    importController.current = controller;
    const selectedSymbols = Array.from(selected);
    if (source === "screener") setLogLines([]);
    setSummary({ details: selectedSymbols.map((s) => ({ symbol: s, status: "pending" })) });

    try {
      if (source === "screener") {
        if (infoOnly) {
          throw new Error("Screener import is available only for full fundamentals data.");
        }
        const data = await api<ScreenerResponse>("/fundamentals/screener/bulk-download", {
          method: "POST",
          timeoutMs: Math.max(900_000, selectedSymbols.length * 90_000),
          signal: controller.signal,
          body: JSON.stringify({ symbols: selectedSymbols }),
        });
        const failedDownloads = data.failed_downloads as Array<{ stock_code: unknown; error: unknown }>;
        const failures = new Map<string, string>();
        failedDownloads.forEach((failure) => {
          failures.set(String(failure.stock_code), String(failure.error));
        });
        setSummary({
          details: selectedSymbols.map((symbol) => {
            const error = failures.get(String(symbol));
            return error
              ? { symbol, status: "error", error }
              : { symbol, status: "success", message: "Downloaded successfully" };
          }),
          total: data.total,
          success: data.success,
          failed: data.failed,
          batches: data.batches,
          batch_results: data.batch_results,
        });
        return;
      }

      // Timeout: 1 second per symbol + 60 second buffer
      // 750 symbols = 750s + 60s = 810s = 13.5 minutes
      const timeoutMs = Math.max(600_000, selectedSymbols.length * 1000 + 60_000);

      const data = await api<ImportResponse>(infoOnly ? "/data-sync/fundamentals-info" : "/data-sync/fundamentals", {
        method: "POST",
        timeoutMs,
        signal: controller.signal,
        body: JSON.stringify({
          symbols: selectedSymbols,
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
      setSummary({ details: selectedSymbols.map((s) => ({ symbol: s, status: "error", error: msg })), total: selectedSymbols.length, failed: selectedSymbols.length });
    } finally {
      setImporting(false);
      importController.current = null;
    }
  }

  async function stopImport() {
    const cancelPath = source === "screener" ? "/fundamentals/screener/cancel" : "/data-sync/fundamentals/cancel";
    await api(cancelPath, { method: "POST" }).catch(console.error);
    importController.current?.abort();
  }

  const results   = summary?.details ?? [];
  const successCount = summary?.success ?? results.filter((r) => r.status === "success").length;
  const failCount    = summary?.failed ?? results.filter((r) => r.status === "error").length;
  const requestedCount = selected.size;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Fundamentals Data Import</h1>
        <p className="text-sm text-slate-400 mt-1">{infoOnly ? "Import company profile and market information only from Yahoo Finance." : "Import company profiles and financial statements from Yahoo Finance or Screener.in."}</p>
        {!infoOnly && <div className="flex gap-2 mt-4">
          {(["yahoo", "screener"] as const).map((item) => (
            <button key={item} onClick={() => setSource(item)} disabled={importing}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${source === item
                ? item === "screener" ? "bg-amber-500/15 text-amber-300 border-amber-500/40" : "bg-sky-500/15 text-sky-300 border-sky-500/40"
                : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"} disabled:opacity-50 disabled:cursor-not-allowed`}>
              {item === "screener" ? "Screener.in" : "Yahoo Finance"}
            </button>
          ))}
        </div>}
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
            {source === "screener" ? (
              <>
                <div className="text-sm font-medium text-slate-200 mb-3">Screener.in import</div>
                <p className="text-xs text-slate-400">Uses the same selected symbols on the left as OHLCV Data. Select individual symbols, filter by sector, or use Select all for the stock master list.</p>
                <p className="text-xs text-slate-500 mt-3">Reports are processed in batches of 50 and replace the symbol snapshot in the fundamentals tables.</p>
              </>
            ) : (
              <>
            <div className="text-sm font-medium text-slate-200 mb-3">What gets imported?</div>
            <ul className="text-xs text-slate-400 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Company profile (name, sector, industry)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Market cap, PE ratio, price-to-book</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Quarterly financial statements</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Annual financial statements</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>52-week high/low prices</span>
              </li>
            </ul>
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="text-xs text-amber-300 font-medium mb-1">⚠️ Rate Limit</div>
              <div className="text-xs text-slate-400">
                1 symbol per second (Yahoo Finance API)
                <br />
                Max: 1000 symbols (~17 minutes)
              </div>
            </div>
              </>
            )}
          </div>

          {/* Import button */}
          <div className="flex gap-2">
            <button
              onClick={runImport}
              disabled={requestedCount === 0 || importing}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-500 hover:bg-emerald-400 text-slate-950">
              {importing
                ? `Importing… (${successCount + failCount}/${requestedCount})`
                : requestedCount === 0
                ? "Select symbols to import"
                : `Import ${requestedCount} symbol${requestedCount !== 1 ? "s" : ""}`}
            </button>
            {importing && (
              <button onClick={stopImport} className="px-4 py-3 rounded-xl text-sm font-semibold text-red-300 border border-red-500/40 hover:bg-red-500/10">
                Stop
              </button>
            )}
          </div>
          {importing && requestedCount > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Progress</span>
                <span>{Math.round(((successCount + failCount) / requestedCount) * 100)}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, ((successCount + failCount) / requestedCount) * 100)}%` }}
                ></div>
              </div>
              <div className="text-xs text-slate-500 mt-2 text-center">
                {source === "screener" ? "Screener is downloading reports in batches of 50." : `Est. time: ~${requestedCount} seconds (${Math.round(requestedCount / 60)} min)`}
              </div>
            </div>
          )}
        </div>
      </div>

      {importing || logLines.length > 0 ? (
        <div className="bg-slate-950 border border-amber-500/20 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-200">{source === "screener" ? "Screener" : "Yahoo Finance"} import log tail</h2>
            <span className={`text-xs ${importing ? "text-amber-300" : "text-slate-500"}`}>
              {importing ? "Live · refreshing every 2s" : "Last run"}
            </span>
          </div>
          <pre ref={logPanel} className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-5 text-slate-400 font-mono">
            {logLines.length > 0 ? logLines.join("\n") : "Waiting for backend log output…"}
          </pre>
        </div>
      ) : null}

      {/* ── Results ──────────────────────────────────────────────────── */}
      {results.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Import Results</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              {summary?.total ?? results.length} total
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              ✓ {successCount} succeeded
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
              ✗ {failCount} failed
            </span>
            {source === "screener" && summary?.batches !== undefined && (
              <span className="text-xs text-slate-500">{summary.batches} batch{summary.batches !== 1 ? "es" : ""}</span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase">
                  <th className="text-left py-2 pr-4 font-medium">Symbol</th>
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
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
                        r.status === "error"  ? "bg-red-500/15 text-red-400" :
                        "bg-slate-700 text-slate-400"
                      }`}>
                        {r.status === "success" ? "✓" : r.status === "error" ? "✗" : "…"}
                        {r.status}
                      </span>
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
