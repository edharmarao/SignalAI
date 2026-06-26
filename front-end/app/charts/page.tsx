"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { istToMs } from "@/lib/highcharts";
import { api } from "@/lib/api";
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, HistogramSeries, LineSeries, AreaSeries, BarSeries,
  type IChartApi, type ISeriesApi, type LogicalRange, type UTCTimestamp,
} from "lightweight-charts";

// ─── Types ──────────────────────────────────────────────────────────────────────
interface CandleRaw {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}
interface SymbolItem {
  symbol: string;
  bars: number;
}
interface OHLCVInfo {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  pct: number;
}
interface IndicatorDef {
  id: string;
  label: string;
  cat: "overlay" | "oscillator";
  hcType: string;
  color: string;
  params: Record<string, unknown>;
  isOsc: boolean;
}
interface IndicatorInstance {
  instanceId: string;
  defId: string;
  params: Record<string, unknown>;
  color: string;
}
type TF = "5m" | "15m" | "1D" | "1W" | "1M" | "1Y";
type TP = "1D" | "5D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "2Y" | "5Y" | "ALL";
interface DrawingTool { id: string; icon: string; label: string; clicks: number }
interface StockChartProps {
  candles: CandleRaw[];
  symbol: string;
  chartType: string;
  instances: IndicatorInstance[];
  timePeriod: TP;
  onHover: (v: OHLCVInfo | null) => void;
  activeToolRef: React.MutableRefObject<string>;
  pendingClickRef: React.MutableRefObject<{ x: number; y: number; x2?: number; y2?: number } | null>;
  chartInstanceRef: React.MutableRefObject<IChartApi | null>;
}

// ─── Constants ──────────────────────────────────────────────────────────────────
const CANDLE_PERIODS: { key: TF; label: string }[] = [
  { key: "5m", label: "5m" },
  { key: "15m", label: "15m" },
  { key: "1D", label: "1D" },
  { key: "1W", label: "W" },
  { key: "1M", label: "M" },
  { key: "1Y", label: "Y" },
];

const TIME_PERIODS: { key: TP; label: string; days: number }[] = [
  { key: "1D", label: "1D", days: 1 },
  { key: "5D", label: "5D", days: 5 },
  { key: "1W", label: "1W", days: 7 },
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 180 },
  { key: "YTD", label: "YTD", days: 0 },
  { key: "1Y", label: "1Y", days: 365 },
  { key: "2Y", label: "2Y", days: 730 },
  { key: "5Y", label: "5Y", days: 1825 },
  { key: "ALL", label: "ALL", days: 99999 },
];

const CHART_TYPES = [
  { value: "candlestick", label: "Candlestick" },
  { value: "candlestick-volwidth", label: "Vol Width Candle" },
  { value: "ohlc", label: "OHLC" },
  { value: "line", label: "Line" },
  { value: "heikinashi", label: "HeikinAshi" },
  { value: "hollowcandlestick", label: "Hollow Candle" },
];

const DRAWING_TOOLS: DrawingTool[] = [
  { id: "cursor", icon: "↖", label: "Cursor", clicks: 0 },
  { id: "trendline", icon: "/", label: "Trend Line", clicks: 2 },
  { id: "hline", icon: "─", label: "Horizontal Line", clicks: 1 },
  { id: "vline", icon: "│", label: "Vertical Line", clicks: 1 },
  { id: "ray", icon: "→", label: "Ray", clicks: 2 },
  { id: "rect", icon: "□", label: "Rectangle", clicks: 2 },
  { id: "label", icon: "T", label: "Label", clicks: 1 },
  { id: "fib", icon: "≋", label: "Fibonacci", clicks: 2 },
  { id: "pitchfork", icon: "⑂", label: "Pitchfork", clicks: 3 },
  { id: "erase", icon: "⌦", label: "Clear All", clicks: 0 },
];

const DUMMY_SYMBOLS: SymbolItem[] = [
  { symbol: "RELIANCE", bars: 1200 },
  { symbol: "TCS", bars: 1200 },
  { symbol: "INFY", bars: 1200 },
  { symbol: "HDFCBANK", bars: 1200 },
  { symbol: "WIPRO", bars: 1200 },
];

const INDICATOR_CATALOG: IndicatorDef[] = [
  { id: "ema",      label: "EMA",             cat: "overlay",    hcType: "ema",             color: "#fbbf24", params: { period: 20 },                                        isOsc: false },
  { id: "sma",      label: "SMA",             cat: "overlay",    hcType: "sma",             color: "#06b6d4", params: { period: 20 },                                        isOsc: false },
  { id: "wma",      label: "WMA",             cat: "overlay",    hcType: "wma",             color: "#34d399", params: { period: 20 },                                        isOsc: false },
  { id: "dema",     label: "DEMA",            cat: "overlay",    hcType: "dema",            color: "#6ee7b7", params: { period: 20 },                                        isOsc: false },
  { id: "tema",     label: "TEMA",            cat: "overlay",    hcType: "tema",            color: "#a7f3d0", params: { period: 20 },                                        isOsc: false },
  { id: "bb",       label: "Bollinger Bands", cat: "overlay",    hcType: "bb",              color: "#64748b", params: { period: 20, standardDeviation: 2 },                  isOsc: false },
  { id: "psar",     label: "Parabolic SAR",   cat: "overlay",    hcType: "psar",            color: "#fb7185", params: {},                                                     isOsc: false },
  { id: "supertrend",label:"Supertrend",      cat: "overlay",    hcType: "supertrend",      color: "#4ade80", params: { period: 10, multiplier: 3 },                         isOsc: false },
  { id: "vwap",     label: "VWAP",            cat: "overlay",    hcType: "vwap",            color: "#c084fc", params: {},                                                     isOsc: false },
  { id: "ikh",      label: "Ichimoku",        cat: "overlay",    hcType: "ikh",             color: "#38bdf8", params: {},                                                     isOsc: false },
  { id: "pc",       label: "Price Channel",   cat: "overlay",    hcType: "pc",              color: "#5eead4", params: { period: 20 },                                        isOsc: false },
  { id: "keltner",  label: "Keltner Ch.",     cat: "overlay",    hcType: "keltnerchannels", color: "#7c3aed", params: { period: 20, multiplierATR: 2 },                      isOsc: false },
  { id: "zigzag",   label: "Zigzag",          cat: "overlay",    hcType: "zigzag",          color: "#f97316", params: { lowThreshold: 5, highThreshold: 5 },                isOsc: false },
  { id: "pivots",   label: "Pivot Points",    cat: "overlay",    hcType: "pivotpoints",     color: "#94a3b8", params: { algorithm: "standard" },                             isOsc: false },
  { id: "rsi",      label: "RSI",             cat: "oscillator", hcType: "rsi",             color: "#7c5cfc", params: { period: 14, overbought: 70, oversold: 30 },               isOsc: true  },
  { id: "macd",     label: "MACD",            cat: "oscillator", hcType: "macd",            color: "#10b981", params: { shortPeriod: 12, longPeriod: 26, signalPeriod: 9 },  isOsc: true  },
  { id: "stoch",    label: "Stochastic",      cat: "oscillator", hcType: "stochastic",      color: "#ec4899", params: { periods: [14, 3] },                                  isOsc: true  },
  { id: "sstoch",   label: "Slow Stoch",      cat: "oscillator", hcType: "slowstochastic",  color: "#f472b6", params: { periods: [14, 3] },                                  isOsc: true  },
  { id: "cci",      label: "CCI",             cat: "oscillator", hcType: "cci",             color: "#fb923c", params: { period: 20 },                                        isOsc: true  },
  { id: "mom",      label: "Momentum",        cat: "oscillator", hcType: "momentum",        color: "#facc15", params: { period: 10 },                                        isOsc: true  },
  { id: "obv",      label: "OBV",             cat: "oscillator", hcType: "obv",             color: "#4ade80", params: {},                                                     isOsc: true  },
  { id: "willr",    label: "Williams %R",     cat: "oscillator", hcType: "williamsr",       color: "#f87171", params: { period: 14 },                                        isOsc: true  },
  { id: "atr",      label: "ATR",             cat: "oscillator", hcType: "atr",             color: "#c084fc", params: { period: 14 },                                        isOsc: true  },
  { id: "roc",      label: "ROC",             cat: "oscillator", hcType: "roc",             color: "#86efac", params: { period: 10 },                                        isOsc: true  },
  { id: "aroon",    label: "Aroon",           cat: "oscillator", hcType: "aroon",           color: "#38bdf8", params: { period: 25 },                                        isOsc: true  },
  { id: "ao",       label: "Awesome Osc",     cat: "oscillator", hcType: "ao",              color: "#a3e635", params: {},                                                     isOsc: true  },
  { id: "mfi",      label: "MFI",             cat: "oscillator", hcType: "mfi",             color: "#fdba74", params: { period: 14 },                                        isOsc: true  },
  { id: "dmi",      label: "DMI / ADX",       cat: "oscillator", hcType: "dmi",             color: "#67e8f9", params: { period: 14 },                                        isOsc: true  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────
function fmtVol(v: number): string {
  if (v >= 1e7) return (v / 1e7).toFixed(2) + "Cr";
  if (v >= 1e5) return (v / 1e5).toFixed(2) + "L";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(v);
}

function fmtNum(v: number): string {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Generates a display label reflecting the actual params (e.g. "RSI (10)" after user changes period)
function indicatorLabel(def: IndicatorDef, customParams?: Record<string, unknown>): string {
  const p = { ...def.params, ...(customParams ?? {}) };
  const base = def.label.replace(/\s*\(.*\)$/, ""); // strip existing "(N)"
  if (p.period !== undefined && p.multiplier !== undefined) return `${base} (${p.period}, ${p.multiplier})`;
  if (p.shortPeriod !== undefined) return `${base} (${p.shortPeriod},${p.longPeriod},${p.signalPeriod})`;
  if (p.period !== undefined) return `${base} (${p.period})`;
  if (p.standardDeviation !== undefined) return `${base} (${p.period ?? ""}, ${p.standardDeviation})`;
  return base;
}

const TV = {
  bg: "#131722",
  up: "#26a69a",
  down: "#ef5350",
  upVol: "rgba(38,166,154,0.5)",
  downVol: "rgba(239,83,80,0.5)",
  grid: "#1e2030",
  border: "#2a2e39",
  text: "#d1d4dc",
  axisLabel: "#787b86",
};

interface CalcPoint { time: UTCTimestamp; value: number; }
interface ChartDrawing { id: string; kind: string; points: Array<{ time: UTCTimestamp; price: number }>; text?: string; }

function msToSec(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

function baseChartOptions(el: HTMLDivElement, showTimeScale = true) {
  return {
    width: el.clientWidth,
    height: el.clientHeight,
    layout: {
      background: { type: ColorType.Solid, color: TV.bg },
      textColor: TV.text,
      fontFamily: "'Inter', ui-sans-serif, system-ui",
      fontSize: 12,
    },
    grid: {
      vertLines: { color: TV.grid },
      horzLines: { color: TV.grid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: "#758696", width: 1 as const, labelBackgroundColor: "#1e222d" },
      horzLine: { color: "#758696", width: 1 as const, labelBackgroundColor: "#1e222d" },
    },
    rightPriceScale: { borderColor: TV.border },
    leftPriceScale: { visible: false },
    timeScale: {
      borderColor: TV.border,
      timeVisible: true,
      secondsVisible: false,
      visible: showTimeScale,
      tickMarkFormatter: (time: UTCTimestamp) => new Date((time as number) * 1000).toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
      }),
    },
    localization: {
      timeFormatter: (time: UTCTimestamp) => new Date((time as number) * 1000).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }),
    },
    handleScroll: { mouseWheel: true, pressedMouseMove: true },
    handleScale: { mouseWheel: true, pinch: true },
  };
}

function sma(data: number[], period: number): number[] {
  return data.map((_, i) => i < period - 1 ? NaN : data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
}

function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  data.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}

function wma(data: number[], period: number): number[] {
  const denom = period * (period + 1) / 2;
  return data.map((_, i) => {
    if (i < period - 1) return NaN;
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - period + 1 + j] * (j + 1);
    return sum / denom;
  });
}

function dema(data: number[], period: number): number[] {
  const e1 = ema(data, period);
  const e2 = ema(e1, period);
  return e1.map((v, i) => 2 * v - e2[i]);
}

function tema(data: number[], period: number): number[] {
  const e1 = ema(data, period);
  const e2 = ema(e1, period);
  const e3 = ema(e2, period);
  return e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]);
}

function rsi(data: number[], period = 14): number[] {
  if (data.length <= period) return data.map(() => NaN);
  const out: number[] = new Array(period).fill(NaN);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    avgGain += Math.max(diff, 0) / period;
    avgLoss += Math.max(-diff, 0) / period;
  }
  out.push(100 - 100 / (1 + avgGain / Math.max(avgLoss, 1e-10)));
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    out.push(100 - 100 / (1 + avgGain / Math.max(avgLoss, 1e-10)));
  }
  return out.slice(0, data.length);
}

function macd(data: number[], fast = 12, slow = 26, sig = 9) {
  const fastEma = ema(data, fast);
  const slowEma = ema(data, slow);
  const ml = fastEma.map((v, i) => v - slowEma[i]);
  const sl = ema(ml, sig);
  const hist = ml.map((v, i) => v - sl[i]);
  return { ml, sl, hist };
}

function bbands(data: number[], period = 20, stdDev = 2) {
  const mid = sma(data, period);
  const upper = mid.map((m, i) => {
    if (isNaN(m)) return NaN;
    const sample = data.slice(i - period + 1, i + 1);
    const variance = sample.reduce((acc, v) => acc + (v - m) ** 2, 0) / period;
    return m + stdDev * Math.sqrt(variance);
  });
  const lower = mid.map((m, i) => {
    if (isNaN(m)) return NaN;
    const sample = data.slice(i - period + 1, i + 1);
    const variance = sample.reduce((acc, v) => acc + (v - m) ** 2, 0) / period;
    return m - stdDev * Math.sqrt(variance);
  });
  return { upper, mid, lower };
}

function vwapCalc(candles: CandleRaw[]): number[] {
  let cumPV = 0;
  let cumV = 0;
  return candles.map((c) => {
    const tp = (c.h + c.l + c.c) / 3;
    cumPV += tp * c.v;
    cumV += c.v;
    return cumV ? cumPV / cumV : NaN;
  });
}

function atrCalc(candles: CandleRaw[], period = 14): number[] {
  const tr = candles.map((c, i) => i === 0 ? c.h - c.l : Math.max(c.h - c.l, Math.abs(c.h - candles[i - 1].c), Math.abs(c.l - candles[i - 1].c)));
  const atr: number[] = [];
  tr.forEach((v, i) => {
    if (i < period - 1) atr.push(NaN);
    else if (i === period - 1) atr.push(tr.slice(0, period).reduce((a, b) => a + b, 0) / period);
    else atr.push((atr[i - 1] * (period - 1) + v) / period);
  });
  return atr;
}

function supertrendCalc(candles: CandleRaw[], period = 10, mult = 3): number[] {
  const atr = atrCalc(candles, period);
  const out: number[] = [];
  let dir = 1;
  for (let i = 0; i < candles.length; i++) {
    if (isNaN(atr[i])) { out.push(NaN); continue; }
    const hl2 = (candles[i].h + candles[i].l) / 2;
    const upper = hl2 + mult * atr[i];
    const lower = hl2 - mult * atr[i];
    if (i === 0 || isNaN(out[i - 1])) { out.push(lower); continue; }
    if (candles[i].c > out[i - 1]) dir = 1;
    else if (candles[i].c < out[i - 1]) dir = -1;
    out.push(dir === 1 ? lower : upper);
  }
  return out;
}

function stochCalc(candles: CandleRaw[], period = 14, smooth = 3) {
  const k = candles.map((c, i) => {
    if (i < period - 1) return NaN;
    const slice = candles.slice(i - period + 1, i + 1);
    const highest = Math.max(...slice.map((x) => x.h));
    const lowest = Math.min(...slice.map((x) => x.l));
    return highest === lowest ? 0 : ((c.c - lowest) / (highest - lowest)) * 100;
  });
  const d = sma(k.map((v) => isNaN(v) ? 0 : v), smooth).map((v, i) => isNaN(k[i]) ? NaN : v);
  return { k, d };
}

function cciCalc(candles: CandleRaw[], period = 20): number[] {
  const tp = candles.map((c) => (c.h + c.l + c.c) / 3);
  const avg = sma(tp, period);
  return tp.map((v, i) => {
    if (i < period - 1 || isNaN(avg[i])) return NaN;
    const slice = tp.slice(i - period + 1, i + 1);
    const md = slice.reduce((acc, n) => acc + Math.abs(n - avg[i]), 0) / period;
    return md ? (v - avg[i]) / (0.015 * md) : 0;
  });
}

function momentumCalc(data: number[], period = 10): number[] {
  return data.map((v, i) => i < period ? NaN : v - data[i - period]);
}

function obvCalc(candles: CandleRaw[]): number[] {
  let obv = 0;
  return candles.map((c, i) => {
    if (i === 0) return 0;
    if (c.c > candles[i - 1].c) obv += c.v;
    else if (c.c < candles[i - 1].c) obv -= c.v;
    return obv;
  });
}

function willrCalc(candles: CandleRaw[], period = 14): number[] {
  return candles.map((c, i) => {
    if (i < period - 1) return NaN;
    const slice = candles.slice(i - period + 1, i + 1);
    const hh = Math.max(...slice.map((x) => x.h));
    const ll = Math.min(...slice.map((x) => x.l));
    return hh === ll ? 0 : ((hh - c.c) / (hh - ll)) * -100;
  });
}

function rocCalc(data: number[], period = 10): number[] {
  return data.map((v, i) => i < period || data[i - period] === 0 ? NaN : ((v - data[i - period]) / data[i - period]) * 100);
}

function aroonCalc(candles: CandleRaw[], period = 25) {
  const up: number[] = [];
  const down: number[] = [];
  candles.forEach((_, i) => {
    if (i < period - 1) { up.push(NaN); down.push(NaN); return; }
    const slice = candles.slice(i - period + 1, i + 1);
    let hiIdx = 0;
    let loIdx = 0;
    slice.forEach((c, idx) => {
      if (c.h >= slice[hiIdx].h) hiIdx = idx;
      if (c.l <= slice[loIdx].l) loIdx = idx;
    });
    up.push(((period - 1 - (slice.length - 1 - hiIdx)) / (period - 1)) * 100);
    down.push(((period - 1 - (slice.length - 1 - loIdx)) / (period - 1)) * 100);
  });
  return { up, down };
}

function aoCalc(candles: CandleRaw[]): number[] {
  const mid = candles.map((c) => (c.h + c.l) / 2);
  const s5 = sma(mid, 5);
  const s34 = sma(mid, 34);
  return mid.map((_, i) => s5[i] - s34[i]);
}

function mfiCalc(candles: CandleRaw[], period = 14): number[] {
  const tp = candles.map((c) => (c.h + c.l + c.c) / 3);
  const flow = candles.map((c, i) => tp[i] * c.v * (i === 0 ? 0 : tp[i] >= tp[i - 1] ? 1 : -1));
  return candles.map((_, i) => {
    if (i < period) return NaN;
    const slice = flow.slice(i - period + 1, i + 1);
    const pos = slice.filter((v) => v > 0).reduce((a, b) => a + b, 0);
    const neg = Math.abs(slice.filter((v) => v < 0).reduce((a, b) => a + b, 0));
    return neg ? 100 - 100 / (1 + pos / neg) : 100;
  });
}

function dmiCalc(candles: CandleRaw[], period = 14) {
  const plusDM = candles.map((c, i) => {
    if (i === 0) return 0;
    const upMove = c.h - candles[i - 1].h;
    const downMove = candles[i - 1].l - c.l;
    return upMove > downMove && upMove > 0 ? upMove : 0;
  });
  const minusDM = candles.map((c, i) => {
    if (i === 0) return 0;
    const upMove = c.h - candles[i - 1].h;
    const downMove = candles[i - 1].l - c.l;
    return downMove > upMove && downMove > 0 ? downMove : 0;
  });
  const roll = (arr: number[]) => {
    const out: number[] = [];
    arr.forEach((v, i) => {
      if (i < period - 1) out.push(NaN);
      else if (i === period - 1) out.push(arr.slice(0, period).reduce((a, b) => a + b, 0));
      else out.push(out[i - 1] - out[i - 1] / period + v);
    });
    return out;
  };
  const pdm = roll(plusDM);
  const mdm = roll(minusDM);
  const atr = atrCalc(candles, period);
  const plus = atr.map((a, i) => isNaN(a) || !pdm[i] ? NaN : (pdm[i] / (a * period)) * 100);
  const minus = atr.map((a, i) => isNaN(a) || !mdm[i] ? NaN : (mdm[i] / (a * period)) * 100);
  const dx = plus.map((p, i) => isNaN(p) || isNaN(minus[i]) || p + minus[i] === 0 ? NaN : (Math.abs(p - minus[i]) / (p + minus[i])) * 100);
  const adx = ema(dx.map((v) => isNaN(v) ? 0 : v), period).map((v, i) => isNaN(dx[i]) ? NaN : v);
  return { plus, minus, adx };
}

function psarCalc(candles: CandleRaw[], step = 0.02, maxStep = 0.2): number[] {
  if (!candles.length) return [];
  let bull = true;
  let af = step;
  let ep = candles[0].h;
  let sar = candles[0].l;
  const out = [sar];
  for (let i = 1; i < candles.length; i++) {
    sar = sar + af * (ep - sar);
    const c = candles[i];
    if (bull) {
      sar = Math.min(sar, candles[i - 1].l, candles[Math.max(i - 2, 0)].l);
      if (c.l < sar) {
        bull = false;
        sar = ep;
        ep = c.l;
        af = step;
      } else if (c.h > ep) {
        ep = c.h;
        af = Math.min(af + step, maxStep);
      }
    } else {
      sar = Math.max(sar, candles[i - 1].h, candles[Math.max(i - 2, 0)].h);
      if (c.h > sar) {
        bull = true;
        sar = ep;
        ep = c.h;
        af = step;
      } else if (c.l < ep) {
        ep = c.l;
        af = Math.min(af + step, maxStep);
      }
    }
    out.push(sar);
  }
  return out;
}

function priceChannelCalc(candles: CandleRaw[], period = 20) {
  const upper = candles.map((_, i) => i < period - 1 ? NaN : Math.max(...candles.slice(i - period + 1, i + 1).map((c) => c.h)));
  const lower = candles.map((_, i) => i < period - 1 ? NaN : Math.min(...candles.slice(i - period + 1, i + 1).map((c) => c.l)));
  return { upper, lower };
}

function keltnerCalc(candles: CandleRaw[], period = 20, mult = 2) {
  const middle = ema(candles.map((c) => c.c), period);
  const atr = atrCalc(candles, period);
  return {
    middle,
    upper: middle.map((m, i) => isNaN(m) || isNaN(atr[i]) ? NaN : m + mult * atr[i]),
    lower: middle.map((m, i) => isNaN(m) || isNaN(atr[i]) ? NaN : m - mult * atr[i]),
  };
}

function ichimokuCalc(candles: CandleRaw[]) {
  const rollingMid = (period: number) => candles.map((_, i) => {
    if (i < period - 1) return NaN;
    const slice = candles.slice(i - period + 1, i + 1);
    return (Math.max(...slice.map((c) => c.h)) + Math.min(...slice.map((c) => c.l))) / 2;
  });
  const tenkan = rollingMid(9);
  const kijun = rollingMid(26);
  const senkouA = tenkan.map((v, i) => isNaN(v) || isNaN(kijun[i]) ? NaN : (v + kijun[i]) / 2);
  const senkouB = rollingMid(52);
  const chikou = candles.map((c) => c.c);
  return { tenkan, kijun, senkouA, senkouB, chikou };
}

function heikinAshiCalc(candles: CandleRaw[]): CandleRaw[] {
  return candles.map((c, i) => {
    const close = (c.o + c.h + c.l + c.c) / 4;
    const open = i === 0 ? (c.o + c.c) / 2 : ((candles[i - 1] as any).__haOpen + (candles[i - 1] as any).__haClose) / 2;
    const high = Math.max(c.h, open, close);
    const low = Math.min(c.l, open, close);
    const out = { ...c, o: open, h: high, l: low, c: close } as CandleRaw & { __haOpen?: number; __haClose?: number };
    out.__haOpen = open;
    out.__haClose = close;
    return out;
  }).map(({ __haOpen, __haClose, ...rest }) => rest as CandleRaw);
}

function calcPivots(candles: CandleRaw[]) {
  const last = candles[candles.length - 1];
  if (!last) return null;
  const pp = (last.h + last.l + last.c) / 3;
  return { pp, r1: 2 * pp - last.l, s1: 2 * pp - last.h };
}

function asLinePoints(candles: CandleRaw[], values: number[]): CalcPoint[] {
  return candles.map((c, i) => ({ time: msToSec(c.t), value: values[i] })).filter((p) => Number.isFinite(p.value));
}

// ─── Sub-components ──────────────────────────────────────────────────────────────

function DrawingToolbar({ activeTool, pendingClick, onSelect }: {
  activeTool: string;
  pendingClick: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-2 border-r border-[#1a2130] shrink-0" style={{ width: 44, backgroundColor: "#0a0e17" }}>
      {DRAWING_TOOLS.map((t) => (
        <button
          key={t.id}
          title={t.label}
          onClick={() => onSelect(t.id)}
          className={`relative w-8 h-8 flex items-center justify-center rounded text-sm transition-colors ${
            activeTool === t.id
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          <span style={{ fontSize: t.id === "pitchfork" ? "13px" : "15px" }}>{t.icon}</span>
          {pendingClick && activeTool === t.id && t.clicks > 1 && (
            <span className="absolute top-0 right-0 w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          )}
        </button>
      ))}
    </div>
  );
}

function IndicatorPanel({ onAdd, onClose }: {
  onAdd: (defId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return INDICATOR_CATALOG.filter((d) => d.label.toLowerCase().includes(q));
  }, [search]);
  const overlays = filtered.filter((d) => d.cat === "overlay");
  const oscs = filtered.filter((d) => d.cat === "oscillator");

  return (
    <div
      className="absolute top-full left-0 z-50 mt-1 rounded-lg border border-[#1e293b] shadow-2xl overflow-hidden"
      style={{ width: 280, maxHeight: 480, backgroundColor: "#0e1520" }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e293b]">
        <span className="text-xs font-semibold text-slate-300">Indicators</span>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-sm">✕</button>
      </div>
      <div className="px-3 py-2 border-b border-[#1e293b]">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="w-full bg-[#1e293b] text-slate-200 text-xs rounded px-2 py-1.5 outline-none placeholder-slate-500 border border-[#334155] focus:border-blue-600"
        />
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
        {overlays.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Overlays</div>
            {overlays.map((d) => (
              <button
                key={d.id}
                onClick={() => onAdd(d.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#1e293b] text-left"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-xs text-slate-300 flex-1">{d.label}</span>
              </button>
            ))}
          </>
        )}
        {oscs.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Oscillators</div>
            {oscs.map((d) => (
              <button
                key={d.id}
                onClick={() => onAdd(d.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#1e293b] text-left"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-xs text-slate-300 flex-1">{d.label}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function OHLCVBar({ symbol, tf, ohlcv }: { symbol: string; tf: string; ohlcv: OHLCVInfo | null }) {
  if (!ohlcv) return <div className="flex-1 text-slate-500 text-xs">{symbol} · {tf}</div>;
  const pos = ohlcv.pct >= 0;
  return (
    <div className="flex items-center gap-3 text-xs flex-1 flex-wrap">
      <span className="font-semibold text-slate-200">{symbol}</span>
      <span className="text-slate-500">{tf}</span>
      <span className="text-slate-400">O: <span className="text-slate-200">{fmtNum(ohlcv.o)}</span></span>
      <span className="text-slate-400">H: <span className="text-green-400">{fmtNum(ohlcv.h)}</span></span>
      <span className="text-slate-400">L: <span className="text-red-400">{fmtNum(ohlcv.l)}</span></span>
      <span className="text-slate-400">C: <span className="text-slate-200">{fmtNum(ohlcv.c)}</span></span>
      <span className="text-slate-400">V: <span className="text-slate-200">{fmtVol(ohlcv.v)}</span></span>
      <span className={pos ? "text-green-400" : "text-red-400"}>
        {pos ? "+" : ""}{ohlcv.pct.toFixed(1)}%
      </span>
    </div>
  );
}

function TimePeriodBar({ value, onChange, chartRef, candles }: {
  value: TP;
  onChange: (v: TP) => void;
  chartRef: React.MutableRefObject<IChartApi | null>;
  candles: CandleRaw[];
}) {
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  function applyCustomRange() {
    if (!chartRef.current || !customFrom) return;
    const from = msToSec(istToMs(customFrom + " 00:00:00"));
    const to = msToSec(customTo ? istToMs(customTo + " 23:59:59") : (candles[candles.length - 1]?.t ?? Date.now()));
    chartRef.current.timeScale().setVisibleRange({ from, to });
  }

  function handlePeriod(key: TP) {
    onChange(key);
    const chart = chartRef.current;
    const last = candles[candles.length - 1];
    if (!chart || !last) return;
    const tp = TIME_PERIODS.find((p) => p.key === key)!;
    const to = msToSec(last.t);
    if (tp.days >= 9999) {
      chart.timeScale().resetTimeScale();
      return;
    }
    if (tp.key === "YTD") {
      const lastDate = new Date(last.t);
      const from = msToSec(new Date(lastDate.getFullYear(), 0, 1).getTime());
      chart.timeScale().setVisibleRange({ from, to });
      return;
    }
    const from = msToSec(last.t - tp.days * 86400000);
    chart.timeScale().setVisibleRange({ from, to });
  }

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-t border-[#1a2130] shrink-0 flex-wrap">
      {TIME_PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => handlePeriod(p.key)}
          className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
            value === p.key
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        >
          {p.label}
        </button>
      ))}
      <div className="ml-auto flex items-center gap-1.5">
        <input
          type="date"
          value={customFrom}
          onChange={(e) => setCustomFrom(e.target.value)}
          className="bg-[#1e293b] text-slate-300 text-[11px] rounded px-1.5 py-0.5 border border-[#334155] focus:border-blue-600 outline-none"
        />
        <span className="text-slate-500 text-xs">—</span>
        <input
          type="date"
          value={customTo}
          onChange={(e) => setCustomTo(e.target.value)}
          className="bg-[#1e293b] text-slate-300 text-[11px] rounded px-1.5 py-0.5 border border-[#334155] focus:border-blue-600 outline-none"
        />
        <button
          onClick={applyCustomRange}
          className="px-2 py-0.5 rounded text-[11px] bg-blue-700 hover:bg-blue-600 text-white"
        >
          Go
        </button>
      </div>
    </div>
  );
}

function SymbolDropdown({ symbols, selected, onSelect }: {
  symbols: SymbolItem[];
  selected: string;
  onSelect: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = symbols.filter((s) => s.symbol.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1e293b] hover:bg-[#253347] text-slate-200 text-sm font-semibold border border-[#334155] transition-colors"
      >
        {selected}
        <span className="text-slate-400 text-xs">▾</span>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 z-50 mt-1 rounded-lg border border-[#1e293b] shadow-2xl overflow-hidden"
          style={{ width: 200, maxHeight: 340, backgroundColor: "#0e1520" }}
        >
          <div className="p-2 border-b border-[#1e293b]">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search symbol…"
              className="w-full bg-[#1e293b] text-slate-200 text-xs rounded px-2 py-1.5 outline-none placeholder-slate-500 border border-[#334155] focus:border-blue-600"
            />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
            {filtered.map((s) => (
              <button
                key={s.symbol}
                onClick={() => { onSelect(s.symbol); setOpen(false); setSearch(""); }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-[#1e293b] flex items-center justify-between ${
                  s.symbol === selected ? "text-blue-400" : "text-slate-300"
                }`}
              >
                <span className="font-medium">{s.symbol}</span>
                <span className="text-slate-500">{s.bars?.toLocaleString()} bars</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WatchlistSlideOver({ symbols, selected, onSelect, onClose }: {
  symbols: SymbolItem[];
  selected: string;
  onSelect: (s: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-0 h-full z-40 flex" style={{ width: 200 }}>
      <div className="flex-1 flex flex-col border-l border-[#1e293b]" style={{ backgroundColor: "#0a0e17" }}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e293b]">
          <span className="text-xs font-semibold text-slate-300">Watchlist</span>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-sm">✕</button>
        </div>
        <div className="overflow-y-auto flex-1">
          {symbols.map((s) => (
            <button
              key={s.symbol}
              onClick={() => { onSelect(s.symbol); onClose(); }}
              className={`w-full text-left px-3 py-2.5 border-b border-[#1a2130] hover:bg-[#1e293b] transition-colors ${
                s.symbol === selected ? "bg-[#1e293b]" : ""
              }`}
            >
              <div className={`text-xs font-semibold ${s.symbol === selected ? "text-blue-400" : "text-slate-200"}`}>{s.symbol}</div>
              <div className="text-[10px] text-slate-500">{s.bars?.toLocaleString()} bars</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Indicator Settings Modal ────────────────────────────────────────────────────
function IndicatorSettingsModal({ def, currentParams, currentColor, onSave, onClose }: {
  def: IndicatorDef;
  currentParams: Record<string, unknown>;
  currentColor: string;
  onSave: (params: Record<string, unknown>, color: string) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(currentParams).map(([k, v]) => [k, String(v)]))
  );
  const [color, setColor] = useState(currentColor);

  function handleSave() {
    const parsed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      const n = Number(v);
      parsed[k] = isNaN(n) ? v : n;
    }
    onSave(parsed, color);
    onClose();
  }

  const PARAM_LABELS: Record<string, string> = {
    period: "Period", multiplier: "Multiplier", standardDeviation: "Std Dev",
    shortPeriod: "Fast Period", longPeriod: "Slow Period", signalPeriod: "Signal Period",
    multiplierATR: "ATR Multiplier", lowThreshold: "Low Threshold", highThreshold: "High Threshold",
    algorithm: "Algorithm", overbought: "Overbought Level", oversold: "Oversold Level",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl shadow-2xl w-80 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-slate-100">{def.label}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">{def.cat} settings</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">✕</button>
        </div>
        <div className="space-y-3">
          {/* Color picker */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-[#334155] bg-transparent p-0.5"
              />
              <span className="text-xs text-slate-400 font-mono">{color}</span>
            </div>
          </div>
          {Object.entries(values).map(([key, val]) => (
            <div key={key}>
              <label className="block text-[11px] text-slate-400 mb-1">{PARAM_LABELS[key] ?? key}</label>
              <input
                type={isNaN(Number(val)) ? "text" : "number"}
                value={val as string}
                onChange={(e) => setValues((p) => ({ ...p, [key]: e.target.value }))}
                className="w-full bg-[#1e293b] border border-[#334155] rounded-md px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-3 py-1.5 text-xs text-slate-400 bg-[#1e293b] hover:bg-[#273449] rounded-md transition-colors">Cancel</button>
          <button onClick={handleSave} className="flex-1 px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors font-medium">Apply</button>
        </div>
      </div>
    </div>
  );
}

// ─── StockChart ──────────────────────────────────────────────────────────────────
function StockChart({
  candles, symbol, chartType, instances, timePeriod, onHover,
  activeToolRef, pendingClickRef, chartInstanceRef,
}: StockChartProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const paneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const chartsRef = useRef<Record<string, IChartApi>>({});
  const callbackRef = useRef(onHover);
  const priceLinesRef = useRef<any[]>([]);
  const drawingsRef = useRef<ChartDrawing[]>([]);
  const [drawVersion, setDrawVersion] = useState(0);

  const overlayInstances = useMemo(
    () => instances.filter((inst) => !INDICATOR_CATALOG.find((d) => d.id === inst.defId)?.isOsc),
    [instances]
  );
  const oscInstances = useMemo(
    () => instances.filter((inst) => INDICATOR_CATALOG.find((d) => d.id === inst.defId)?.isOsc),
    [instances]
  );

  useEffect(() => { callbackRef.current = onHover; }, [onHover]);
  void timePeriod;

  const redrawSvg = useCallback(() => setDrawVersion((v) => v + 1), []);

  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl || candles.length === 0) return;

    Object.values(chartsRef.current).forEach((chart: any) => chart.remove());
    chartsRef.current = {};
    chartInstanceRef.current = null;
    priceLinesRef.current = [];

    const sourceCandles = chartType === "heikinashi" ? heikinAshiCalc(candles) : candles;
    const candleMap = new Map(sourceCandles.map((c) => [msToSec(c.t) as number, c]));
    const closes = sourceCandles.map((c) => c.c);

    const mainChart = createChart(mainEl, baseChartOptions(mainEl, oscInstances.length === 0));
    chartsRef.current.main = mainChart;
    chartInstanceRef.current = mainChart;
    (chartInstanceRef.current as any).__containerEl = rootRef.current;

    let primarySeries: ISeriesApi<any>;
    if (chartType === "line") {
      const series = mainChart.addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 2,
      });
      series.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.28 } });
      series.setData(sourceCandles.map((c) => ({ time: msToSec(c.t), value: c.c })));
      primarySeries = series as ISeriesApi<any>;
    } else if (chartType === "ohlc") {
      const series = mainChart.addSeries(BarSeries, {
        upColor: TV.up,
        downColor: TV.down,
      });
      series.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.28 } });
      series.setData(sourceCandles.map((c) => ({ time: msToSec(c.t), open: c.o, high: c.h, low: c.l, close: c.c })));
      primarySeries = series as ISeriesApi<any>;
    } else {
      const series = mainChart.addSeries(CandlestickSeries, {
        upColor: TV.up,
        downColor: TV.down,
        borderUpColor: TV.up,
        borderDownColor: TV.down,
        wickUpColor: TV.up,
        wickDownColor: TV.down,
      });
      series.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.28 } });
      series.setData(sourceCandles.map((c) => ({ time: msToSec(c.t), open: c.o, high: c.h, low: c.l, close: c.c })));
      primarySeries = series as ISeriesApi<any>;
    }
    (chartInstanceRef.current as any).__primarySeries = primarySeries;

    const volSeries = mainChart.addSeries(HistogramSeries, {
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
    });
    mainChart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volSeries.setData(sourceCandles.map((c) => ({
      time: msToSec(c.t),
      value: c.v,
      color: c.c >= c.o ? TV.upVol : TV.downVol,
    })));

    const addLine = (values: number[], color: string, lineWidth: 1 | 2 = 2) => {
      const line = mainChart.addSeries(LineSeries, { color, lineWidth, lastValueVisible: false, priceLineVisible: false });
      line.setData(asLinePoints(sourceCandles, values));
      return line;
    };

    overlayInstances.forEach((inst) => {
      const def = INDICATOR_CATALOG.find((d) => d.id === inst.defId);
      if (!def) return;
      const p = inst.params as Record<string, number | string>;
      switch (inst.defId) {
        case "ema": addLine(ema(closes, Number(p.period ?? 20)), inst.color); break;
        case "sma": addLine(sma(closes, Number(p.period ?? 20)), inst.color); break;
        case "wma": addLine(wma(closes, Number(p.period ?? 20)), inst.color); break;
        case "dema": addLine(dema(closes, Number(p.period ?? 20)), inst.color); break;
        case "tema": addLine(tema(closes, Number(p.period ?? 20)), inst.color); break;
        case "supertrend": addLine(supertrendCalc(sourceCandles, Number(p.period ?? 10), Number(p.multiplier ?? 3)), inst.color); break;
        case "vwap": addLine(vwapCalc(sourceCandles), inst.color); break;
        case "bb": {
          const { upper, mid, lower } = bbands(closes, Number(p.period ?? 20), Number(p.standardDeviation ?? 2));
          const upperLine = addLine(upper, inst.color);
          addLine(mid, "#94a3b8", 1);
          addLine(lower, inst.color);
          const band = mainChart.addSeries(AreaSeries, {
            lineColor: "transparent",
            topColor: "rgba(100,116,139,0.18)",
            bottomColor: "rgba(100,116,139,0.02)",
            lastValueVisible: false,
            priceLineVisible: false,
          });
          band.setData(asLinePoints(sourceCandles, upper));
          void upperLine;
          break;
        }
        case "psar": addLine(psarCalc(sourceCandles), inst.color, 1); break;
        case "pc": {
          const { upper, lower } = priceChannelCalc(sourceCandles, Number(p.period ?? 20));
          addLine(upper, inst.color);
          addLine(lower, inst.color);
          break;
        }
        case "keltner": {
          const { middle, upper, lower } = keltnerCalc(sourceCandles, Number(p.period ?? 20), Number(p.multiplierATR ?? 2));
          addLine(middle, "#94a3b8", 1);
          addLine(upper, inst.color);
          addLine(lower, inst.color);
          break;
        }
        case "ikh": {
          const { tenkan, kijun, senkouA, senkouB, chikou } = ichimokuCalc(sourceCandles);
          addLine(tenkan, "#38bdf8", 1);
          addLine(kijun, "#f59e0b", 1);
          addLine(senkouA, "#22c55e", 1);
          addLine(senkouB, "#ef4444", 1);
          addLine(chikou, inst.color, 1);
          break;
        }
        case "pivots": {
          const pivots = calcPivots(sourceCandles);
          if (!pivots) break;
          [
            { price: pivots.pp, color: "#94a3b8", title: "PP" },
            { price: pivots.r1, color: TV.up, title: "R1" },
            { price: pivots.s1, color: TV.down, title: "S1" },
          ].forEach((line) => priceLinesRef.current.push((primarySeries as any).createPriceLine({
            price: line.price,
            color: line.color,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: line.title,
          })));
          break;
        }
        default:
          break;
      }
    });

    if (instances.some((inst) => inst.defId === "zigzag")) {
      // intentionally skipped
    }

    mainEl.style.position = "relative";
    const legend = document.createElement("div");
    legend.style.cssText = `position:absolute;top:8px;left:12px;z-index:12;pointer-events:none;font-family:'Inter',system-ui;font-size:12px;color:${TV.text};background:rgba(19,23,34,0.9);padding:4px 10px;border-radius:4px;border:1px solid ${TV.border};line-height:1.8;`;
    mainEl.appendChild(legend);

    mainChart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        callbackRef.current(null);
        legend.innerHTML = "";
        return;
      }
      const candle = candleMap.get(param.time as number);
      if (!candle) return;
      const pct = candle.o ? ((candle.c - candle.o) / candle.o) * 100 : 0;
      callbackRef.current({ t: candle.t, o: candle.o, h: candle.h, l: candle.l, c: candle.c, v: candle.v, pct });
      const chg = candle.c - candle.o;
      const col = chg >= 0 ? TV.up : TV.down;
      const ts = new Date((param.time as number) * 1000).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
      legend.innerHTML = `<span style="color:${TV.axisLabel};font-size:11px">${ts}</span>&nbsp;&nbsp;`
        + `<span style="color:${col}">O</span>&nbsp;<b>${candle.o.toFixed(2)}</b>&nbsp;`
        + `<span style="color:${col}">H</span>&nbsp;<b>${candle.h.toFixed(2)}</b>&nbsp;`
        + `<span style="color:${col}">L</span>&nbsp;<b>${candle.l.toFixed(2)}</b>&nbsp;`
        + `<span style="color:${col}">C</span>&nbsp;<b>${candle.c.toFixed(2)}</b>&nbsp;&nbsp;`
        + `<span style="color:${col};font-weight:700">${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(2)} (${pct.toFixed(2)}%)</span>`
        + `&nbsp;&nbsp;<span style="color:${TV.axisLabel}">Vol</span>&nbsp;<b>${fmtVol(candle.v)}</b>`;
    });

    const paneCharts: IChartApi[] = [];
    oscInstances.forEach((inst, index) => {
      const el = paneRefs.current[inst.instanceId];
      if (!el) return;
      const def = INDICATOR_CATALOG.find((d) => d.id === inst.defId);
      if (!def) return;
      const p = inst.params as Record<string, number | number[]>;
      const paneChart = createChart(el, baseChartOptions(el, index === oscInstances.length - 1));
      chartsRef.current[inst.instanceId] = paneChart;
      paneCharts.push(paneChart);
      const addPaneLine = (values: number[], color: string, width: 1 | 2 = 2) => {
        const line = paneChart.addSeries(LineSeries, { color, lineWidth: width, lastValueVisible: false, priceLineVisible: false });
        line.setData(asLinePoints(sourceCandles, values));
        return line;
      };
      switch (inst.defId) {
        case "rsi": {
          const values = rsi(closes, Number((p as any).period ?? 14));
          const line = addPaneLine(values, inst.color);
          line.createPriceLine({ price: Number((p as any).overbought ?? 70), color: TV.down, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "OB" });
          line.createPriceLine({ price: 50, color: TV.axisLabel, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
          line.createPriceLine({ price: Number((p as any).oversold ?? 30), color: TV.up, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "OS" });
          break;
        }
        case "macd": {
          const { ml, sl, hist } = macd(closes, Number((p as any).shortPeriod ?? 12), Number((p as any).longPeriod ?? 26), Number((p as any).signalPeriod ?? 9));
          const histSeries = paneChart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
          histSeries.setData(sourceCandles.map((c, i) => ({ time: msToSec(c.t), value: hist[i], color: hist[i] >= 0 ? TV.upVol : TV.downVol })).filter((d) => Number.isFinite(d.value)));
          addPaneLine(ml, "#3b82f6");
          const signal = addPaneLine(sl, "#f97316");
          signal.createPriceLine({ price: 0, color: TV.axisLabel, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
          break;
        }
        case "stoch":
        case "sstoch": {
          const periods = Array.isArray((p as any).periods) ? ((p as any).periods as number[]) : [14, 3];
          const { k, d } = stochCalc(sourceCandles, Number(periods[0] ?? 14), Number(periods[1] ?? 3));
          const kLine = addPaneLine(k, inst.color);
          addPaneLine(d, "#f59e0b");
          kLine.createPriceLine({ price: 80, color: TV.down, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "80" });
          kLine.createPriceLine({ price: 20, color: TV.up, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "20" });
          break;
        }
        case "cci": {
          const line = addPaneLine(cciCalc(sourceCandles, Number((p as any).period ?? 20)), inst.color);
          line.createPriceLine({ price: 100, color: TV.down, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "+100" });
          line.createPriceLine({ price: -100, color: TV.up, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "-100" });
          break;
        }
        case "mom": addPaneLine(momentumCalc(closes, Number((p as any).period ?? 10)), inst.color).createPriceLine({ price: 0, color: TV.axisLabel, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" }); break;
        case "obv": addPaneLine(obvCalc(sourceCandles), inst.color); break;
        case "willr": {
          const line = addPaneLine(willrCalc(sourceCandles, Number((p as any).period ?? 14)), inst.color);
          line.createPriceLine({ price: -20, color: TV.down, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "-20" });
          line.createPriceLine({ price: -80, color: TV.up, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "-80" });
          break;
        }
        case "atr": addPaneLine(atrCalc(sourceCandles, Number((p as any).period ?? 14)), inst.color); break;
        case "roc": addPaneLine(rocCalc(closes, Number((p as any).period ?? 10)), inst.color).createPriceLine({ price: 0, color: TV.axisLabel, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" }); break;
        case "aroon": {
          const { up, down } = aroonCalc(sourceCandles, Number((p as any).period ?? 25));
          addPaneLine(up, inst.color);
          addPaneLine(down, "#f97316");
          break;
        }
        case "ao": {
          const hist = aoCalc(sourceCandles);
          const histSeries = paneChart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
          histSeries.setData(sourceCandles.map((c, i) => ({ time: msToSec(c.t), value: hist[i], color: hist[i] >= 0 ? TV.upVol : TV.downVol })).filter((d) => Number.isFinite(d.value)));
          break;
        }
        case "mfi": {
          const line = addPaneLine(mfiCalc(sourceCandles, Number((p as any).period ?? 14)), inst.color);
          line.createPriceLine({ price: 80, color: TV.down, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "80" });
          line.createPriceLine({ price: 20, color: TV.up, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "20" });
          break;
        }
        case "dmi": {
          const { plus, minus, adx } = dmiCalc(sourceCandles, Number((p as any).period ?? 14));
          addPaneLine(plus, "#22c55e");
          addPaneLine(minus, "#ef4444");
          addPaneLine(adx, inst.color);
          break;
        }
        default:
          break;
      }
    });

    const allCharts = [mainChart, ...paneCharts];
    let syncing = false;
    const syncHandlers = allCharts.map((chart) => {
      const handler = (range: LogicalRange | null) => {
        if (!range || syncing) return;
        syncing = true;
        allCharts.forEach((target) => {
          if (target !== chart) target.timeScale().setVisibleLogicalRange(range);
        });
        syncing = false;
        redrawSvg();
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
      return { chart, handler };
    });

    allCharts.forEach((chart) => chart.timeScale().fitContent());
    const initialRange = mainChart.timeScale().getVisibleLogicalRange();
    if (initialRange) paneCharts.forEach((chart) => chart.timeScale().setVisibleLogicalRange(initialRange));

    const clearDrawings = () => {
      priceLinesRef.current.forEach((line) => {
        try { (primarySeries as any).removePriceLine(line); } catch {}
      });
      priceLinesRef.current = [];
      drawingsRef.current = [];
      pendingClickRef.current = null;
      redrawSvg();
    };
    (chartInstanceRef.current as any).__clearDrawings = clearDrawings;

    const handleClick = (event: MouseEvent) => {
      const tool = activeToolRef.current;
      if (tool === "cursor") return;
      if (tool === "erase") { clearDrawings(); return; }
      const rect = mainEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const time = mainChart.timeScale().coordinateToTime(x);
      const price = (primarySeries as any).coordinateToPrice(y);
      if (time == null || price == null) return;
      const point = { time: time as UTCTimestamp, price: Number(price) };

      if (tool === "hline") {
        priceLinesRef.current.push((primarySeries as any).createPriceLine({
          price: point.price,
          color: "#f59e0b",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "H",
        }));
        redrawSvg();
        return;
      }
      if (tool === "label") {
        const text = window.prompt("Label text:");
        if (text) drawingsRef.current.push({ id: `${Date.now()}-${Math.random()}`, kind: "label", points: [point], text });
        redrawSvg();
        return;
      }
      if (tool === "vline") {
        drawingsRef.current.push({ id: `${Date.now()}-${Math.random()}`, kind: "vline", points: [point] });
        redrawSvg();
        return;
      }

      const pending = pendingClickRef.current;
      if (!pending) {
        pendingClickRef.current = { x: point.time as number, y: point.price };
        redrawSvg();
        return;
      }
      if (tool === "pitchfork" && pending.x2 == null) {
        pendingClickRef.current = { ...pending, x2: point.time as number, y2: point.price };
        redrawSvg();
        return;
      }
      pendingClickRef.current = null;
      const points = [{ time: pending.x as UTCTimestamp, price: pending.y }];
      if (pending.x2 != null && pending.y2 != null) points.push({ time: pending.x2 as UTCTimestamp, price: pending.y2 });
      points.push(point);
      drawingsRef.current.push({ id: `${Date.now()}-${Math.random()}`, kind: tool, points });
      redrawSvg();
    };
    mainEl.addEventListener("click", handleClick);

    const handleLeave = () => callbackRef.current(null);
    mainEl.addEventListener("mouseleave", handleLeave);

    const resizeObservers: ResizeObserver[] = [];
    const resizeTargets: Array<{ el: HTMLDivElement; chart: IChartApi }> = [
      { el: mainEl, chart: mainChart },
      ...paneCharts.map((chart, index) => ({ el: paneRefs.current[oscInstances[index].instanceId]!, chart })),
    ];
    resizeTargets.forEach(({ el, chart }) => {
      const ro = new ResizeObserver(() => {
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
        redrawSvg();
      });
      ro.observe(el);
      resizeObservers.push(ro);
    });

    redrawSvg();

    return () => {
      mainEl.removeEventListener("click", handleClick);
      mainEl.removeEventListener("mouseleave", handleLeave);
      if (mainEl.contains(legend)) mainEl.removeChild(legend);
      syncHandlers.forEach(({ chart, handler }) => chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler));
      resizeObservers.forEach((ro) => ro.disconnect());
      Object.values(chartsRef.current).forEach((chart: any) => chart.remove());
      chartsRef.current = {};
      chartInstanceRef.current = null;
    };
  }, [candles, symbol, chartType, instances, onHover, activeToolRef, pendingClickRef, chartInstanceRef, oscInstances, overlayInstances, redrawSvg]);

  const renderDrawing = (drawing: ChartDrawing) => {
    const chart = chartInstanceRef.current;
    if (!chart) return null;
    const mainSeries = ((chart as any).__primarySeries ?? null) as any;
    const series = mainSeries;
    if (!series) return null;
    const xOf = (time: UTCTimestamp) => chart.timeScale().timeToCoordinate(time) ?? 0;
    const yOf = (price: number) => series.priceToCoordinate(price) ?? 0;
    const pts = drawing.points.map((p) => ({ x: xOf(p.time), y: yOf(p.price) }));
    const stroke = drawing.kind === "fib" ? "#a78bfa" : drawing.kind === "rect" ? "#f59e0b" : drawing.kind === "ray" ? "#10b981" : drawing.kind === "pitchfork" ? "#f97316" : "#3b82f6";
    if (drawing.kind === "vline") return <line key={drawing.id} x1={pts[0]?.x} y1={0} x2={pts[0]?.x} y2="100%" stroke="#94a3b8" strokeDasharray="4 4" />;
    if (drawing.kind === "label") return <text key={drawing.id} x={pts[0]?.x + 6} y={pts[0]?.y - 6} fill="#e2e8f0" fontSize="11">{drawing.text}</text>;
    if (drawing.kind === "rect" && pts[1]) return <rect key={drawing.id} x={Math.min(pts[0].x, pts[1].x)} y={Math.min(pts[0].y, pts[1].y)} width={Math.abs(pts[1].x - pts[0].x)} height={Math.abs(pts[1].y - pts[0].y)} fill="rgba(245,158,11,0.08)" stroke={stroke} strokeWidth="1.5" />;
    if (drawing.kind === "fib" && pts[1]) {
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      return <g key={drawing.id}>{levels.map((lvl) => {
        const y = pts[1].y - (pts[1].y - pts[0].y) * lvl;
        return <line key={lvl} x1={Math.min(pts[0].x, pts[1].x)} y1={y} x2={mainRef.current?.clientWidth ?? pts[1].x} y2={y} stroke="#a78bfa" strokeDasharray="4 4" strokeWidth="1" />;
      })}</g>;
    }
    if (drawing.kind === "pitchfork" && pts[2]) {
      const midX = (pts[1].x + pts[2].x) / 2;
      const midY = (pts[1].y + pts[2].y) / 2;
      const dx = (mainRef.current?.clientWidth ?? pts[2].x) - pts[0].x;
      const slope = (midY - pts[0].y) / ((midX - pts[0].x) || 1);
      const midEndY = pts[0].y + slope * dx;
      return <g key={drawing.id}>
        <line x1={pts[0].x} y1={pts[0].y} x2={mainRef.current?.clientWidth ?? pts[2].x} y2={midEndY} stroke={stroke} strokeWidth="1.5" />
        <line x1={pts[1].x} y1={pts[1].y} x2={mainRef.current?.clientWidth ?? pts[2].x} y2={pts[1].y + slope * ((mainRef.current?.clientWidth ?? pts[2].x) - pts[1].x)} stroke={stroke} strokeWidth="1.5" />
        <line x1={pts[2].x} y1={pts[2].y} x2={mainRef.current?.clientWidth ?? pts[2].x} y2={pts[2].y + slope * ((mainRef.current?.clientWidth ?? pts[2].x) - pts[2].x)} stroke={stroke} strokeWidth="1.5" />
      </g>;
    }
    if (drawing.kind === "ray" && pts[1]) {
      const endX = mainRef.current?.clientWidth ?? pts[1].x;
      const slope = (pts[1].y - pts[0].y) / ((pts[1].x - pts[0].x) || 1);
      return <line key={drawing.id} x1={pts[0].x} y1={pts[0].y} x2={endX} y2={pts[0].y + slope * (endX - pts[0].x)} stroke={stroke} strokeWidth="1.5" />;
    }
    if (pts[1]) return <line key={drawing.id} x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke={stroke} strokeWidth="1.5" />;
    return null;
  };

  return (
    <div ref={rootRef} className="flex h-full flex-col">
      <div ref={mainRef} className="relative min-h-0 flex-1">
        <svg className="pointer-events-none absolute inset-0 z-10" width="100%" height="100%" viewBox={`0 0 ${mainRef.current?.clientWidth ?? 1} ${mainRef.current?.clientHeight ?? 1}`} preserveAspectRatio="none">
          {drawingsRef.current.map(renderDrawing)}
        </svg>
      </div>
      {oscInstances.map((inst) => {
        const def = INDICATOR_CATALOG.find((d) => d.id === inst.defId);
        return (
          <div key={inst.instanceId} className="h-[120px] shrink-0 border-t border-[#1a2130] relative">
            <div className="absolute left-3 top-2 z-10 text-[10px] font-semibold text-slate-400">{def ? indicatorLabel(def, inst.params) : inst.defId.toUpperCase()}</div>
            <div ref={(el) => { paneRefs.current[inst.instanceId] = el; }} className="h-full w-full" />
          </div>
        );
      })}
    </div>
  );
}

// ─── Charts Page ─────────────────────────────────────────────────────────────────
export default function ChartsPage() {
  const [symbols, setSymbols] = useState<SymbolItem[]>(DUMMY_SYMBOLS);
  const [symbol, setSymbol] = useState<string>("RELIANCE");
  const [candlePeriod, setCandlePeriod] = useState<TF>("1W");
  const [chartType, setChartType] = useState("candlestick");
  const [timePeriod, setTimePeriod] = useState<TP>("1Y");
  const [candles, setCandles] = useState<CandleRaw[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instances, setInstances] = useState<IndicatorInstance[]>([]);
  const [settingsTarget, setSettingsTarget] = useState<string | null>(null); // instanceId
  const instanceCounterRef = useRef<Record<string, number>>({});
  const [indicatorPanelOpen, setIndicatorPanelOpen] = useState(false);
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const [ohlcv, setOhlcv] = useState<OHLCVInfo | null>(null);
  const [activeTool, setActiveTool] = useState("cursor");
  const [chartTypeOpen, setChartTypeOpen] = useState(false);
  const activeToolRef = useRef("cursor");
  const pendingClickRef = useRef<{ x: number; y: number; x2?: number; y2?: number } | null>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    api<SymbolItem[]>("/charts/symbols").then(setSymbols).catch(() => {});
  }, []);

  const fetchCandles = useCallback(async (sym: string, tf: TF) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ candles: CandleRaw[] }>(
        `/charts/candles?symbol=${sym}&timeframe=${tf}&limit=2000`
      );
      if (data?.candles?.length) {
        setCandles(data.candles);
      } else {
        setCandles([]);
        setError(`No data found for ${sym} (${tf}) in the database.`);
      }
    } catch {
      setCandles([]);
      setError(`Could not load data for ${sym} (${tf}). Check API connection.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCandles(symbol, candlePeriod); }, [symbol, candlePeriod, fetchCandles]);

  function pickTool(id: string) {
    setActiveTool(id);
    activeToolRef.current = id;
    if (id !== "cursor" && id !== "erase") {
      pendingClickRef.current = null;
    }
  }

  function addIndicator(defId: string) {
    const def = INDICATOR_CATALOG.find((d) => d.id === defId)!;
    instanceCounterRef.current[defId] = (instanceCounterRef.current[defId] ?? 0) + 1;
    const instanceId = `${defId}-${instanceCounterRef.current[defId]}`;
    setInstances((prev) => [...prev, { instanceId, defId, params: { ...def.params }, color: def.color }]);
  }
  function removeInstance(instanceId: string) {
    setInstances((prev) => prev.filter((i) => i.instanceId !== instanceId));
  }
  function updateInstance(instanceId: string, params: Record<string, unknown>, color: string) {
    setInstances((prev) => prev.map((i) => i.instanceId === instanceId ? { ...i, params, color } : i));
  }

  function clearAnnotations() {
    (chartInstanceRef.current as any)?.__clearDrawings?.();
  }

  const defaultOhlcv = useMemo<OHLCVInfo | null>(() => {
    if (!candles.length) return null;
    const c = candles[candles.length - 1];
    return { t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v, pct: c.o > 0 ? ((c.c - c.o) / c.o) * 100 : 0 };
  }, [candles]);

  const isCrossHair = activeTool !== "cursor" && activeTool !== "erase";

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: "calc(100vh - 56px)", backgroundColor: "#0e1117" }}
    >
      {/* Top Bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#1a2130] shrink-0 flex-wrap">
        <SymbolDropdown symbols={symbols} selected={symbol} onSelect={(s) => { setSymbol(s); setIndicatorPanelOpen(false); }} />

        {/* Candle period pills */}
        <div className="flex items-center gap-0.5 ml-1">
          {CANDLE_PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setCandlePeriod(p.key)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                candlePeriod === p.key
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Chart type dropdown */}
        <div className="relative ml-1">
          <button
            onClick={() => setChartTypeOpen(!chartTypeOpen)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#1e293b] hover:bg-[#253347] text-slate-300 text-xs border border-[#334155] transition-colors"
          >
            {CHART_TYPES.find((t) => t.value === chartType)?.label ?? "Chart"}
            <span className="text-slate-500">▾</span>
          </button>
          {chartTypeOpen && (
            <div className="absolute top-full left-0 z-50 mt-1 rounded-lg border border-[#1e293b] shadow-xl overflow-hidden" style={{ backgroundColor: "#0e1520", minWidth: 140 }}>
              {CHART_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => { setChartType(t.value); setChartTypeOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-[#1e293b] transition-colors ${chartType === t.value ? "text-blue-400" : "text-slate-300"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Indicators */}
        <div className="relative ml-1">
          <button
            onClick={() => setIndicatorPanelOpen(!indicatorPanelOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-colors ${
              instances.length > 0
                ? "bg-blue-900 border-blue-600 text-blue-300 hover:bg-blue-800"
                : "bg-[#1e293b] border-[#334155] text-slate-300 hover:bg-[#253347]"
            }`}
          >
            Indicators
            {instances.length > 0 && (
              <span className="bg-blue-600 text-white rounded-full px-1.5 py-0 text-[10px] font-bold">{instances.length}</span>
            )}
          </button>
          {indicatorPanelOpen && (
            <IndicatorPanel
              onAdd={addIndicator}
              onClose={() => setIndicatorPanelOpen(false)}
            />
          )}
        </div>

        {/* Active indicator chips */}
        {instances.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap ml-1">
            {instances.map((inst) => {
              const def = INDICATOR_CATALOG.find((d) => d.id === inst.defId)!;
              return (
                <span key={inst.instanceId} className="flex items-center gap-0.5 bg-[#1e293b] border border-[#334155] rounded px-1.5 py-0.5 text-[10px] text-slate-300">
                  <span style={{ color: inst.color }}>●</span> {indicatorLabel(def, inst.params)}
                  <button
                    onClick={() => setSettingsTarget(inst.instanceId)}
                    className="ml-0.5 text-slate-500 hover:text-blue-400 transition-colors"
                    title="Settings"
                  >⚙</button>
                  <button
                    onClick={() => removeInstance(inst.instanceId)}
                    className="ml-0.5 text-slate-500 hover:text-red-400 transition-colors"
                    title="Remove"
                  >✕</button>
                </span>
              );
            })}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {error && (
            <span className="text-[10px] text-amber-400 max-w-[220px] truncate" title={error}>{error}</span>
          )}
          <button
            onClick={clearAnnotations}
            className="px-2.5 py-1 rounded bg-[#1e293b] hover:bg-[#253347] text-slate-400 hover:text-slate-200 text-xs border border-[#334155] transition-colors"
            title="Clear all drawings"
          >
            🗑 Clear
          </button>
          <button
            onClick={() => {
              const el = (chartInstanceRef.current as any)?.__containerEl as HTMLElement | undefined;
              if (!el) return;
              if (document.fullscreenElement) document.exitFullscreen();
              else el.requestFullscreen();
            }}
            className="w-7 h-7 flex items-center justify-center rounded bg-[#1e293b] hover:bg-[#253347] text-slate-400 hover:text-slate-200 border border-[#334155] transition-colors text-sm"
            title="Fullscreen"
          >
            ⛶
          </button>
          <button
            onClick={() => setWatchlistOpen(!watchlistOpen)}
            className={`w-7 h-7 flex items-center justify-center rounded border transition-colors text-sm ${
              watchlistOpen ? "bg-blue-900 border-blue-600 text-blue-300" : "bg-[#1e293b] border-[#334155] text-slate-400 hover:text-slate-200 hover:bg-[#253347]"
            }`}
            title="Watchlist"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Drawing toolbar */}
        <DrawingToolbar
          activeTool={activeTool}
          pendingClick={pendingClickRef.current != null}
          onSelect={pickTool}
        />

        {/* Main chart area */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          {/* OHLCV info bar */}
          <div className="flex items-center px-3 py-1 border-b border-[#1a2130] shrink-0 min-h-[30px]">
            <OHLCVBar
              symbol={symbol}
              tf={CANDLE_PERIODS.find((p) => p.key === candlePeriod)?.label ?? candlePeriod}
              ohlcv={ohlcv ?? defaultOhlcv}
            />
          </div>

          {/* Chart container */}
          <div className={`flex-1 relative min-h-0 ${isCrossHair ? "cursor-crosshair" : "cursor-default"}`}>
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-slate-500 text-xs">Loading {symbol}…</span>
                </div>
              </div>
            ) : candles.length > 0 ? (
              <StockChart
                candles={candles}
                symbol={symbol}
                chartType={chartType}
                instances={instances}
                timePeriod={timePeriod}
                onHover={setOhlcv}
                activeToolRef={activeToolRef}
                pendingClickRef={pendingClickRef}
                chartInstanceRef={chartInstanceRef}
              />
            ) : !loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-slate-600 text-xs">No candle data available.</span>
              </div>
            ) : null}
          </div>

          {/* Time period bar */}
          <TimePeriodBar
            value={timePeriod}
            onChange={setTimePeriod}
            chartRef={chartInstanceRef}
            candles={candles}
          />
        </div>

        {/* Watchlist slide-over */}
        {watchlistOpen && (
          <WatchlistSlideOver
            symbols={symbols}
            selected={symbol}
            onSelect={(s) => { setSymbol(s); setWatchlistOpen(false); }}
            onClose={() => setWatchlistOpen(false)}
          />
        )}
      </div>

      {/* Indicator settings modal */}
      {settingsTarget && (() => {
        const inst = instances.find((i) => i.instanceId === settingsTarget)!;
        const def = INDICATOR_CATALOG.find((d) => d.id === inst.defId)!;
        return (
          <IndicatorSettingsModal
            def={def}
            currentParams={inst.params}
            currentColor={inst.color}
            onSave={(params, color) => updateInstance(inst.instanceId, params, color)}
            onClose={() => setSettingsTarget(null)}
          />
        );
      })()}
    </div>
  );
}
