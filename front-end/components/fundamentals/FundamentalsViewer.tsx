"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import QuarterlyTable from "./QuarterlyTable";
import YearlyTable from "./YearlyTable";

interface Stock {
  symbol: string;
  company_name?: string;
  name?: string;
  sector?: string;
}

interface Candle {
  t: number;
  c: number;
  h: number;
  l: number;
  v: number;
}

interface FundamentalsData {
  symbol: string;
  info: Record<string, unknown> | null;
  quarterly: unknown[];
  yearly: unknown[];
}

interface MarketSummary {
  symbol: string;
  latestClose: number;
  latestDate?: string;
  high52w: number;
  low52w: number;
  avgVolume: number;
}

interface LivePriceQuote {
  ltp: number | null;
  source: string;
}

interface LivePriceState {
  symbol: string;
  ltp: number | null;
  updatedAt: number | null;
  error: string;
}

interface TechnicalRecord {
  stock_code: string;
  time_period: string;
  updated_at: string;
  [column: string]: string | number | null;
}

interface IndicatorDefinition {
  label: string;
  valueColumn: string;
  trendColumn: string;
}

const TIME_PERIODS = [
  { label: "1 min", value: "1" },
  { label: "5 mins", value: "5" },
  { label: "15 mins", value: "15" },
  { label: "30 mins", value: "30" },
  { label: "1 hour", value: "60" },
];

const OSCILLATORS: IndicatorDefinition[] = [
  { label: "RSI", valueColumn: "osc_rsi_value", trendColumn: "osc_rsi_trend" },
  { label: "Stochastic %K", valueColumn: "osc_stoch_k_value", trendColumn: "osc_stoch_k_trend" },
  { label: "MACD Level (12, 26)", valueColumn: "osc_macd_level_12_26_value", trendColumn: "osc_macd_level_12_26_trend" },
  { label: "Ultimate Oscillator", valueColumn: "osc_ultimate_oscillator_value", trendColumn: "osc_ultimate_oscillator_trend" },
  { label: "Aroon Oscillator", valueColumn: "osc_aroon_oscillator_value", trendColumn: "osc_aroon_oscillator_trend" },
  { label: "BOP", valueColumn: "osc_bop_value", trendColumn: "osc_bop_trend" },
  { label: "CCI", valueColumn: "osc_cci_value", trendColumn: "osc_cci_trend" },
  { label: "Williams %R", valueColumn: "osc_williams_r_value", trendColumn: "osc_williams_r_trend" },
  { label: "Momentum", valueColumn: "osc_momentum_value", trendColumn: "osc_momentum_trend" },
];

const MOVING_AVERAGES: IndicatorDefinition[] = [
  { label: "EMA 9", valueColumn: "ma_ema_9_value", trendColumn: "ma_ema_9_trend" },
  { label: "SMA 9", valueColumn: "ma_sma_9_value", trendColumn: "ma_sma_9_trend" },
  { label: "EMA 21", valueColumn: "ma_ema_21_value", trendColumn: "ma_ema_21_trend" },
  { label: "SMA 21", valueColumn: "ma_sma_21_value", trendColumn: "ma_sma_21_trend" },
  { label: "EMA 50", valueColumn: "ma_ema_50_value", trendColumn: "ma_ema_50_trend" },
  { label: "SMA 50", valueColumn: "ma_sma_50_value", trendColumn: "ma_sma_50_trend" },
  { label: "EMA 200", valueColumn: "ma_ema_200_value", trendColumn: "ma_ema_200_trend" },
  { label: "SMA 200", valueColumn: "ma_sma_200_value", trendColumn: "ma_sma_200_trend" },
  { label: "WMA 20", valueColumn: "ma_wma_20_value", trendColumn: "ma_wma_20_trend" },
];

const PATTERNS: IndicatorDefinition[] = [
  { label: "Closing marubozu", valueColumn: "pattern_closing_marubozu_value", trendColumn: "pattern_closing_marubozu_trend" },
  { label: "Two crows", valueColumn: "pattern_two_crows_value", trendColumn: "pattern_two_crows_trend" },
  { label: "Three black crows", valueColumn: "pattern_three_black_crows_value", trendColumn: "pattern_three_black_crows_trend" },
  { label: "Three-line strike", valueColumn: "pattern_three_line_strike_value", trendColumn: "pattern_three_line_strike_trend" },
  { label: "Three outside up/down", valueColumn: "pattern_three_outside_up_down_value", trendColumn: "pattern_three_outside_up_down_trend" },
  { label: "Three stars in the south", valueColumn: "pattern_three_stars_in_the_south_value", trendColumn: "pattern_three_stars_in_the_south_trend" },
  { label: "Three advancing white soldiers", valueColumn: "pattern_three_advancing_white_soldiers_value", trendColumn: "pattern_three_advancing_white_soldiers_trend" },
  { label: "Doji star", valueColumn: "pattern_doji_star_value", trendColumn: "pattern_doji_star_trend" },
  { label: "Evening star", valueColumn: "pattern_evening_star_value", trendColumn: "pattern_evening_star_trend" },
];

const TECHNICAL_RATIOS: IndicatorDefinition[] = [
  { label: "Day RSI", valueColumn: "ratio_day_rsi_value", trendColumn: "ratio_day_rsi_trend" },
  { label: "Day MFI", valueColumn: "ratio_day_mfi_value", trendColumn: "ratio_day_mfi_trend" },
  { label: "50 Day SMA", valueColumn: "ratio_sma_50_day_value", trendColumn: "ratio_sma_50_day_trend" },
  { label: "200 Day SMA", valueColumn: "ratio_sma_200_day_value", trendColumn: "ratio_sma_200_day_trend" },
  { label: "20 Day WMA", valueColumn: "ratio_wma_20_day_value", trendColumn: "ratio_wma_20_day_trend" },
  { label: "Day MACD (12, 26, 9)", valueColumn: "ratio_macd_day_12_26_9_value", trendColumn: "ratio_macd_day_12_26_9_trend" },
];

const PIVOT_TYPES = ["Classic", "Fibonacci", "Camarilla", "Woodie", "DeMark"] as const;
const PIVOT_LEVELS = [
  ["Resistance 5", "resistance_5"],
  ["Resistance 4", "resistance_4"],
  ["Resistance 3", "resistance_3"],
  ["Resistance 2", "resistance_2"],
  ["Resistance 1", "resistance_1"],
  ["Pivot", "pivot"],
  ["Support 1", "support_1"],
  ["Support 2", "support_2"],
  ["Support 3", "support_3"],
  ["Support 4", "support_4"],
  ["Support 5", "support_5"],
] as const;

function numeric(value: unknown, digits = 2): string {
  if (value == null || value === "") return "—";
  const parsed = Number(String(value).replace(/,/g, "").replace(/%$/, ""));
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("en-IN", { maximumFractionDigits: digits })
    : "—";
}

function percent(value: unknown): string {
  if (value == null || value === "") return "—";
  const raw = String(value);
  const parsed = Number(raw.replace(/,/g, "").replace(/%$/, ""));
  return Number.isFinite(parsed) ? `${(raw.endsWith("%") ? parsed : parsed * 100).toFixed(1)}%` : "—";
}

function rupees(value: unknown, digits = 0): string {
  const text = numeric(value, digits);
  return text === "—" ? text : `₹${text}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-800 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-semibold tabular-nums text-slate-100">{value}</div>
    </div>
  );
}

function PriceChart({ candles }: { candles: Candle[] }) {
  if (candles.length < 2) {
    return <div className="flex h-52 items-center justify-center text-sm text-slate-500">Price history is not available.</div>;
  }

  const width = 900;
  const height = 220;
  const values = candles.map((candle) => candle.c);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = high - low || 1;
  const points = values
    .map((value, index) => `${(index / (values.length - 1)) * width},${height - ((value - low) / range) * (height - 24) - 12}`)
    .join(" ");

  return (
    <div className="relative h-52 overflow-hidden rounded-lg bg-slate-950/60">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <polyline points={`0,${height} ${points} ${width},${height}`} fill="#34d399" fillOpacity="0.08" stroke="none" />
        <polyline points={points} fill="none" stroke="#34d399" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute left-3 top-3 text-xs text-slate-500">₹{numeric(high)}</span>
      <span className="absolute bottom-3 left-3 text-xs text-slate-500">₹{numeric(low)}</span>
    </div>
  );
}

function RatioGrid({ info }: { info: Record<string, unknown> }) {
  const ratios: [string, string][] = [
    ["Market Cap", rupees(info.market_cap)],
    ["Current Price", rupees(info.current_price)],
    ["Stock P/E", numeric(info.trailing_pe)],
    ["Book Value", rupees(info.book_value)],
    ["Dividend Yield", percent(info.dividend_yield)],
    ["ROCE", percent(info.return_on_capital)],
    ["ROE", percent(info.return_on_equity)],
    ["Free Cash Flow", rupees(info.free_cashflow)],
    ["Debt to Equity", numeric(info.debt_to_equity)],
    ["Price to Book", numeric(info.price_to_book)],
    ["Profit Margin", percent(info.profit_margins)],
    ["Sales Growth", percent(info.revenue_growth)],
  ];

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-100">Key ratios</h2>
        <span className="text-xs text-slate-500">Fundamentals info</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 lg:grid-cols-6">
        {ratios.map(([label, value]) => <Metric key={label} label={label} value={value} />)}
      </div>
    </section>
  );
}

function Signals({ info }: { info: Record<string, unknown> }) {
  const pros = [
    info.debt_to_equity != null && "Debt profile is available for review.",
    info.return_on_equity != null && `Return on equity is ${percent(info.return_on_equity)}.`,
    info.free_cashflow != null && "Free cash flow is reported.",
  ].filter(Boolean) as string[];
  const cons = [
    info.dividend_yield === 0 && "No dividend yield is currently reported.",
    info.revenue_growth != null && Number(info.revenue_growth) < 0 && "Revenue growth is under pressure.",
    info.trailing_pe != null && Number(info.trailing_pe) > 35 && "Valuation is elevated relative to earnings.",
  ].filter(Boolean) as string[];
  const list = (items: string[], fallback: string) => (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-400">
      {(items.length ? items : [fallback]).map((item) => <li key={item}>{item}</li>)}
    </ul>
  );

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-emerald-500/50 bg-slate-900 p-5">
        <h2 className="text-lg font-semibold uppercase tracking-wider text-slate-100">Pros</h2>
        {list(pros, "More positive signals will appear as ratios are imported.")}
      </div>
      <div className="rounded-xl border border-rose-500/50 bg-slate-900 p-5">
        <h2 className="text-lg font-semibold uppercase tracking-wider text-slate-100">Cons</h2>
        {list(cons, "No major warnings detected from available fields.")}
      </div>
    </section>
  );
}

function TechnicalTrend({ value }: { value: unknown }) {
  const trend = Number(value);
  const label = trend > 0 ? "Bullish" : trend < 0 ? "Bearish" : "Neutral";
  const color = trend > 0
    ? "bg-emerald-500/10 text-emerald-300"
    : trend < 0
      ? "bg-rose-500/10 text-rose-300"
      : "bg-slate-800 text-slate-400";
  return <span className={`rounded-full px-2 py-1 text-[11px] ${color}`}>{value == null ? "—" : label}</span>;
}

function calculateTechnicalMeter(record: TechnicalRecord, indicators: IndicatorDefinition[]) {
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;

  for (const indicator of indicators) {
    const value = record[indicator.trendColumn];
    if (value == null || !Number.isFinite(Number(value))) continue;
    const trend = Number(value);
    if (trend > 0) bullish += 1;
    else if (trend < 0) bearish += 1;
    else neutral += 1;
  }

  const total = bullish + bearish + neutral;
  const score = total === 0 ? 0 : ((bullish - bearish) / total) * 100;
  return { bullish, bearish, neutral, total, score };
}

function IndicatorTable({
  title,
  indicators,
  record,
}: {
  title: string;
  indicators: IndicatorDefinition[];
  record: TechnicalRecord;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-100">{title}</h3>
      <div className="divide-y divide-slate-800">
        {indicators.map((indicator) => (
          <div key={indicator.valueColumn} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-xs text-slate-400">{indicator.label}</span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium tabular-nums text-slate-100">
                {numeric(record[indicator.valueColumn], 4)}
              </span>
              <TechnicalTrend value={record[indicator.trendColumn]} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TechnicalDataView({
  record,
  livePrice,
  livePriceUpdatedAt,
  latestClose,
  livePriceError,
}: {
  record: TechnicalRecord;
  livePrice: number | null;
  livePriceUpdatedAt: number | null;
  latestClose: number | undefined;
  livePriceError: string;
}) {
  const meters = [
    { label: "Oscillators", indicators: OSCILLATORS },
    { label: "Moving averages", indicators: MOVING_AVERAGES },
    { label: "Patterns", indicators: PATTERNS },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {meters.map((meterDefinition) => {
          const meter = calculateTechnicalMeter(record, meterDefinition.indicators);
          const scorePosition = Math.max(0, Math.min(100, (meter.score + 100) / 2));
          const trend = meter.score > 0 ? 1 : meter.score < 0 ? -1 : 0;
          return (
          <section key={meterDefinition.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">{meterDefinition.label}</h3>
              <TechnicalTrend value={meter.total ? trend : null} />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-100">
              {meter.total ? `${meter.score > 0 ? "+" : ""}${meter.score.toFixed(1)}%` : "—"}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {meter.total
                ? `${meter.bullish} bullish · ${meter.bearish} bearish · ${meter.neutral} neutral signals`
                : "Trend data is not available."}
            </p>
            <div
              className="relative mt-4"
              role="img"
              aria-label={`${meterDefinition.label} meter: ${meter.score.toFixed(1)} percent net signal`}
            >
              <div className="h-2 rounded-full bg-gradient-to-r from-rose-500 via-slate-700 to-emerald-500" />
              {meter.total > 0 && (
                <span
                  className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded-full bg-white shadow"
                  style={{ left: `${scorePosition}%` }}
                />
              )}
              <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                <span>Bearish</span>
                <span>Neutral</span>
                <span>Bullish</span>
              </div>
            </div>
          </section>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <IndicatorTable title="Oscillators" indicators={OSCILLATORS} record={record} />
        <IndicatorTable title="Moving averages" indicators={MOVING_AVERAGES} record={record} />
        <IndicatorTable title="Candlestick patterns" indicators={PATTERNS} record={record} />
        <IndicatorTable title="Technical ratios" indicators={TECHNICAL_RATIOS} record={record} />
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-100">Pivot levels</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="py-2 pr-4 font-medium">Level</th>
                {PIVOT_TYPES.map((type) => (
                  <th key={type} className="px-3 py-2 text-right font-medium">{type}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <PivotCurrentPriceRow
                livePrice={livePrice}
                updatedAt={livePriceUpdatedAt}
                latestClose={latestClose}
                error={livePriceError}
              />
              {PIVOT_LEVELS.map(([label, column]) => (
                <tr key={column}>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{label}</td>
                  {PIVOT_TYPES.map((type) => (
                    <td key={type} className="px-3 py-2.5 text-right tabular-nums text-slate-100">
                      {numeric(record[`${type.toLowerCase()}_${column}`])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}

function PivotCurrentPriceRow({
  livePrice,
  updatedAt,
  latestClose,
  error,
}: {
  livePrice: number | null;
  updatedAt: number | null;
  latestClose: number | undefined;
  error: string;
}) {
  const fallbackPrice = typeof latestClose === "number" && latestClose > 0 ? latestClose : null;
  const price = livePrice ?? fallbackPrice;

  return (
    <tr className="border-y border-dashed border-emerald-500/50 bg-emerald-500/5">
      <td className="py-2.5 pr-4 text-xs font-semibold text-emerald-300">Current price</td>
      <td colSpan={PIVOT_TYPES.length} className="px-3 py-2.5 text-right tabular-nums text-slate-100">
        <span className="font-semibold">{price === null ? "—" : rupees(price, 2)}</span>
        <span className={`ml-2 text-[10px] font-semibold ${livePrice === null ? "text-amber-300" : "text-emerald-300"}`}>
          {livePrice === null ? (fallbackPrice === null ? "UNAVAILABLE" : "LAST CLOSE") : "LIVE · UPSTOX"}
        </span>
        {livePrice !== null && updatedAt !== null && (
          <span className="ml-2 text-[10px] text-slate-500">
            {new Date(updatedAt).toLocaleTimeString()}
          </span>
        )}
        {livePrice === null && error && (
          <span className="ml-2 text-[10px] text-amber-300">{error}</span>
        )}
      </td>
    </tr>
  );
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
  const [fundamentalsError, setFundamentalsError] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeTab, setActiveTab] = useState<"technicals" | "fundamentals">("fundamentals");
  const [timePeriod, setTimePeriod] = useState("60");
  const [technicalRecord, setTechnicalRecord] = useState<TechnicalRecord | null>(null);
  const [technicalLoading, setTechnicalLoading] = useState(false);
  const [technicalError, setTechnicalError] = useState("");
  const [livePriceState, setLivePriceState] = useState<LivePriceState | null>(null);

  useEffect(() => {
    let active = true;
    const loadSymbols = async () => {
      const [marketResult, fundamentalsResult] = await Promise.allSettled([
        api<Array<{ symbol: string; name?: string; sector?: string }>>("/charts/symbols"),
        api<{ symbols: Stock[] }>("/fundamentals/"),
      ]);
      if (!active) return;

      const marketSymbols = marketResult.status === "fulfilled"
        ? marketResult.value.map((item) => ({
            symbol: item.symbol,
            company_name: item.name,
            sector: item.sector,
          }))
        : [];
      const fundamentalSymbols = fundamentalsResult.status === "fulfilled"
        ? fundamentalsResult.value.symbols ?? []
        : [];
      const merged = new Map<string, Stock>();
      [...marketSymbols, ...fundamentalSymbols].forEach((item) => {
        merged.set(item.symbol, { ...merged.get(item.symbol), ...item });
      });
      setSymbols(Array.from(merged.values()).sort((a, b) => a.symbol.localeCompare(b.symbol)));
      if (merged.size === 0) setError("Could not load the stock universe.");
    };
    loadSymbols().finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedSymbol) return;
    let active = true;

    const loadResearch = async () => {
      try {
        const fundamentals = await api<FundamentalsData>(
          `/fundamentals/${encodeURIComponent(selectedSymbol)}?quarterly_limit=12&yearly_limit=10`,
        );
        if (active) {
          setData({
            symbol: selectedSymbol,
            info: fundamentals.info,
            quarterly: fundamentals.quarterly ?? [],
            yearly: fundamentals.yearly ?? [],
          });
        }
      } catch (err: unknown) {
        if (active) {
          setData({ symbol: selectedSymbol, info: null, quarterly: [], yearly: [] });
          setFundamentalsError(err instanceof Error ? err.message : "Fundamentals are unavailable.");
        }
      }

      const [marketResult, candlesResult] = await Promise.allSettled([
        api<MarketSummary>(`/charts/summary?symbol=${encodeURIComponent(selectedSymbol)}`),
        api<{ candles: Candle[] }>(`/charts/candles?symbol=${encodeURIComponent(selectedSymbol)}&timeframe=1D&limit=260`),
      ]);
      if (!active) return;
      if (marketResult.status === "fulfilled") setSummary(marketResult.value);
      if (candlesResult.status === "fulfilled") setCandles(candlesResult.value.candles ?? []);
      setLoading(false);
    };

    loadResearch().catch((err: unknown) => {
      if (active) {
        setFundamentalsError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [selectedSymbol]);

  useEffect(() => {
    if (!selectedSymbol || activeTab !== "technicals") return;
    let active = true;
    api<TechnicalRecord>(
      `/fyers/technical-indicators/${encodeURIComponent(selectedSymbol)}?time_period=${encodeURIComponent(timePeriod)}`,
    )
      .then((record) => { if (active) setTechnicalRecord(record); })
      .catch((err: unknown) => {
        if (active) setTechnicalError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { if (active) setTechnicalLoading(false); });
    return () => { active = false; };
  }, [activeTab, selectedSymbol, timePeriod]);

  useEffect(() => {
    if (!selectedSymbol || activeTab !== "technicals") return;
    let active = true;

    const loadLivePrice = async () => {
      try {
        const quote = await api<LivePriceQuote>(`/prices/ltp/${encodeURIComponent(selectedSymbol)}`);
        if (!active) return;
        if (typeof quote.ltp === "number" && Number.isFinite(quote.ltp)) {
          setLivePriceState({
            symbol: selectedSymbol,
            ltp: quote.ltp,
            updatedAt: Date.now(),
            error: "",
          });
        } else {
          setLivePriceState({
            symbol: selectedSymbol,
            ltp: null,
            updatedAt: null,
            error: "Live quote unavailable.",
          });
        }
      } catch (err: unknown) {
        if (!active) return;
        setLivePriceState({
          symbol: selectedSymbol,
          ltp: null,
          updatedAt: null,
          error: err instanceof Error ? err.message : "Live quote unavailable.",
        });
      }
    };

    void loadLivePrice();
    const intervalId = window.setInterval(() => void loadLivePrice(), 10_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [activeTab, selectedSymbol]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return symbols.filter((item) =>
      !query ||
      item.symbol.toLowerCase().includes(query) ||
      item.company_name?.toLowerCase().includes(query) ||
      item.name?.toLowerCase().includes(query),
    ).slice(0, 8);
  }, [search, symbols]);

  const selectSymbol = (symbol: string) => {
    if (selectedSymbol === symbol) {
      setSearch(symbol);
      setShowSuggestions(false);
      setActiveTab("fundamentals");
      return;
    }
    setLoading(true);
    setError("");
    setFundamentalsError("");
    setData(null);
    setSummary(null);
    setCandles([]);
    setTechnicalRecord(null);
    setTechnicalError("");
    setTechnicalLoading(false);
    setSearch(symbol);
    setShowSuggestions(false);
    setActiveTab("fundamentals");
    setSelectedSymbol(symbol);
  };

  const submitSearch = () => {
    const query = search.trim();
    if (!query) return;
    const exact = symbols.find((item) => item.symbol.toUpperCase() === query.toUpperCase());
    selectSymbol(exact?.symbol ?? filtered[0]?.symbol ?? query.toUpperCase().replace(/\s+/g, ""));
  };

  const selectedStock = symbols.find((stock) => stock.symbol === selectedSymbol);
  const info = data?.info;

  return (
    <div className="min-h-screen space-y-5 pb-10">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Stock research</div>
            <div className="mt-1 text-sm text-slate-400">Search a stock to view its technical indicators and fundamentals.</div>
          </div>
          <form
            onSubmit={(event) => { event.preventDefault(); submitSearch(); }}
            className="relative flex w-full gap-2 sm:max-w-xl"
          >
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search symbol or company"
              aria-label="Search stocks"
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500"
            />
            <button type="submit" className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
              Search
            </button>
            {showSuggestions && search.trim() && filtered.length > 0 && (
              <div className="absolute left-0 right-20 top-12 z-30 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
                {filtered.map((item) => (
                  <button
                    type="button"
                    key={item.symbol}
                    onClick={() => selectSymbol(item.symbol)}
                    className="flex w-full justify-between border-b border-slate-800 px-3 py-2 text-left last:border-0 hover:bg-slate-800"
                  >
                    <span>
                      <strong className="block text-sm text-slate-100">{item.symbol}</strong>
                      <small className="text-slate-500">{item.company_name || item.name || item.sector}</small>
                    </span>
                    <span className="text-xs text-emerald-400">Open</span>
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>
      </section>

      <main className="min-w-0">
        {!selectedSymbol ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-6 py-24 text-center">
            <h1 className="text-3xl font-semibold text-slate-100">Research a company</h1>
            <p className="mx-auto mt-3 max-w-lg text-slate-500">Search a stock to inspect its technical indicators, fundamentals, price history, and financial statements.</p>
            {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
          </div>
        ) : loading || !data ? (
          <div className="rounded-xl bg-slate-900 py-28 text-center text-slate-500">Loading stock research for {selectedSymbol}...</div>
        ) : (
          <div className="space-y-5">
            <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
                      {info?.company_name || selectedStock?.company_name || selectedStock?.name || selectedSymbol}
                    </h1>
                    <span className="rounded bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-400">NSE: {selectedSymbol}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {String(info?.sector || selectedStock?.sector || "Sector unavailable")}
                    {info?.industry ? ` · ${String(info.industry)}` : ""}
                  </p>
                </div>
                <div className="lg:text-right">
                  <div className="text-3xl font-semibold text-slate-100">{rupees(summary?.latestClose)}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {summary?.latestDate ? `Last close · ${summary.latestDate}` : "Latest market price unavailable"}
                  </div>
                </div>
              </div>
              {info && (
                <div className="mt-6 grid grid-cols-2 gap-x-5 border-t border-slate-800 pt-3 sm:grid-cols-4 lg:grid-cols-8">
                  <Metric label="Market Cap" value={rupees(info.market_cap)} />
                  <Metric label="Stock P/E" value={numeric(info.trailing_pe)} />
                  <Metric label="Book Value" value={rupees(info.book_value)} />
                  <Metric label="ROE" value={percent(info.return_on_equity)} />
                  <Metric label="ROCE" value={percent(info.return_on_capital)} />
                  <Metric label="Dividend Yield" value={percent(info.dividend_yield)} />
                  <Metric label="Debt / Equity" value={numeric(info.debt_to_equity)} />
                  <Metric label="EPS" value={rupees(info.trailing_eps, 2)} />
                </div>
              )}
            </section>

            <div role="tablist" aria-label="Stock research sections" className="flex gap-2 border-b border-slate-800">
              {(["technicals", "fundamentals"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => {
                    setActiveTab(tab);
                    if (tab === "technicals") {
                      setTechnicalRecord(null);
                      setTechnicalError("");
                      setTechnicalLoading(true);
                    }
                  }}
                  className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
                    activeTab === tab
                      ? "border-emerald-400 text-emerald-300"
                      : "border-transparent text-slate-500 hover:text-slate-200"
                  }`}
                >
                  {tab === "technicals" ? "Technicals" : "Fundamentals"}
                </button>
              ))}
            </div>

            {activeTab === "technicals" ? (
              <div className="space-y-5">
                <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-100">Technical indicators</h2>
                      <p className="mt-1 text-sm text-slate-500">Fyers technical overview for {selectedSymbol}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {TIME_PERIODS.map((period) => (
                        <button
                          key={period.value}
                          type="button"
                          onClick={() => {
                            setTimePeriod(period.value);
                            setTechnicalRecord(null);
                            setTechnicalError("");
                            setTechnicalLoading(true);
                          }}
                          className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                            timePeriod === period.value
                              ? "bg-emerald-400 text-slate-950"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                          }`}
                        >
                          {period.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
                {technicalLoading ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900 py-20 text-center text-slate-500">
                    Loading {timePeriod}-minute technical indicators…
                  </div>
                ) : technicalError ? (
                  <section className="rounded-xl border border-amber-500/30 bg-slate-900 p-6">
                    <p role="alert" className="text-sm text-amber-200">{technicalError}</p>
                    <Link href="/data-import/fyers-technicals" className="mt-4 inline-flex rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
                      Import Fyers technicals
                    </Link>
                  </section>
                ) : technicalRecord ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{technicalRecord.stock_code} · {technicalRecord.time_period} minute period</span>
                      <span>Updated {new Date(technicalRecord.updated_at).toLocaleString()}</span>
                    </div>
                    <TechnicalDataView
                      record={technicalRecord}
                      livePrice={livePriceState?.symbol === selectedSymbol ? livePriceState.ltp : null}
                      livePriceUpdatedAt={livePriceState?.symbol === selectedSymbol ? livePriceState.updatedAt : null}
                      latestClose={summary?.symbol === selectedSymbol ? summary.latestClose : undefined}
                      livePriceError={livePriceState?.symbol === selectedSymbol ? livePriceState.error : ""}
                    />
                  </>
                ) : null}
              </div>
            ) : fundamentalsError || !info ? (
              <section className="rounded-xl border border-amber-500/30 bg-slate-900 p-6">
                <h2 className="text-lg font-semibold text-slate-100">Fundamentals unavailable</h2>
                <p className="mt-2 text-sm text-slate-400">{fundamentalsError || `No fundamentals data is available for ${selectedSymbol}.`}</p>
              </section>
            ) : (
              <div className="space-y-5">
                <RatioGrid info={info} />
                <Signals info={info} />
                <section className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]">
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-semibold text-slate-100">Price chart</h2>
                        <p className="mt-1 text-sm text-slate-500">Daily price history</p>
                      </div>
                      <span className="text-sm text-slate-500">{candles.length ? `${candles.length} sessions` : "No history"}</span>
                    </div>
                    <PriceChart candles={candles} />
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                    <h2 className="text-xl font-semibold text-slate-100">52-week range</h2>
                    <div className="mt-8 flex justify-between">
                      <div>
                        <div className="text-xs text-slate-500">Low</div>
                        <div className="mt-1 font-semibold text-rose-400">{rupees(summary?.low52w)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">High</div>
                        <div className="mt-1 font-semibold text-emerald-400">{rupees(summary?.high52w)}</div>
                      </div>
                    </div>
                  </div>
                </section>
                <QuarterlyTable data={data.quarterly} />
                <YearlyTable data={data.yearly} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
