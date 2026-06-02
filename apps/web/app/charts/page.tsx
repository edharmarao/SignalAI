"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import Highcharts from "highcharts/highstock";
import { api } from "@/lib/api";

// ─── Module-level HC loader (runs once) ────────────────────────────────────────
// Modules are loaded in dependency order: base indicators first, then dependants.
// Parallel groups are safe; slow-stochastic must come after stochastic.
let _hcLoadPromise: Promise<void> | null = null;
function loadHcModules(): Promise<void> {
  if (_hcLoadPromise) return _hcLoadPromise;

  async function applyMod(p: Promise<{ default?: unknown }>) {
    const m = await p;
    const fn = (m as any).default;
    if (typeof fn === "function") fn(Highcharts);
  }

  _hcLoadPromise = (async () => {
    // Group 1: core modules (independent)
    await Promise.all([
      applyMod(import("highcharts/modules/drag-panes")),
      applyMod(import("highcharts/modules/annotations")),
      applyMod(import("highcharts/modules/annotations-advanced")),
      applyMod(import("highcharts/modules/stock-tools")),
      applyMod(import("highcharts/modules/full-screen")),
      applyMod(import("highcharts/modules/mouse-wheel-zoom")),
      applyMod(import("highcharts/modules/price-indicator")),
      applyMod(import("highcharts/modules/heikinashi")),
      applyMod(import("highcharts/modules/hollowcandlestick")),
    ]);

    // Group 2: base indicator module (must be before all indicators)
    await applyMod(import("highcharts/indicators/indicators"));

    // Group 3: independent indicators
    await Promise.all([
      applyMod(import("highcharts/indicators/bollinger-bands")),
      applyMod(import("highcharts/indicators/macd")),
      applyMod(import("highcharts/indicators/rsi")),
      applyMod(import("highcharts/indicators/vwap")),
      applyMod(import("highcharts/indicators/atr")),
      applyMod(import("highcharts/indicators/cci")),
      applyMod(import("highcharts/indicators/momentum")),
      applyMod(import("highcharts/indicators/obv")),
      applyMod(import("highcharts/indicators/wma")),
      applyMod(import("highcharts/indicators/dema")),
      applyMod(import("highcharts/indicators/tema")),
      applyMod(import("highcharts/indicators/psar")),
      applyMod(import("highcharts/indicators/supertrend")),
      applyMod(import("highcharts/indicators/ichimoku-kinko-hyo")),
      applyMod(import("highcharts/indicators/pivot-points")),
      applyMod(import("highcharts/indicators/price-channel")),
      applyMod(import("highcharts/indicators/keltner-channels")),
      applyMod(import("highcharts/indicators/zigzag")),
      applyMod(import("highcharts/indicators/williams-r")),
      applyMod(import("highcharts/indicators/aroon")),
      applyMod(import("highcharts/indicators/roc")),
      applyMod(import("highcharts/indicators/ao")),
      applyMod(import("highcharts/indicators/mfi")),
      applyMod(import("highcharts/indicators/dmi")),
    ]);

    // Group 4: stochastic must be loaded before slow-stochastic
    await applyMod(import("highcharts/indicators/stochastic"));
    await applyMod(import("highcharts/indicators/slow-stochastic"));

    // Volume-width plugin: scales candlestick/column width proportional to volume
    // Based on: https://www.highcharts.com/demo/stock/candlestick-volume-width
    (Highcharts as any).addEvent(
      (Highcharts as any).seriesTypes.column,
      "afterColumnTranslate",
      function (this: any) {
        const series = this;
        if (series.options.baseVolume && series.is("column") && series.points) {
          const volumeSeries = series.chart.get(series.options.baseVolume);
          if (volumeSeries) {
            const processedYData = (volumeSeries as any).getColumn("y", true);
            if (processedYData) {
              const maxVolume = (volumeSeries as any).dataMax;
              const metrics = series.getColumnMetrics();
              const baseWidth = metrics.width;
              series.points.forEach((point: any, i: number) => {
                const volume = processedYData[i];
                const scale = volume / maxVolume;
                const width = baseWidth * scale;
                if (point.shapeArgs) {
                  point.shapeArgs.x =
                    point.shapeArgs.x - width / 2 + point.shapeArgs.width / 2;
                  point.shapeArgs.width = width;
                }
              });
            }
          }
        }
      }
    );

    Highcharts.setOptions({
      chart: { style: { fontFamily: "Inter, ui-sans-serif, system-ui" } },
      colors: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"],
    });
  })();

  return _hcLoadPromise;
}

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
  chartInstanceRef: React.MutableRefObject<Highcharts.StockChart | null>;
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

function buildYAxes(oscInstances: IndicatorInstance[]): Highcharts.YAxisOptions[] {
  const VOL_PCT = 10;
  const OSC_PCT = 18; // taller panes — easier to read
  const oscCount = oscInstances.length;
  const priceH = Math.max(30, 100 - VOL_PCT - oscCount * OSC_PCT);
  const volTop = priceH + 1;

  const axes: Highcharts.YAxisOptions[] = [
    {
      height: `${priceH}%`,
      labels: {
        align: "right", x: -5,
        style: { color: "#475569", fontSize: "10px" },
        formatter(this: Highcharts.AxisLabelsFormatterContextObject) {
          return (this.value as number).toFixed(1);
        },
      },
      gridLineColor: "#1a2130",
      lineColor: "#1a2130",
      crosshair: {
        snap: false,
        label: {
          enabled: true,
          backgroundColor: "#1e3a5f",
          borderColor: "#3b82f6",
          style: { color: "#e2e8f0", fontSize: "10px" },
          formatter(value: number) { return value.toFixed(1); },
        } as any,
      },
      ...({ lastVisiblePrice: { enabled: true, label: { enabled: true, backgroundColor: "#1e3a5f", style: { color: "#e2e8f0" }, formatter(value: number) { return value.toFixed(1); } } } } as any),
      resize: { enabled: true, lineWidth: 2, lineColor: "#1e293b" } as any,
    },
    {
      top: `${volTop}%`,
      height: `${VOL_PCT - 1}%`,
      offset: 0,
      labels: {
        align: "right", x: -5,
        style: { color: "#475569", fontSize: "9px" },
        formatter(this: Highcharts.AxisLabelsFormatterContextObject) {
          return fmtVol(this.value as number);
        },
      },
      gridLineColor: "#111827",
    },
  ];

  oscInstances.forEach((inst, i) => {
    const def = INDICATOR_CATALOG.find((d) => d.id === inst.defId)!;
    const top = volTop + VOL_PCT + i * OSC_PCT;
    const paneH = OSC_PCT - 1;
    const plotLines: Highcharts.YAxisPlotLinesOptions[] = [];
    const plotBands: Highcharts.YAxisPlotBandsOptions[] = [];

    if (def.hcType === "rsi") {
      const ob = Number(inst.params.overbought ?? 70);
      const os = Number(inst.params.oversold ?? 30);
      plotBands.push(
        { from: ob, to: 100, color: "rgba(239,68,68,0.06)", label: { text: "OB", style: { color: "#ef4444", fontSize: "8px" }, align: "left", x: 4 } },
        { from: 0, to: os, color: "rgba(34,197,94,0.06)", label: { text: "OS", style: { color: "#22c55e", fontSize: "8px" }, align: "left", x: 4 } },
      );
      plotLines.push(
        { value: ob, color: "#ef4444", dashStyle: "Dash" as any, width: 1, zIndex: 5, label: { text: String(ob), align: "right", x: -4, style: { color: "#ef4444", fontSize: "9px" } } },
        { value: 50, color: "#334155", dashStyle: "Dot" as any, width: 1, zIndex: 5 },
        { value: os, color: "#22c55e", dashStyle: "Dash" as any, width: 1, zIndex: 5, label: { text: String(os), align: "right", x: -4, style: { color: "#22c55e", fontSize: "9px" } } },
      );
    }
    if (def.hcType === "stochastic" || def.hcType === "slowstochastic") {
      plotBands.push(
        { from: 80, to: 100, color: "rgba(239,68,68,0.06)" },
        { from: 0, to: 20, color: "rgba(34,197,94,0.06)" },
      );
      plotLines.push(
        { value: 80, color: "#ef4444", dashStyle: "Dash" as any, width: 1, zIndex: 5, label: { text: "80", align: "right", x: -4, style: { color: "#ef4444", fontSize: "9px" } } },
        { value: 20, color: "#22c55e", dashStyle: "Dash" as any, width: 1, zIndex: 5, label: { text: "20", align: "right", x: -4, style: { color: "#22c55e", fontSize: "9px" } } },
      );
    }
    if (def.hcType === "williamsr") {
      plotBands.push(
        { from: -20, to: 0, color: "rgba(239,68,68,0.06)" },
        { from: -100, to: -80, color: "rgba(34,197,94,0.06)" },
      );
      plotLines.push(
        { value: -20, color: "#ef4444", dashStyle: "Dash" as any, width: 1, zIndex: 5, label: { text: "-20", align: "right", x: -4, style: { color: "#ef4444", fontSize: "9px" } } },
        { value: -80, color: "#22c55e", dashStyle: "Dash" as any, width: 1, zIndex: 5, label: { text: "-80", align: "right", x: -4, style: { color: "#22c55e", fontSize: "9px" } } },
      );
    }
    if (def.hcType === "cci") {
      plotBands.push(
        { from: 100, to: 999, color: "rgba(239,68,68,0.06)" },
        { from: -999, to: -100, color: "rgba(34,197,94,0.06)" },
      );
      plotLines.push(
        { value: 100, color: "#ef4444", dashStyle: "Dash" as any, width: 1, zIndex: 5, label: { text: "100", align: "right", x: -4, style: { color: "#ef4444", fontSize: "9px" } } },
        { value: 0, color: "#334155", dashStyle: "Dot" as any, width: 1, zIndex: 5 },
        { value: -100, color: "#22c55e", dashStyle: "Dash" as any, width: 1, zIndex: 5, label: { text: "-100", align: "right", x: -4, style: { color: "#22c55e", fontSize: "9px" } } },
      );
    }
    if (def.hcType === "macd" || def.hcType === "ao" || def.hcType === "momentum" || def.hcType === "roc") {
      plotLines.push(
        { value: 0, color: "#475569", dashStyle: "Solid" as any, width: 1, zIndex: 5 },
      );
    }
    if (def.hcType === "mfi") {
      plotBands.push(
        { from: 80, to: 100, color: "rgba(239,68,68,0.06)" },
        { from: 0, to: 20, color: "rgba(34,197,94,0.06)" },
      );
      plotLines.push(
        { value: 80, color: "#ef4444", dashStyle: "Dash" as any, width: 1, zIndex: 5, label: { text: "80", align: "right", x: -4, style: { color: "#ef4444", fontSize: "9px" } } },
        { value: 20, color: "#22c55e", dashStyle: "Dash" as any, width: 1, zIndex: 5, label: { text: "20", align: "right", x: -4, style: { color: "#22c55e", fontSize: "9px" } } },
      );
    }

    axes.push({
      top: `${top}%`,
      height: `${paneH}%`,
      offset: 0,
      labels: {
        align: "right", x: -5,
        style: { color: "#475569", fontSize: "9px" },
        formatter(this: Highcharts.AxisLabelsFormatterContextObject) {
          return (this.value as number).toFixed(1);
        },
      },
      title: {
        text: indicatorLabel(def, inst.params),
        style: { color: inst.color, fontSize: "9px", fontWeight: "600" },
        rotation: 0,
        x: 5,
        align: "high",
      } as any,
      gridLineColor: "#111827",
      lineColor: "#1e293b",
      lineWidth: 1,
      plotLines: plotLines.length ? plotLines : undefined,
      plotBands: plotBands.length ? plotBands : undefined,
      resize: { enabled: true, lineWidth: 3, lineColor: "#334155" } as any,
    });
  });

  return axes;
}

function buildIndicatorSeries(def: IndicatorDef, yAxisIdx: number, customParams?: Record<string, unknown>, instanceId?: string, instanceColor?: string): Record<string, unknown> {
  const merged = { ...def.params, ...(customParams ?? {}) };
  // Strip UI-only keys that Highcharts doesn't understand
  const { overbought: _ob, oversold: _os, ...mergedParams } = merged as any;
  const color = instanceColor ?? def.color;
  const base: Record<string, unknown> = {
    id: instanceId ?? def.id,
    type: def.hcType,
    linkedTo: "ohlc",
    yAxis: yAxisIdx,
    name: indicatorLabel(def, customParams),
    color,
    lineWidth: 1.5,
    params: mergedParams,
    dataGrouping: { enabled: false },
    showInLegend: true,
  };

  if (def.hcType === "bb") {
    return {
      ...base, fillOpacity: 0.07,
      topLine: { styles: { lineColor: color, lineWidth: 1 } },
      bottomLine: { styles: { lineColor: color, lineWidth: 1 } },
    };
  }
  if (def.hcType === "macd") {
    return {
      ...base, lineWidth: 0,
      macdLine: { styles: { lineColor: "#10b981", lineWidth: 1.5 } },
      signalLine: { styles: { lineColor: "#f59e0b", lineWidth: 1.5 } },
      histogram: { color: "#22c55e", negativeColor: "#ef4444" },
    };
  }
  if (def.hcType === "stochastic" || def.hcType === "slowstochastic") {
    return { ...base, smoothedLine: { styles: { lineColor: "#f59e0b", lineWidth: 1.5 } } };
  }
  if (def.hcType === "supertrend") {
    return {
      ...base,
      risingTrendColor: "#22c55e",
      fallingTrendColor: "#ef4444",
      changeTrendLine: { styles: { lineWidth: 1 } },
    };
  }
  if (def.hcType === "ikh") {
    return {
      ...base,
      tenkanLine: { styles: { lineColor: "#38bdf8", lineWidth: 1 } },
      kijunLine: { styles: { lineColor: "#f59e0b", lineWidth: 1 } },
      chikouLine: { styles: { lineColor: "#4ade80", lineWidth: 1 } },
      senkouSpanA: { styles: { lineColor: "#22c55e", lineWidth: 1 } },
      senkouSpanB: { styles: { lineColor: "#ef4444", lineWidth: 1 } },
    };
  }
  return base;
}

// ─── Annotation drawing helpers ─────────────────────────────────────────────────
function drawHLine(chart: Highcharts.StockChart, _x: number, y: number) {
  (chart as any).addAnnotation({
    type: "infinityLine",
    typeOptions: { type: "horizontalLine", points: [{ x: 0, y, xAxis: 0, yAxis: 0 }] },
    shapeOptions: { stroke: "#f59e0b", strokeWidth: 1.5, dashStyle: "Dash" },
    draggable: "y",
  });
}

function drawVLine(chart: Highcharts.StockChart, x: number, y: number) {
  (chart as any).addAnnotation({
    type: "infinityLine",
    typeOptions: { type: "verticalLine", points: [{ x, y, xAxis: 0, yAxis: 0 }] },
    shapeOptions: { stroke: "#94a3b8", strokeWidth: 1.5, dashStyle: "Dash" },
    draggable: "x",
  });
}

function drawTrendLine(chart: Highcharts.StockChart, p1: { x: number; y: number }, p2: { x: number; y: number }) {
  (chart as any).addAnnotation({
    shapes: [{
      type: "path",
      points: [
        { x: p1.x, y: p1.y, xAxis: 0, yAxis: 0 },
        { x: p2.x, y: p2.y, xAxis: 0, yAxis: 0 },
      ],
      stroke: "#3b82f6",
      strokeWidth: 1.5,
      fill: "none",
    }],
    draggable: "xy",
  });
}

function drawRay(chart: Highcharts.StockChart, p1: { x: number; y: number }, p2: { x: number; y: number }) {
  const xMax = (chart.xAxis[0] as any).dataMax ?? p2.x * 2;
  const slope = (p2.y - p1.y) / (p2.x - p1.x || 1);
  const yEnd = p1.y + slope * (xMax - p1.x);
  (chart as any).addAnnotation({
    shapes: [{
      type: "path",
      points: [
        { x: p1.x, y: p1.y, xAxis: 0, yAxis: 0 },
        { x: xMax, y: yEnd, xAxis: 0, yAxis: 0 },
      ],
      stroke: "#10b981",
      strokeWidth: 1.5,
      fill: "none",
    }],
    draggable: "xy",
  });
}

function drawFibonacci(chart: Highcharts.StockChart, p1: { x: number; y: number }, p2: { x: number; y: number }) {
  const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const diff = p2.y - p1.y;
  levels.forEach((lvl) => {
    const y = p2.y - diff * lvl;
    (chart as any).addAnnotation({
      type: "infinityLine",
      typeOptions: { type: "horizontalLine", points: [{ x: p1.x, y, xAxis: 0, yAxis: 0 }] },
      shapeOptions: { stroke: "#a78bfa", strokeWidth: 1, dashStyle: "Dot" },
      labels: [{ point: { x: p2.x, y, xAxis: 0, yAxis: 0 }, text: `${(lvl * 100).toFixed(1)}%`, style: { color: "#a78bfa", fontSize: "9px" } }],
      draggable: "y",
    });
  });
}

function drawRectangle(chart: Highcharts.StockChart, p1: { x: number; y: number }, p2: { x: number; y: number }) {
  (chart as any).addAnnotation({
    shapes: [{
      type: "rect",
      point: { x: Math.min(p1.x, p2.x), y: Math.max(p1.y, p2.y), xAxis: 0, yAxis: 0 },
      width: Math.abs(p2.x - p1.x),
      height: Math.abs(p2.y - p1.y),
      stroke: "#f59e0b",
      strokeWidth: 1.5,
      fill: "rgba(245,158,11,0.06)",
    }],
    draggable: "xy",
  });
}

function drawLabel(chart: Highcharts.StockChart, x: number, y: number, text: string) {
  (chart as any).addAnnotation({
    labels: [{
      point: { x, y, xAxis: 0, yAxis: 0 },
      text,
      style: { color: "#e2e8f0", fontSize: "11px" },
      backgroundColor: "rgba(30,41,59,0.85)",
      borderColor: "#475569",
      padding: 4,
    }],
    draggable: "xy",
  });
}

function drawPitchfork(chart: Highcharts.StockChart, p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }) {
  // Draw Andrews Pitchfork as 3 rays using basic shapes
  const mid = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
  const xMax = (chart.xAxis[0] as any).dataMax ?? p1.x * 2;

  function extendRay(a: { x: number; y: number }, b: { x: number; y: number }) {
    const slope = (b.y - a.y) / (b.x - a.x || 1);
    return { x: xMax, y: a.y + slope * (xMax - a.x) };
  }

  const midEnd = extendRay(p1, mid);
  const upperEnd = extendRay(p2, { x: p2.x + (mid.x - p1.x), y: p2.y + (mid.y - p1.y) });
  const lowerEnd = extendRay(p3, { x: p3.x + (mid.x - p1.x), y: p3.y + (mid.y - p1.y) });

  [[p1, midEnd], [p2, upperEnd], [p3, lowerEnd]].forEach(([a, b]) => {
    (chart as any).addAnnotation({
      shapes: [{
        type: "path",
        points: [
          { x: a.x, y: a.y, xAxis: 0, yAxis: 0 },
          { x: b.x, y: b.y, xAxis: 0, yAxis: 0 },
        ],
        stroke: "#f97316",
        strokeWidth: 1.5,
        fill: "none",
      }],
      draggable: "xy",
    });
  });
}

// ─── Dummy data ──────────────────────────────────────────────────────────────────
function generateDummyCandles(sym: string): CandleRaw[] {
  const seed = sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  let price = 1000 + (seed % 2000);
  const candles: CandleRaw[] = [];
  const now = Date.now();
  for (let i = 520; i >= 0; i--) {
    const t = now - i * 7 * 86400000;
    const chg = (Math.random() - 0.49) * price * 0.025;
    const o = price;
    price = Math.max(50, price + chg);
    const c = price;
    const h = Math.max(o, c) * (1 + Math.random() * 0.01);
    const l = Math.min(o, c) * (1 - Math.random() * 0.01);
    const v = Math.floor((500000 + Math.random() * 2000000) * (1 + Math.abs(chg / o) * 5));
    candles.push({ t, o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2), c: +c.toFixed(2), v });
  }
  return candles;
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
  chartRef: React.MutableRefObject<Highcharts.StockChart | null>;
  candles: CandleRaw[];
}) {
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  function applyCustomRange() {
    if (!chartRef.current || !customFrom) return;
    const fromMs = new Date(customFrom).getTime();
    const toMs = customTo ? new Date(customTo).getTime() : Date.now();
    chartRef.current.xAxis[0].setExtremes(fromMs, toMs, true);
  }

  function handlePeriod(key: TP) {
    onChange(key);
    if (!chartRef.current) return;
    const tp = TIME_PERIODS.find((p) => p.key === key)!;
    const xAxis = chartRef.current.xAxis[0];
    if (tp.days >= 9999) {
      xAxis.setExtremes(undefined, undefined, true);
    } else if (tp.key === "YTD") {
      const jan1 = new Date(new Date().getFullYear(), 0, 1).getTime();
      xAxis.setExtremes(jan1, undefined, true);
    } else {
      xAxis.setExtremes(Date.now() - tp.days * 86400000, undefined, true);
    }
  }

  // suppress unused warning — candles available for future use
  void candles;

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
                value={val}
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
  candles, symbol, chartType, instances, onHover,
  activeToolRef, pendingClickRef, chartInstanceRef,
}: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const annotationsRef = useRef<unknown[]>([]);
  const callbackRef = useRef(onHover);

  useEffect(() => { callbackRef.current = onHover; }, [onHover]);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    if (chartInstanceRef.current) {
      annotationsRef.current =
        (chartInstanceRef.current as any).annotations?.map((a: any) => a.options) ?? [];
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    const oscInstances = instances.filter(
      (inst) => INDICATOR_CATALOG.find((d) => d.id === inst.defId)?.isOsc
    );
    const overlayInstances = instances.filter(
      (inst) => !INDICATOR_CATALOG.find((d) => d.id === inst.defId)?.isOsc
    );
    const yAxes = buildYAxes(oscInstances);
    const ohlcData = candles.map((c) => [c.t, c.o, c.h, c.l, c.c]);
    // Volume column bars (green/red based on price direction)
    const volData = candles.map((c) => ({
      x: c.t, y: c.v,
      color: c.c >= c.o ? "rgba(34,197,94,0.55)" : "rgba(239,68,68,0.55)",
    }));
    const volMap = new Map(candles.map((c) => [c.t, c.v]));

    const indicatorSeries: Record<string, unknown>[] = [];
    overlayInstances.forEach((inst) => {
      const def = INDICATOR_CATALOG.find((d) => d.id === inst.defId)!;
      indicatorSeries.push(buildIndicatorSeries(def, 0, inst.params, inst.instanceId, inst.color));
    });
    oscInstances.forEach((inst, i) => {
      const def = INDICATOR_CATALOG.find((d) => d.id === inst.defId)!;
      indicatorSeries.push(buildIndicatorSeries(def, 2 + i, inst.params, inst.instanceId, inst.color));
    });

    const chart = Highcharts.stockChart(containerRef.current, {
      chart: {
        backgroundColor: "#0e1117",
        animation: false,
        panning: { enabled: true, type: "x" },
        zooming: { type: "x", mouseWheel: { enabled: true } } as any,
        margin: [0, 60, 0, 0],
        events: {
          click(e: any) {
            const tool = activeToolRef.current;
            if (tool === "cursor") return;
            const x = e.xAxis?.[0]?.value;
            const y = e.yAxis?.[0]?.value;
            if (x == null || y == null) return;

            if (tool === "erase") {
              const anns: any[] = [...((this as any).annotations ?? [])];
              anns.forEach((a) => { try { a?.destroy?.(); } catch {} });
              annotationsRef.current = [];
              return;
            }
            if (tool === "hline") { drawHLine(this as any, x, y); return; }
            if (tool === "vline") { drawVLine(this as any, x, y); return; }
            if (tool === "label") {
              const text = window.prompt("Label text:");
              if (text) drawLabel(this as any, x, y, text);
              return;
            }

            const pending = pendingClickRef.current;
            if (!pending) {
              pendingClickRef.current = { x, y };
            } else {
              pendingClickRef.current = null;
              if (tool === "trendline") drawTrendLine(this as any, pending, { x, y });
              else if (tool === "ray") drawRay(this as any, pending, { x, y });
              else if (tool === "fib") drawFibonacci(this as any, pending, { x, y });
              else if (tool === "rect") drawRectangle(this as any, pending, { x, y });
              else if (tool === "pitchfork") {
                if ((pending as any).x2 != null) {
                  drawPitchfork(this as any, { x: pending.x, y: pending.y }, { x: (pending as any).x2, y: (pending as any).y2 }, { x, y });
                } else {
                  pendingClickRef.current = { x: pending.x, y: pending.y, x2: x, y2: y } as any;
                }
              }
            }
          },
        },
      },
      title: { text: undefined },
      stockTools: { gui: { enabled: false } } as any,
      xAxis: [{
        crosshair: { snap: false, color: "rgba(148,163,184,0.2)", dashStyle: "Dash", width: 1 },
        labels: { style: { color: "#475569", fontSize: "10px" } },
        lineColor: "#1a2130",
        tickColor: "#1a2130",
        gridLineColor: "#1a2130",
        // Default view: last 3 months ending at the latest candle (or today)
        max: ohlcData.length > 0 ? ohlcData[ohlcData.length - 1][0] : Date.now(),
        min: ohlcData.length > 0
          ? ohlcData[ohlcData.length - 1][0] - 90 * 24 * 60 * 60 * 1000
          : Date.now() - 90 * 24 * 60 * 60 * 1000,
      }],
      yAxis: yAxes,
      tooltip: {
        split: true,
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        style: { color: "#e2e8f0", fontSize: "11px" },
        shadow: false,
        valueDecimals: 1,
      },
      legend: {
        enabled: true,
        align: "left",
        verticalAlign: "top",
        itemStyle: { color: "#94a3b8", fontSize: "11px", fontWeight: "normal" },
        itemHoverStyle: { color: "#e2e8f0" },
        itemHiddenStyle: { color: "#334155" },
        symbolWidth: 14,
        symbolHeight: 2,
      },
      plotOptions: {
        series: { animation: false, showInLegend: true },
        candlestick: { color: "#ef4444", upColor: "#22c55e", lineColor: "#ef4444", upLineColor: "#22c55e" },
        ohlc: { color: "#ef4444", upColor: "#22c55e" },
      },
      series: [
        {
          id: "ohlc",
          type: (chartType === "candlestick-volwidth" ? "candlestick" : chartType) as any,
          name: symbol,
          data: ohlcData,
          yAxis: 0,
          ...(chartType === "candlestick-volwidth" ? { baseVolume: "vol" } : {}),
          dataGrouping: { enabled: false },
          point: {
            events: {
              mouseOver(this: any) {
                callbackRef.current({
                  t: this.x,
                  o: this.open ?? this.y,
                  h: this.high ?? this.y,
                  l: this.low ?? this.y,
                  c: this.close ?? this.y,
                  v: volMap.get(this.x) ?? 0,
                  pct: (this.open ?? 0) > 0
                    ? (((this.close ?? this.y) - (this.open ?? this.y)) / (this.open ?? this.y)) * 100
                    : 0,
                });
              },
            },
          },
          zIndex: 2,
        } as any,
        {
          id: "vol",
          type: "column",
          name: "Volume",
          data: volData,
          yAxis: 1,
          ...(chartType === "candlestick-volwidth" ? { baseVolume: "vol" } : {}),
          dataGrouping: { enabled: false },
          showInLegend: true,
          borderWidth: 0,
          pointPadding: 0,
          groupPadding: 0,
          opacity: 0.7,
          tooltip: {
            pointFormatter(this: any) {
              const v: number = this.y;
              let label: string;
              if (v >= 1e7) label = (v / 1e7).toFixed(2) + " Cr";
              else if (v >= 1e5) label = (v / 1e5).toFixed(2) + " L";
              else if (v >= 1e3) label = (v / 1e3).toFixed(1) + " K";
              else label = String(v);
              return `<span style="color:${this.color}">●</span> Volume: <b>${label}</b><br/>`;
            },
          },
        } as any,
        ...indicatorSeries,
      ],
      navigator: {
        enabled: true,
        height: 50,
        maskFill: "rgba(15,23,42,0.7)",
        outlineColor: "#1e293b",
        handles: { backgroundColor: "#1e3a5f", borderColor: "#3b82f6" },
        series: { color: "#3b82f6", lineColor: "#3b82f6", lineWidth: 1, type: "line" } as any,
        xAxis: { labels: { style: { color: "#475569", fontSize: "9px" } } },
      },
      rangeSelector: { enabled: false },
      scrollbar: {
        enabled: true,
        barBackgroundColor: "#1e293b",
        rifleColor: "#334155",
        buttonBackgroundColor: "#0e1117",
        trackBackgroundColor: "#0e1117",
        barBorderRadius: 2,
        buttonBorderRadius: 1,
        height: 10,
      },
      credits: { enabled: false },
      annotations: [],
    } as any);

    annotationsRef.current.forEach((opts) => {
      try { (chart as any).addAnnotation(opts); } catch {}
    });

    const el = containerRef.current;
    const handleLeave = () => callbackRef.current(null);
    el.addEventListener("mouseleave", handleLeave);

    chartInstanceRef.current = chart;
    return () => {
      el.removeEventListener("mouseleave", handleLeave);
      chart.destroy();
      chartInstanceRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, symbol, chartType, instances]);

  return <div ref={containerRef} className="w-full h-full" style={{ minHeight: 400 }} />;
}

// ─── Charts Page ─────────────────────────────────────────────────────────────────
export default function ChartsPage() {
  const [hcReady, setHcReady] = useState(false);
  const [symbols, setSymbols] = useState<SymbolItem[]>(DUMMY_SYMBOLS);
  const [symbol, setSymbol] = useState<string>("RELIANCE");
  const [candlePeriod, setCandlePeriod] = useState<TF>("1W");
  const [chartType, setChartType] = useState("candlestick");
  const [timePeriod, setTimePeriod] = useState<TP>("1Y");
  const [candles, setCandles] = useState<CandleRaw[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
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
  const chartInstanceRef = useRef<Highcharts.StockChart | null>(null);

  useEffect(() => {
    loadHcModules().then(() => setHcReady(true)).catch(console.error);
  }, []);

  useEffect(() => {
    api<SymbolItem[]>("/charts/symbols").then(setSymbols).catch(() => {});
  }, []);

  const fetchCandles = useCallback(async (sym: string, tf: TF) => {
    setLoading(true);
    setError(null);
    setIsDemo(false);
    try {
      // No from/to — backend calculates from today backwards per timeframe
      const data = await api<{ candles: CandleRaw[] }>(
        `/charts/candles?symbol=${sym}&timeframe=${tf}&limit=2000`
      );
      if (data?.candles?.length) {
        setCandles(data.candles);
      } else {
        setCandles(generateDummyCandles(sym));
        setIsDemo(true);
        setError(`No data for ${sym} (${tf}). Demo mode.`);
      }
    } catch {
      setCandles(generateDummyCandles(sym));
      setIsDemo(true);
      setError("API unavailable — showing demo data.");
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
    if (!chartInstanceRef.current) return;
    const anns: any[] = [...((chartInstanceRef.current as any).annotations ?? [])];
    anns.forEach((a) => { try { a?.destroy?.(); } catch {} });
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
          {isDemo && (
            <span className="px-2 py-0.5 rounded text-[10px] bg-yellow-900 text-yellow-300 border border-yellow-700">DEMO</span>
          )}
          {error && !isDemo && (
            <span className="text-[10px] text-red-400 max-w-[180px] truncate" title={error}>{error}</span>
          )}
          <button
            onClick={clearAnnotations}
            className="px-2.5 py-1 rounded bg-[#1e293b] hover:bg-[#253347] text-slate-400 hover:text-slate-200 text-xs border border-[#334155] transition-colors"
            title="Clear all drawings"
          >
            🗑 Clear
          </button>
          <button
            onClick={() => (chartInstanceRef.current as any)?.fullscreen?.toggle()}
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
            ) : hcReady && candles.length > 0 ? (
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
            ) : !loading && !hcReady ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-slate-600 text-xs">Initializing chart engine…</span>
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
