"use client";
import Link from "next/link";

export default function DataImportLanding() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Data Import</h1>
        <p className="text-sm text-slate-400 mt-1">Import and synchronize market data from various sources.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* OHLCV Import */}
        <Link href="/data-import/ohlcv"
          className="group bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-xl p-6 transition-all hover:shadow-lg hover:shadow-emerald-500/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-500/15 flex items-center justify-center group-hover:bg-emerald-500/25 transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-emerald-400">
                <path d="M18 20V10M12 20V4M6 20v-6" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 group-hover:text-emerald-300 transition">OHLCV Data</h2>
              <p className="text-xs text-slate-500">Price candles</p>
            </div>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Import historical and intraday OHLCV candle data from Upstox for your selected symbols.
          </p>
          <ul className="text-xs text-slate-500 space-y-1.5 mb-4">
            <li className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Intraday & historical data</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Multiple timeframes (1m to 1M)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span>
              <span>NSE, BSE, NSE F&O</span>
            </li>
          </ul>
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
            <span>Import OHLCV</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 group-hover:translate-x-1 transition">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        {/* Fundamentals Import */}
        <Link href="/data-import/fundamentals"
          className="group bg-slate-900 border border-slate-800 hover:border-sky-500/50 rounded-xl p-6 transition-all hover:shadow-lg hover:shadow-sky-500/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-lg bg-sky-500/15 flex items-center justify-center group-hover:bg-sky-500/25 transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-sky-400">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 group-hover:text-sky-300 transition">Fundamentals</h2>
              <p className="text-xs text-slate-500">Company data</p>
            </div>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Import fundamental data from Yahoo Finance including financials, ratios, and company profiles.
          </p>
          <ul className="text-xs text-slate-500 space-y-1.5 mb-4">
            <li className="flex items-center gap-2">
              <span className="text-sky-400">✓</span>
              <span>Company profile & industry</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-sky-400">✓</span>
              <span>Quarterly & annual financials</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-sky-400">✓</span>
              <span>Market cap, PE, PB ratios</span>
            </li>
          </ul>
          <div className="flex items-center gap-2 text-sky-400 text-sm font-medium">
            <span>Import Fundamentals</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 group-hover:translate-x-1 transition">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        {/* Symbols Update */}
        <Link href="/data-import/symbols"
          className="group bg-slate-900 border border-slate-800 hover:border-violet-500/50 rounded-xl p-6 transition-all hover:shadow-lg hover:shadow-violet-500/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-lg bg-violet-500/15 flex items-center justify-center group-hover:bg-violet-500/25 transition">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-violet-400">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 group-hover:text-violet-300 transition">Symbols Update</h2>
              <p className="text-xs text-slate-500">NSE EQ metadata</p>
            </div>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Update nse_eq_symbols table with market cap rankings, index classifications, and metadata.
          </p>
          <ul className="text-xs text-slate-500 space-y-1.5 mb-4">
            <li className="flex items-center gap-2">
              <span className="text-violet-400">✓</span>
              <span>Market cap rankings</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-violet-400">✓</span>
              <span>Index memberships (NIFTY)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-violet-400">✓</span>
              <span>Cap type classifications</span>
            </li>
          </ul>
          <div className="flex items-center gap-2 text-violet-400 text-sm font-medium">
            <span>Update Symbols</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 group-hover:translate-x-1 transition">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

      </div>

      {/* Info banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-amber-400">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-slate-200 mb-1">Recommended workflow</h3>
            <ol className="text-sm text-slate-400 space-y-1 list-decimal list-inside">
              <li>Import <span className="text-sky-300 font-medium">Fundamentals</span> data first (fetches from Yahoo Finance)</li>
              <li>Update <span className="text-violet-300 font-medium">Symbols</span> metadata (uses fundamentals data)</li>
              <li>Import <span className="text-emerald-300 font-medium">OHLCV</span> price data as needed</li>
            </ol>
            <div className="mt-3 p-2 bg-blue-500/10 border border-blue-500/30 rounded text-xs text-slate-400">
              <strong className="text-blue-300">Bulk Import:</strong> Can handle up to 1000 symbols.
              Fundamentals: ~1 symbol/sec (~13 min for 750). Symbols update: ~10 symbols/sec.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
