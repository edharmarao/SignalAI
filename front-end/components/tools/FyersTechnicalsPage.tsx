"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "@/lib/api";

interface StockInfo {
  symbol: string;
  name: string;
  sector: string;
  series?: string;
}

interface SymbolResult {
  symbol: string;
  status: "success" | "failed";
  data?: unknown;
  error?: string;
  stored?: boolean;
  storage_error?: string;
}

interface BulkResponse {
  total: number;
  success: number;
  failed: number;
  stored: number;
  storage_failed: number;
  time_period: string;
  details: SymbolResult[];
  token_valid?: boolean | null;
}

interface ImportSummary extends BulkResponse {
  downloaded_at: string;
}

interface FyersTokenStatus {
  configured: boolean;
  token_hint: string | null;
}

const TIMEFRAMES = ["1", "5", "15", "30", "60"];
const FYERS_SERIES = new Set(["EQ", "BE", "BZ", "SM", "ST", "SZ"]);

function toFyersSymbol(symbol: string, series?: string): string {
  const [exchange, ticker] = symbol.includes(":")
    ? symbol.toUpperCase().split(":", 2)
    : ["NSE", symbol.toUpperCase()];
  const normalizedSeries = series?.trim().toUpperCase() || "EQ";
  const parts = ticker.split("-");
  const lastPart = parts[parts.length - 1];
  const code = FYERS_SERIES.has(lastPart)
    ? ticker
    : `${ticker}-${normalizedSeries}`;
  return `${exchange}:${code}`;
}

export default function FyersTechnicalsPage() {
  const [stocks, setStocks] = useState<StockInfo[]>([]);
  const [loadingSymbols, setLoadingSymbols] = useState(true);
  const [symbolsError, setSymbolsError] = useState("");
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("All");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fyersSymbolOverrides, setFyersSymbolOverrides] = useState<Record<string, string>>({});

  const [accessToken, setAccessToken] = useState("");
  const [savedTokenHint, setSavedTokenHint] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<"loading" | "saved" | "expired" | "missing" | "error">("loading");
  const [tokenStatusError, setTokenStatusError] = useState("");
  const [validatingToken, setValidatingToken] = useState(false);
  const [timeframe, setTimeframe] = useState("60");
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<StockInfo[]>("/charts/symbols", { timeoutMs: 60_000 })
      .then(setStocks)
      .catch((err: unknown) => setSymbolsError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoadingSymbols(false));
  }, []);

  useEffect(() => {
    api<FyersTokenStatus>("/fyers/technical-token/status")
      .then((status) => {
        setSavedTokenHint(status.token_hint);
        setTokenStatus(status.configured ? "saved" : "missing");
      })
      .catch((err: unknown) => {
        setTokenStatus("error");
        setTokenStatusError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  const sectors = useMemo(() => {
    const values = new Set(stocks.map((stock) => stock.sector).filter(Boolean));
    return ["All", ...Array.from(values).sort()];
  }, [stocks]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return stocks.filter((stock) => {
      const matchesSearch = !query ||
        stock.symbol.toLowerCase().includes(query) ||
        stock.name.toLowerCase().includes(query);
      const matchesSector = sectorFilter === "All" || stock.sector === sectorFilter;
      return matchesSearch && matchesSector;
    });
  }, [stocks, search, sectorFilter]);

  function toggleSymbol(symbol: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filtered.map((stock) => stock.symbol)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function validateAndSaveToken() {
    if (selected.size === 0) {
      setTokenStatusError("Select a symbol to test the token against.");
      return;
    }
    if (!accessToken.trim()) {
      setTokenStatusError("Enter the new Fyers access token.");
      return;
    }

    const symbol = selected.values().next().value;
    if (!symbol) {
      setTokenStatusError("Select a symbol to test the token against.");
      return;
    }
    const stock = stocks.find((item) => item.symbol === symbol);
    const fyersSymbol = fyersSymbolOverrides[symbol]?.trim() || toFyersSymbol(symbol, stock?.series);

    setValidatingToken(true);
    setTokenStatusError("");
    try {
      const result = await api<FyersTokenStatus & { ok: boolean }>("/fyers/technical-token/validate", {
        method: "POST",
        body: JSON.stringify({
          access_token: accessToken.trim(),
          symbol: fyersSymbol,
          timeframe,
        }),
      });
      setSavedTokenHint(result.token_hint);
      setTokenStatus("saved");
      setAccessToken("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setTokenStatusError(message);
    } finally {
      setValidatingToken(false);
    }
  }

  async function fetchTechnicals(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected.size === 0) {
      setError("Select at least one symbol.");
      return;
    }
    if (tokenStatus !== "saved") {
      setError(tokenStatus === "expired"
        ? "The saved Fyers token was rejected or expired. Validate a replacement token first."
        : "Save and validate a Fyers token before importing.");
      return;
    }

    setImporting(true);
    setSummary(null);
    setError("");
    const stockBySymbol = new Map<string, StockInfo>();
    stocks.forEach((stock) => stockBySymbol.set(stock.symbol, stock));
    const symbols: string[] = [];
    selected.forEach((symbol) => {
      const override = fyersSymbolOverrides[symbol]?.trim();
      symbols.push(override || toFyersSymbol(symbol, stockBySymbol.get(symbol)?.series));
    });
    try {
      const result = await api<BulkResponse>("/fyers/technical-overview/bulk", {
        method: "POST",
        timeoutMs: Math.max(600_000, symbols.length * 1_000 + 60_000),
        body: JSON.stringify({
          symbols,
          timeframe,
        }),
      });
      if (result.token_valid === false) {
        setTokenStatus("expired");
        setTokenStatusError("The saved Fyers token was rejected or has expired. Validate a replacement token.");
      } else if (result.token_valid === true) {
        setTokenStatus("saved");
        setTokenStatusError("");
      }
      setSummary({
        ...result,
        downloaded_at: new Date().toISOString(),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  function downloadData() {
    if (!summary) return;
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fyers-technicals-${summary.time_period}min.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const results = summary?.details ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Fyers Technicals</h1>
        <p className="text-sm text-slate-400 mt-1">
          Select symbols and a time period, fetch their technical overviews from Fyers, and save the results to the database.
        </p>
      </div>

      <form onSubmit={fetchTechnicals} className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-slate-200">
              Symbols
              {selected.size > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                  {selected.size} selected
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={selectAll} disabled={filtered.length === 0}
                className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded border border-emerald-500/30 disabled:opacity-40">
                Select all ({filtered.length})
              </button>
              <button type="button" onClick={clearAll}
                className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded border border-slate-700">
                Clear
              </button>
            </div>
          </div>

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search symbol or company name"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          />

          <div className="flex flex-wrap gap-1.5">
            {sectors.map((sector) => (
              <button key={sector} type="button" onClick={() => setSectorFilter(sector)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                  sectorFilter === sector
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                }`}>
                {sector}
              </button>
            ))}
          </div>

          {loadingSymbols ? (
            <div className="py-12 text-center text-slate-500 text-sm">Loading symbols…</div>
          ) : symbolsError ? (
            <p role="alert" className="py-8 text-center text-sm text-red-400">{symbolsError}</p>
          ) : (
            <div className="overflow-y-auto max-h-96 border border-slate-800 rounded-lg divide-y divide-slate-800/80">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-sm">No symbols found</div>
              ) : filtered.map((stock) => (
                <div key={stock.symbol} className={`px-4 py-2.5 hover:bg-slate-800/60 transition ${selected.has(stock.symbol) ? "bg-emerald-500/5" : ""}`}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(stock.symbol)}
                      onChange={() => toggleSymbol(stock.symbol)}
                      className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-slate-200">{stock.symbol}</span>
                      <span className="block text-xs text-slate-500 truncate">{stock.name}</span>
                    </span>
                    <span className="text-xs text-slate-600 shrink-0">{stock.sector}</span>
                  </label>
                  {selected.has(stock.symbol) && (
                    <div className="pl-7 pt-2">
                      <label htmlFor={`fyers-symbol-${stock.symbol}`} className="block text-[11px] text-slate-500 mb-1">
                        Fyers symbol (verify or edit)
                      </label>
                      <input
                        id={`fyers-symbol-${stock.symbol}`}
                        type="text"
                        value={fyersSymbolOverrides[stock.symbol] ?? toFyersSymbol(stock.symbol, stock.series)}
                        onChange={(event) => setFyersSymbolOverrides((previous) => ({
                          ...previous,
                          [stock.symbol]: event.target.value,
                        }))}
                        spellCheck={false}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-md text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500">
            Verify the generated Fyers symbol for each selection. You can edit its exchange or series (for example, NSE:STLTECH-BE).
            Requests run one symbol at a time; failures won&apos;t block the others.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className={`rounded-lg border p-3 text-xs leading-relaxed ${
              tokenStatus === "expired"
                ? "border-red-500/30 bg-red-500/10 text-red-200"
                : "border-amber-500/30 bg-amber-500/10 text-amber-200"
            }`}>
              {tokenStatus === "loading" ? "Checking for a saved Fyers token…" :
                tokenStatus === "saved" ? `Token saved in Redis (••••${savedTokenHint ?? ""}). Imports will use this token.` :
                  tokenStatus === "expired" ? "The saved token was rejected or expired. It remains in Redis until a replacement validates." :
                    tokenStatus === "error" ? `Could not check the saved token. ${tokenStatusError}` :
                      "Enter a Fyers access token (not the OAuth authorization code). It replaces the saved token only after Fyers accepts it."}
            </div>
            <label htmlFor="fyers-token" className="text-sm font-medium text-slate-200 mt-4 mb-2 block">New Fyers access token</label>
            <input
              id="fyers-token"
              type="password"
              value={accessToken}
              onChange={(event) => {
                setAccessToken(event.target.value);
                setTokenStatusError("");
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste a replacement token"
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
            <button
              type="button"
              onClick={validateAndSaveToken}
              disabled={validatingToken || importing || selected.size === 0 || !accessToken.trim()}
              className="mt-3 w-full rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {validatingToken ? "Checking token with Fyers…" : "Validate and save token"}
            </button>
            {tokenStatusError && <p role="alert" className="mt-3 text-xs text-red-400">{tokenStatusError}</p>}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <label htmlFor="fyers-timeframe" className="text-sm font-medium text-slate-200 mb-3 block">Time period</label>
            <select
              id="fyers-timeframe"
              value={timeframe}
              onChange={(event) => setTimeframe(event.target.value)}
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            >
              {TIMEFRAMES.map((value) => <option key={value} value={value}>{value} minutes</option>)}
            </select>
            <p className="text-xs text-slate-500 mt-3">
              Saved by stock code and time period. Fetching the same pair updates its existing record.
            </p>
          </div>

          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={importing || loadingSymbols || selected.size === 0 || tokenStatus !== "saved"}
            className="w-full py-3 rounded-xl text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-500 hover:bg-emerald-400 text-slate-950"
          >
            {importing ? "Fetching and saving…" : selected.size === 0 ? "Select symbols to fetch" :
              tokenStatus !== "saved" ? "Validate a Fyers token first" :
                `Fetch ${selected.size} symbol${selected.size === 1 ? "" : "s"}`}
          </button>
        </section>
      </form>

      {summary && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Technical Results ({summary.time_period} min)</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              ✓ {summary.success} succeeded
            </span>
            {summary.failed > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                ✗ {summary.failed} failed
              </span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
              {summary.stored} saved
            </span>
            {summary.storage_failed > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                {summary.storage_failed} not saved
              </span>
            )}
            <button type="button" onClick={downloadData} disabled={summary.success === 0}
              className="ml-auto px-3 py-2 rounded-lg text-xs font-medium border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40 transition">
              Download JSON
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase">
                  <th className="text-left py-2 pr-4 font-medium">Symbol</th>
                  <th className="text-left py-2 pr-4 font-medium">Status</th>
                  <th className="text-left py-2 pr-4 font-medium">Database</th>
                  <th className="text-left py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {results.map((result) => (
                  <tr key={result.symbol} className="hover:bg-slate-800/40">
                    <td className="py-2 pr-4 font-mono text-slate-200 font-medium">{result.symbol}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        result.status === "success" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                      }`}>
                        {result.status === "success" ? "✓ success" : "✗ failed"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {result.stored === true ? <span className="text-sky-300">Saved</span> :
                        result.status === "success" ? <span className="text-red-400">Not saved</span> :
                        <span className="text-slate-500">—</span>}
                    </td>
                    <td className="py-2 text-xs text-red-400">{result.error ?? result.storage_error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
