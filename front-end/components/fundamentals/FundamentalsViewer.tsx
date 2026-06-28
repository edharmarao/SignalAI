"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import CompanyOverview from "./CompanyOverview";
import FinancialsChart from "./FinancialsChart";
import RatiosCard from "./RatiosCard";
import QuarterlyTable from "./QuarterlyTable";
import YearlyTable from "./YearlyTable";

interface FundamentalsData {
  info: any;
  quarterly: any[];
  yearly: any[];
}

export default function FundamentalsViewer() {
  const [search, setSearch] = useState("");
  const [symbols, setSymbols] = useState<any[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [data, setData] = useState<FundamentalsData | null>(null);
  const [loading, setLoading] = useState(false);

  // Load available symbols
  useEffect(() => {
    api<any>("/fundamentals/")
      .then((res) => setSymbols(res || []))
      .catch(console.error);
  }, []);

  // Load fundamentals for selected symbol
  useEffect(() => {
    if (!selectedSymbol) {
      setData(null);
      return;
    }

    setLoading(true);
    api<any>(`/fundamentals/${selectedSymbol}?quarterly_limit=8&yearly_limit=5`)
      .then((res) => {
        setData({
          info: res.info,
          quarterly: res.quarterly || [],
          yearly: res.yearly || [],
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedSymbol]);

  const filtered = symbols.filter(
    (s) =>
      !search ||
      s.symbol.toLowerCase().includes(search.toLowerCase()) ||
      s.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-100px)] gap-4">
      {/* Sidebar */}
      <div className="w-80 flex flex-col gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h2 className="text-lg font-semibold text-slate-100 mb-3">Companies</h2>
          <div className="relative mb-3">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies..."
              className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>
          <div className="max-h-[calc(100vh-250px)] overflow-y-auto space-y-1">
            {filtered.map((symbol) => (
              <button
                key={symbol.symbol}
                onClick={() => setSelectedSymbol(symbol.symbol)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition ${
                  selectedSymbol === symbol.symbol
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                    : "hover:bg-slate-800 text-slate-300"
                }`}
              >
                <div className="font-semibold text-sm">{symbol.symbol}</div>
                <div className="text-xs text-slate-500 truncate">{symbol.company_name}</div>
                {symbol.market_cap && (
                  <div className="text-xs text-slate-600 mt-0.5">
                    ₹{(symbol.market_cap / 1).toLocaleString()}Cr
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {!selectedSymbol ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">📊</div>
              <div className="text-xl font-semibold text-slate-200 mb-2">
                Select a company to view fundamentals
              </div>
              <div className="text-sm text-slate-500">
                Choose from {symbols.length} companies with fundamental data
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <div className="text-slate-400">Loading fundamentals...</div>
            </div>
          </div>
        ) : data ? (
          <div className="space-y-6 pb-6">
            {/* Company Overview */}
            <CompanyOverview info={data.info} />

            {/* Key Ratios */}
            <RatiosCard info={data.info} />

            {/* Financial Charts */}
            <FinancialsChart quarterly={data.quarterly} yearly={data.yearly} />

            {/* Quarterly Data */}
            {data.quarterly.length > 0 && <QuarterlyTable data={data.quarterly} />}

            {/* Yearly Data */}
            {data.yearly.length > 0 && <YearlyTable data={data.yearly} />}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-slate-500">No data available</div>
          </div>
        )}
      </div>
    </div>
  );
}
