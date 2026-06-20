"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { istToMs } from "@/lib/highcharts";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, HistogramSeries, LineSeries,
  createSeriesMarkers,
  type IChartApi, type LogicalRange, type UTCTimestamp,
} from "lightweight-charts";

// ── Types ─────────────────────────────────────────────────────────────────────
type IKind = "SMA"|"EMA"|"WMA"|"RSI"|"MACD"|"VWAP"|"BBANDS"|"SUPERTREND"|"price"|"value";
type Src   = "close"|"open"|"high"|"low";
type Op    = "crosses above"|"crosses below"|">"|"<"|">="|"<="|"==";
type ExitM = "%"|"pts"|"₹";

interface CInd { kind: IKind; src?: Src; period?: number; offset?: number; value?: number; }
interface ECond { id: string; lhs: CInd; op: Op; rhs: CInd; }

interface Trade {
  entryDate: string; entryPrice: number;
  exitDate: string; exitPrice: number;
  exitReason: "SL" | "TP" | "TSL" | "END";
  pnl: number; pnlPct: number; holdDays: number;
}
interface StockResult {
  symbol: string; trades: Trade[];
  totalPnl: number; winRate: number; maxDD: number;
  sharpe: number; totalTrades: number; winTrades: number;
  error?: string;
}
interface NSESymbol { symbol: string; name: string; sector: string; }
interface OHLCVRow { time: string; open: number; high: number; low: number; close: number; volume: number; }

// ── Constants ─────────────────────────────────────────────────────────────────
const OPS: Op[] = ["crosses above","crosses below",">","<",">=","<=","=="];
const KINDS: IKind[] = ["SMA","EMA","WMA","RSI","MACD","VWAP","BBANDS","SUPERTREND","price","value"];
const TFs = ["1D","1W","1H","15m","5m","3m"] as const;
const PAL = ["#f59e0b","#3b82f6","#a855f7","#06b6d4","#f97316","#ec4899"];

// Map chart TF labels → stock_data_* table keys (used by /orb/chart-data)
const TF_TO_TIMEFRAME: Record<string, string> = {
  "5m": "5min", "15m": "15min", "1H": "75min",
  "1D": "daily", "1W": "weekly", "3m": "5min",
};

const SETUPS: Array<{name:string; mk:()=>ECond}> = [
  { name:"SMA",        mk:()=>mkC({kind:"SMA",src:"close",period:9},{kind:"SMA",src:"close",period:21},"crosses above") },
  { name:"EMA",        mk:()=>mkC({kind:"EMA",src:"close",period:9},{kind:"EMA",src:"close",period:21},"crosses above") },
  { name:"RSI > 60",   mk:()=>mkC({kind:"RSI",src:"close",period:14},{kind:"value",value:60},">") },
  { name:"RSI < 40",   mk:()=>mkC({kind:"RSI",src:"close",period:14},{kind:"value",value:40},"<") },
  { name:"MACD Cross", mk:()=>mkC({kind:"MACD",src:"close",period:12},{kind:"value",value:0},"crosses above") },
  { name:"VWAP Cross", mk:()=>mkC({kind:"price"},{kind:"VWAP"},"crosses above") },
  { name:"BB Upper",   mk:()=>mkC({kind:"price"},{kind:"BBANDS",period:20},">") },
  { name:"Supertrend", mk:()=>mkC({kind:"SUPERTREND",period:10},{kind:"price"},"crosses above") },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
let _id = 0;
function uid() { return `c${++_id}${Math.random().toString(36).slice(2,6)}`; }
function mkC(lhs: CInd, rhs: CInd, op: Op): ECond { return { id: uid(), lhs, rhs, op }; }
function fmt(ind: CInd): string {
  if (ind.kind === "value") return String(ind.value ?? 0);
  if (ind.kind === "price") return "Price";
  if (ind.kind === "VWAP")  return "VWAP";
  return `${ind.kind}(${ind.src??"close"},${ind.period??14},${ind.offset??0})`;
}

// ── Indicator math ────────────────────────────────────────────────────────────
function sma(cl: number[], p: number) {
  return cl.map((_, i) => i < p-1 ? NaN : cl.slice(i-p+1,i+1).reduce((a,b)=>a+b)/p);
}
function ema(cl: number[], p: number) {
  const k = 2/(p+1), out: number[] = [];
  cl.forEach((v,i) => out.push(i===0 ? v : v*k + out[i-1]*(1-k)));
  return out;
}
function rsi(cl: number[], p = 14) {
  const out: number[] = new Array(p).fill(NaN);
  let ag=0,al=0;
  for (let i=1;i<=p;i++) { const d=cl[i]-cl[i-1]; ag+=Math.max(0,d)/p; al+=Math.max(0,-d)/p; }
  for (let i=p;i<cl.length;i++) {
    const d=cl[i]-cl[i-1];
    ag=(ag*(p-1)+Math.max(0,d))/p; al=(al*(p-1)+Math.max(0,-d))/p;
    out.push(100-100/(1+ag/Math.max(al,1e-10)));
  }
  return out;
}
function macd(cl: number[], fast=12,slow=26,sig=9) {
  const ef=ema(cl,fast), es=ema(cl,slow);
  const ml=ef.map((v,i)=>v-es[i]);
  const sl=ema(ml,sig);
  const hist=ml.map((v,i)=>v-sl[i]);
  return { ml, sl, hist };
}
function bbands(cl: number[], p=20, std=2) {
  const mid=sma(cl,p);
  const upper=mid.map((m,i)=>{
    if(isNaN(m)) return NaN;
    const s=Math.sqrt(cl.slice(i-p+1,i+1).reduce((a,v)=>a+(v-m)**2,0)/p);
    return m+std*s;
  });
  const lower=mid.map((m,i)=>{
    if(isNaN(m)) return NaN;
    const s=Math.sqrt(cl.slice(i-p+1,i+1).reduce((a,v)=>a+(v-m)**2,0)/p);
    return m-std*s;
  });
  return { upper, mid, lower };
}
function vwap(rows: OHLCVRow[]) {
  let cumPV=0, cumV=0;
  return rows.map(r=>{ const tp=(r.high+r.low+r.close)/3; cumPV+=tp*r.volume; cumV+=r.volume; return cumPV/cumV; });
}
function supertrend(rows: OHLCVRow[], p=10, mult=3) {
  const cl=rows.map(r=>r.close), hi=rows.map(r=>r.high), lo=rows.map(r=>r.low);
  const atr: number[] = [];
  for(let i=0;i<rows.length;i++){
    const tr = i===0 ? hi[i]-lo[i] : Math.max(hi[i]-lo[i],Math.abs(hi[i]-cl[i-1]),Math.abs(lo[i]-cl[i-1]));
    atr.push(i<p-1 ? NaN : i===p-1 ? rows.slice(0,p).reduce((a,r)=>a+(r.high-r.low),0)/p : (atr[i-1]*(p-1)+tr)/p);
  }
  const out: number[] = [];
  let dir=1;
  for(let i=0;i<rows.length;i++){
    if(isNaN(atr[i])){ out.push(NaN); continue; }
    const hl2=(hi[i]+lo[i])/2;
    const upper=hl2+mult*atr[i], lower=hl2-mult*atr[i];
    if(i===0){ out.push(lower); continue; }
    if(cl[i] > out[i-1]) dir=1; else if(cl[i] < out[i-1]) dir=-1;
    out.push(dir===1 ? lower : upper);
  }
  return out;
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

function toSec(t: string): UTCTimestamp {
  return Math.floor(istToMs(t) / 1000) as UTCTimestamp;
}

function formatVol(v: number): string {
  if (v >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} K`;
  return String(v);
}


// ── Figure out what indicators are needed from conditions ─────────────────────
function activeInds(conds: ECond[]) {
  const seen = new Set<string>();
  const list: Array<{kind:IKind; period:number; src:Src; offset:number; color:string}> = [];
  let ci=0;
  for (const c of conds) {
    for (const s of [c.lhs,c.rhs]) {
      if(s.kind==="price"||s.kind==="value") continue;
      const key=`${s.kind}-${s.period??14}-${s.src??"close"}`;
      if(seen.has(key)) continue; seen.add(key);
      list.push({ kind:s.kind, period:s.period??14, src:(s.src??"close") as Src, offset:s.offset??0, color:PAL[ci++%PAL.length] });
    }
  }
  return list;
}


// ── TradingChart ──────────────────────────────────────────────────────────────
function TradingChart({ ohlcv, conds, trades, action, focusTrade }: {
  ohlcv: OHLCVRow[]; conds: ECond[]; trades?: Trade[]; action?: "BUY"|"SELL";
  focusTrade?: Trade | null;
}) {
  const mainRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const chartRefs = useRef<{ main: IChartApi | null; rsi: IChartApi | null; macd: IChartApi | null }>({
    main: null, rsi: null, macd: null,
  });

  const inds = useMemo(() => activeInds(conds), [conds]);
  const hasRSI  = inds.some(x=>x.kind==="RSI");
  const hasMACD = inds.some(x=>x.kind==="MACD");

  const closes = useMemo(() => ohlcv.map(r=>r.close), [ohlcv]);

  const seriesData = useMemo(() => {
    const result: Array<{color:string; data:Array<{time:string;value:number}>}> = [];
    for (const ind of inds) {
      if(ind.kind==="RSI"||ind.kind==="MACD") continue;
      let vals: number[];
      if(ind.kind==="SMA") vals=sma(closes,ind.period);
      else if(ind.kind==="EMA") vals=ema(closes,ind.period);
      else if(ind.kind==="WMA") vals=sma(closes,ind.period);
      else if(ind.kind==="VWAP") vals=vwap(ohlcv);
      else if(ind.kind==="SUPERTREND") vals=supertrend(ohlcv,ind.period,3);
      else if(ind.kind==="BBANDS") {
        const {upper,mid,lower}=bbands(closes,ind.period,2);
        [upper,mid,lower].forEach((arr,bi)=>{
          result.push({ color:[ind.color,"#94a3b8",ind.color][bi],
            data:ohlcv.map((r,i)=>({time:r.time,value:arr[i]})).filter(x=>!isNaN(x.value)) });
        });
        continue;
      } else continue;
      result.push({ color:ind.color, data:ohlcv.map((r,i)=>({time:r.time,value:vals[i]})).filter(x=>!isNaN(x.value)) });
    }
    return result;
  }, [inds, ohlcv, closes]);

  const rsiData  = useMemo(()=>hasRSI  ? rsi(closes,14)  : [],   [hasRSI,closes]);
  const macdData = useMemo(()=>hasMACD ? macd(closes)     : null, [hasMACD,closes]);

  useEffect(() => {
    const mainEl = mainRef.current;
    chartRefs.current.main?.remove();
    chartRefs.current.rsi?.remove();
    chartRefs.current.macd?.remove();
    chartRefs.current = { main: null, rsi: null, macd: null };
    if (!mainEl || ohlcv.length === 0) return;

    const buildChart = (el: HTMLDivElement) => createChart(el, {
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
      timeScale: {
        borderColor: TV.border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: UTCTimestamp) =>
          new Date((time as number) * 1000).toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false,
          }),
      },
      localization: {
        timeFormatter: (time: UTCTimestamp) =>
          new Date((time as number) * 1000).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", hour12: false,
          }),
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    const mainChart = buildChart(mainEl);
    chartRefs.current.main = mainChart;

    const candleSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: TV.up,
      downColor: TV.down,
      borderUpColor: TV.up,
      borderDownColor: TV.down,
      wickUpColor: TV.up,
      wickDownColor: TV.down,
    });
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.28 } });
    candleSeries.setData(ohlcv.map((r) => ({
      time: toSec(r.time), open: r.open, high: r.high, low: r.low, close: r.close,
    })));

    const volSeries = mainChart.addSeries(HistogramSeries, {
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
    });
    mainChart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volSeries.setData(ohlcv.map((r) => ({
      time: toSec(r.time),
      value: r.volume,
      color: r.close >= r.open ? TV.upVol : TV.downVol,
    })));

    seriesData.forEach(({ color, data }) => {
      const overlay = mainChart.addSeries(LineSeries, {
        color,
        lineWidth: color === "#94a3b8" ? 1 : 2,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      overlay.setData(data.map((d) => ({ time: toSec(d.time), value: d.value })));
    });

    if (trades?.length) {
      const isBuy = action !== "SELL";
      const markers = [
        ...trades.map((t) => ({
          time: toSec(t.entryDate),
          position: "belowBar" as const,
          color: isBuy ? TV.up : TV.down,
          shape: isBuy ? "arrowUp" as const : "arrowDown" as const,
          text: `${isBuy ? "B" : "S"} ${t.entryPrice.toFixed(2)}`,
          size: 1,
        })),
        ...trades.map((t) => ({
          time: toSec(t.exitDate),
          position: "aboveBar" as const,
          color: t.exitReason === "SL" ? TV.down : t.exitReason === "TP" ? "#3b82f6" : "#f59e0b",
          shape: "arrowDown" as const,
          text: `${t.exitReason} ${t.exitPrice.toFixed(2)}`,
          size: 1,
        })),
      ].sort((a, b) => (a.time as number) - (b.time as number));
      createSeriesMarkers(candleSeries, markers);
    }

    mainEl.style.position = "relative";
    const legend = document.createElement("div");
    legend.style.cssText = `position:absolute;top:8px;left:12px;z-index:10;pointer-events:none;font-family:'Inter',system-ui;font-size:12px;color:${TV.text};background:rgba(19,23,34,0.9);padding:4px 10px;border-radius:4px;border:1px solid ${TV.border};line-height:1.8;`;
    mainEl.appendChild(legend);

    mainChart.subscribeCrosshairMove((param) => {
      if (!param.time) { legend.innerHTML = ""; return; }
      const cd = param.seriesData.get(candleSeries) as { open: number; high: number; low: number; close: number } | undefined;
      const vd = param.seriesData.get(volSeries) as { value: number } | undefined;
      if (!cd) { legend.innerHTML = ""; return; }
      const chg = cd.close - cd.open;
      const pct = cd.open ? ((chg / cd.open) * 100).toFixed(2) : "0.00";
      const col = chg >= 0 ? TV.up : TV.down;
      const ts = new Date((param.time as number) * 1000).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
      legend.innerHTML = `<span style="color:${TV.axisLabel};font-size:11px">${ts}</span>&nbsp;&nbsp;`
        + `<span style="color:${col}">O</span>&nbsp;<b>${cd.open.toFixed(2)}</b>&nbsp;`
        + `<span style="color:${col}">H</span>&nbsp;<b>${cd.high.toFixed(2)}</b>&nbsp;`
        + `<span style="color:${col}">L</span>&nbsp;<b>${cd.low.toFixed(2)}</b>&nbsp;`
        + `<span style="color:${col}">C</span>&nbsp;<b>${cd.close.toFixed(2)}</b>&nbsp;&nbsp;`
        + `<span style="color:${col};font-weight:700">${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(2)} (${pct}%)</span>`
        + (vd ? `&nbsp;&nbsp;<span style="color:${TV.axisLabel}">Vol</span>&nbsp;<b>${formatVol(vd.value)}</b>` : "");
    });

    const extraCharts: IChartApi[] = [];

    if (hasRSI && rsiRef.current) {
      const rsiChart = buildChart(rsiRef.current);
      chartRefs.current.rsi = rsiChart;
      extraCharts.push(rsiChart);
      const rsiSeries = rsiChart.addSeries(LineSeries, {
        color: "#a855f7",
        lineWidth: 2,
        lastValueVisible: false,
      });
      rsiSeries.setData(ohlcv.map((r, i) => ({ time: toSec(r.time), value: rsiData[i] })).filter((d) => !isNaN(d.value)));
      rsiSeries.createPriceLine({ price: 70, color: TV.down, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "70" });
      rsiSeries.createPriceLine({ price: 50, color: TV.axisLabel, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
      rsiSeries.createPriceLine({ price: 30, color: TV.up, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "30" });
      rsiChart.priceScale("right").applyOptions({ autoScale: false, scaleMargins: { top: 0.12, bottom: 0.12 } });
    }

    if (hasMACD && macdData && macdRef.current) {
      const macdChart = buildChart(macdRef.current);
      chartRefs.current.macd = macdChart;
      extraCharts.push(macdChart);
      const histSeries = macdChart.addSeries(HistogramSeries, {
        priceLineVisible: false,
        lastValueVisible: false,
      });
      histSeries.setData(ohlcv.map((r, i) => ({
        time: toSec(r.time),
        value: macdData.hist[i],
        color: macdData.hist[i] >= 0 ? TV.upVol : TV.downVol,
      })).filter((d) => !isNaN(d.value)));
      const macdLine = macdChart.addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 2,
        lastValueVisible: false,
      });
      macdLine.setData(ohlcv.map((r, i) => ({ time: toSec(r.time), value: macdData.ml[i] })).filter((d) => !isNaN(d.value)));
      const signalLine = macdChart.addSeries(LineSeries, {
        color: "#f97316",
        lineWidth: 2,
        lastValueVisible: false,
      });
      signalLine.setData(ohlcv.map((r, i) => ({ time: toSec(r.time), value: macdData.sl[i] })).filter((d) => !isNaN(d.value)));
      macdLine.createPriceLine({ price: 0, color: TV.axisLabel, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
    }

    const charts = [mainChart, ...extraCharts];
    let syncing = false;
    const handlers = charts.map((chart) => {
      const handler = (range: LogicalRange | null) => {
        if (!range || syncing) return;
        syncing = true;
        charts.forEach((target) => {
          if (target !== chart) target.timeScale().setVisibleLogicalRange(range);
        });
        syncing = false;
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
      return { chart, handler };
    });

    charts.forEach((chart) => chart.timeScale().fitContent());
    const initialRange = mainChart.timeScale().getVisibleLogicalRange();
    if (initialRange) extraCharts.forEach((chart) => chart.timeScale().setVisibleLogicalRange(initialRange));

    const resizeObservers: ResizeObserver[] = [];
    const resizeTargets: Array<{ el: HTMLDivElement; chart: IChartApi }> = [
      { el: mainEl, chart: mainChart },
      ...(chartRefs.current.rsi && rsiRef.current ? [{ el: rsiRef.current, chart: chartRefs.current.rsi }] : []),
      ...(chartRefs.current.macd && macdRef.current ? [{ el: macdRef.current, chart: chartRefs.current.macd }] : []),
    ];
    resizeTargets.forEach(({ el, chart }) => {
      const ro = new ResizeObserver(() => {
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      });
      ro.observe(el);
      resizeObservers.push(ro);
    });

    return () => {
      handlers.forEach(({ chart, handler }) => chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler));
      resizeObservers.forEach((ro) => ro.disconnect());
      if (mainEl.contains(legend)) mainEl.removeChild(legend);
      chartRefs.current.main?.remove();
      chartRefs.current.rsi?.remove();
      chartRefs.current.macd?.remove();
      chartRefs.current = { main: null, rsi: null, macd: null };
    };
  }, [ohlcv, seriesData, hasRSI, hasMACD, rsiData, macdData, trades, action]);

  // ── Zoom to focused trade when one is selected ──────────────────────────
  useEffect(() => {
    if (!focusTrade || !chartRefs.current.main) return;
    const pad = 10 * 86400; // 10 day padding each side
    const from = (Math.floor(new Date(focusTrade.entryDate + "T00:00:00Z").getTime() / 1000) - pad) as UTCTimestamp;
    const to   = (Math.floor(new Date(focusTrade.exitDate  + "T23:59:59Z").getTime() / 1000) + pad) as UTCTimestamp;
    try { chartRefs.current.main.timeScale().setVisibleRange({ from, to }); } catch {}
    if (chartRefs.current.rsi)  try { chartRefs.current.rsi.timeScale().setVisibleRange({ from, to });  } catch {}
    if (chartRefs.current.macd) try { chartRefs.current.macd.timeScale().setVisibleRange({ from, to }); } catch {}
  }, [focusTrade]);

  return (
    <div className="flex h-full flex-col">
      <div ref={mainRef} className="min-h-0 flex-1" />
      {hasRSI && <div ref={rsiRef} className="h-[120px] shrink-0 border-t border-slate-800" />}
      {hasMACD && <div ref={macdRef} className="h-[120px] shrink-0 border-t border-slate-800" />}
    </div>
  );
}

// ── IndicatorEditor popover ────────────────────────────────────────────────────
function IndEditor({ ind, onDone, onCancel }: { ind:CInd; onDone:(v:CInd)=>void; onCancel:()=>void }) {
  const [d,setD]=useState<CInd>(ind);
  const u=(p:Partial<CInd>)=>setD(x=>({...x,...p}));
  return (
    <div className="absolute z-50 top-full left-0 mt-1 p-3 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-60 space-y-2.5">
      <div className="flex gap-2">
        <div className="flex-1">
          <p className="text-[10px] text-slate-500 uppercase mb-1">Type</p>
          <select value={d.kind} onChange={e=>u({kind:e.target.value as IKind})}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none">
            {KINDS.map(k=><option key={k}>{k}</option>)}
          </select>
        </div>
        {d.kind!=="price"&&d.kind!=="value"&&(
          <div>
            <p className="text-[10px] text-slate-500 uppercase mb-1">Src</p>
            <select value={d.src??"close"} onChange={e=>u({src:e.target.value as Src})}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none">
              {(["close","open","high","low"] as Src[]).map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>
      {d.kind!=="price"&&d.kind!=="value"&&(
        <div className="grid grid-cols-2 gap-2">
          {[["Period",d.period??14,"period"],["Offset",d.offset??0,"offset"]].map(([lbl,val,key])=>(
            <div key={key as string}>
              <p className="text-[10px] text-slate-500 uppercase mb-1">{lbl}</p>
              <input type="number" min={0} value={val as number} onChange={e=>u({[key as string]:Number(e.target.value)})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none"/>
            </div>
          ))}
        </div>
      )}
      {d.kind==="value"&&(
        <div>
          <p className="text-[10px] text-slate-500 uppercase mb-1">Value</p>
          <input type="number" value={d.value??0} onChange={e=>u({value:Number(e.target.value)})}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none"/>
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={()=>onDone(d)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg py-1.5 transition-colors">Apply</button>
        <button onClick={onCancel} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg py-1.5 transition-colors">Cancel</button>
      </div>
    </div>
  );
}

function IndPill({ ind, onChange }: { ind:CInd; onChange:(v:CInd)=>void }) {
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open) return;
    const h=(e:MouseEvent)=>{ if(ref.current&&!ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={()=>setOpen(o=>!o)}
        className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono transition-all ${open
          ?"bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
          :"bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500"}`}>
        {fmt(ind)}
      </button>
      {open&&<IndEditor ind={ind} onDone={v=>{onChange(v);setOpen(false);}} onCancel={()=>setOpen(false)}/>}
    </div>
  );
}

// ── ConditionRow ───────────────────────────────────────────────────────────────
function CondRow({ cond, isFirst, onChange, onDel }: { cond:ECond; isFirst:boolean; onChange:(c:ECond)=>void; onDel:()=>void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap py-0.5 group">
      <span className="text-[11px] font-bold text-slate-600 w-7 shrink-0">{isFirst?"If":"And"}</span>
      <IndPill ind={cond.lhs} onChange={lhs=>onChange({...cond,lhs})}/>
      <select value={cond.op} onChange={e=>onChange({...cond,op:e.target.value as Op})}
        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-400 focus:outline-none cursor-pointer hover:border-slate-500 transition-colors">
        {OPS.map(o=><option key={o}>{o}</option>)}
      </select>
      <IndPill ind={cond.rhs} onChange={rhs=>onChange({...cond,rhs})}/>
      <button onClick={onDel} className="ml-auto opacity-0 group-hover:opacity-100 p-1 text-slate-700 hover:text-rose-500 transition-all rounded">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9"/></svg>
      </button>
    </div>
  );
}

// ── Accordion section ─────────────────────────────────────────────────────────
function Accordion({ title, badge, children, defaultOpen=true }: { title:string; badge?:string; children:React.ReactNode; defaultOpen?:boolean }) {
  const [open,setOpen]=useState(defaultOpen);
  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      <button onClick={()=>setOpen(o=>!o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/60 hover:bg-slate-900 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">{title}</span>
          {badge&&<span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">{badge}</span>}
        </div>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 text-slate-500 transition-transform ${open?"rotate-180":""}`}>
          <path d="M4 6l4 4 4-4"/>
        </svg>
      </button>
      {open&&<div className="p-4 bg-slate-950 space-y-4">{children}</div>}
    </div>
  );
}

// ── Instrument chip with DB symbol search ─────────────────────────────────────
function InstrumentRow({ instruments, active, onSwitch, onRemove, onAdd }: {
  instruments:string[]; active:string; onSwitch:(s:string)=>void; onRemove:(s:string)=>void;
  onAdd:(s:string)=>void;
}) {
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const [results,setResults]=useState<NSESymbol[]>([]);
  const [loading,setLoading]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open) return;
    const h=(e:MouseEvent)=>{ if(ref.current&&!ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[open]);
  useEffect(()=>{
    if(!q){setResults([]);return;}
    setLoading(true);
    api<NSESymbol[]>(`/charts/symbols`).then(all=>{
      const lq=q.toLowerCase();
      setResults(all.filter(s=>!instruments.includes(s.symbol)&&(s.symbol.toLowerCase().includes(lq)||s.name.toLowerCase().includes(lq))).slice(0,8));
    }).catch(()=>setResults([])).finally(()=>setLoading(false));
  },[q,instruments]);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {instruments.map(sym=>(
        <div key={sym} onClick={()=>onSwitch(sym)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer transition-all ${sym===active
            ?"bg-blue-600/20 border-blue-500/40 text-blue-300"
            :"bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600"}`}>
          <span className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[7px] font-bold text-white">{sym[0]}</span>
          {sym}
          {instruments.length>1&&<button onClick={e=>{e.stopPropagation();onRemove(sym);}} className="text-slate-600 hover:text-rose-400 ml-0.5">×</button>}
        </div>
      ))}
      <div ref={ref} className="relative">
        <button onClick={()=>{setOpen(o=>!o);setQ("");}}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-slate-700 text-[10px] text-slate-600 hover:border-emerald-600 hover:text-emerald-500 transition-colors">
          + Add
        </button>
        {open&&(
          <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
            <div className="p-2">
              <input autoFocus value={q} onChange={e=>setQ(e.target.value)}
                placeholder="Search 750 NSE symbols…"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500"/>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {loading && <p className="px-3 py-2 text-xs text-slate-500">Searching…</p>}
              {!loading && q && results.length===0 && <p className="px-3 py-3 text-xs text-slate-600 text-center">No matches for "{q}"</p>}
              {!loading && !q && <p className="px-3 py-3 text-xs text-slate-600 text-center">Type to search…</p>}
              {results.map(s=>(
                <button key={s.symbol} onClick={()=>{onAdd(s.symbol);setOpen(false);setQ("");}}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-700 text-left">
                  <span className="font-bold text-slate-100 text-sm w-24 shrink-0 font-mono">{s.symbol}</span>
                  <span className="text-slate-500 text-xs truncate">{s.name}</span>
                  <span className="ml-auto text-[9px] text-slate-600 shrink-0">{s.sector}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Indicator Equity Curve ────────────────────────────────────────────────────
function IndicatorEquityCurve({ trades }: { trades: Trade[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !trades.length) return;
    const sorted = [...trades].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
    // Aggregate P&L per date (avoid duplicate timestamps)
    const dayMap = new Map<string, number>();
    sorted.forEach(t => dayMap.set(t.entryDate, (dayMap.get(t.entryDate) ?? 0) + t.pnl));
    let cum = 0;
    const lineData: {time: UTCTimestamp; value: number}[] = [];
    const histData: {time: UTCTimestamp; value: number; color: string}[] = [];
    [...dayMap.entries()].sort().forEach(([d, pnl]) => {
      cum += pnl;
      const sec = Math.floor(new Date(d + "T00:00:00Z").getTime() / 1000) as UTCTimestamp;
      lineData.push({ time: sec, value: cum });
      histData.push({ time: sec, value: pnl, color: pnl >= 0 ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)" });
    });
    const chart = createChart(el, {
      width: el.clientWidth, height: el.clientHeight,
      layout: { background: { type: ColorType.Solid, color: "#131722" }, textColor: "#d1d4dc", fontFamily: "'Inter',ui-sans-serif", fontSize: 11 },
      grid: { vertLines: { color: "#1e2030" }, horzLines: { color: "#1e2030" } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "#758696", width: 1 as const, labelBackgroundColor: "#1e222d" }, horzLine: { color: "#758696", width: 1 as const, labelBackgroundColor: "#1e222d" } },
      rightPriceScale: { borderColor: "#2a2e39" },
      timeScale: { borderColor: "#2a2e39", timeVisible: true, secondsVisible: false,
        tickMarkFormatter: (t: UTCTimestamp) => new Date((t as number)*1000).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" }) },
      localization: { priceFormatter: (p: number) => `₹${p.toFixed(0)}` },
    });
    const bars = chart.addSeries(HistogramSeries, { priceScaleId: "bars" });
    chart.priceScale("bars").applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });
    bars.setData(histData);
    const line = chart.addSeries(LineSeries, { color: cum >= 0 ? "#26a69a" : "#ef5350", lineWidth: 2, lastValueVisible: true });
    line.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.28 } });
    line.setData(lineData);
    line.createPriceLine({ price: 0, color: "#475569", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
    // Legend
    el.style.position = "relative";
    const leg = document.createElement("div");
    leg.style.cssText = "position:absolute;top:8px;left:12px;z-index:10;pointer-events:none;font-size:11px;color:#d1d4dc;background:rgba(19,23,34,0.85);padding:4px 10px;border-radius:4px;border:1px solid #2a2e39;";
    el.appendChild(leg);
    chart.subscribeCrosshairMove(p => {
      const ld = p.seriesData.get(line) as any;
      const bd = p.seriesData.get(bars) as any;
      if (!ld && !bd) { leg.innerHTML = ""; return; }
      const col = (ld?.value ?? 0) >= 0 ? "#26a69a" : "#ef5350";
      const bc = (bd?.value ?? 0) >= 0 ? "#26a69a" : "#ef5350";
      leg.innerHTML = `<span style="color:#787b86">Equity</span> <b style="color:${col}">${ld ? `₹${ld.value.toFixed(0)}` : "—"}</b>` + (bd ? `  <span style="color:#787b86">Day P&L</span> <b style="color:${bc}">₹${bd.value.toFixed(0)}</b>` : "");
    });
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => { ro.disconnect(); if (el.contains(leg)) el.removeChild(leg); chart.remove(); };
  }, [trades]);
  if (!trades.length) return <div className="flex items-center justify-center h-full text-slate-600 text-xs">No trades</div>;
  return <div ref={ref} className="w-full h-full" />;
}

// ── Monthly P&L Grid (indicator) ─────────────────────────────────────────────
function IndicatorMonthlyGrid({ trades }: { trades: Trade[] }) {
  const monthly = useMemo(() => {
    const map: Record<string, { pnl: number; count: number; wins: number }> = {};
    for (const t of trades) {
      const d = t.entryDate.slice(0, 7); // YYYY-MM
      if (!map[d]) map[d] = { pnl: 0, count: 0, wins: 0 };
      map[d].pnl += t.pnl; map[d].count++; if (t.pnl > 0) map[d].wins++;
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [trades]);
  if (!monthly.length) return null;
  const maxAbs = Math.max(...monthly.map(([, v]) => Math.abs(v.pnl)), 1);
  return (
    <div>
      <p className="text-[10px] font-bold text-[#787b86] uppercase tracking-widest mb-2">Monthly P&L</p>
      <div className="flex flex-wrap gap-2">
        {monthly.map(([key, v]) => {
          const monthName = new Date(key + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
          const intensity = Math.min(Math.abs(v.pnl) / maxAbs, 1);
          const bg = v.pnl >= 0 ? `rgba(38,166,154,${0.08 + intensity * 0.4})` : `rgba(239,83,80,${0.08 + intensity * 0.4})`;
          const border = v.pnl >= 0 ? "rgba(38,166,154,0.3)" : "rgba(239,83,80,0.3)";
          const col = v.pnl >= 0 ? "#26a69a" : "#ef5350";
          return (
            <div key={key} className="rounded-lg p-2.5 text-center min-w-[72px]" style={{ background: bg, border: `1px solid ${border}` }}>
              <p className="text-[9px] text-[#787b86] font-bold">{monthName}</p>
              <p className="text-sm font-bold font-mono mt-0.5" style={{ color: col }}>{v.pnl >= 0 ? "+" : "−"}₹{Math.abs(v.pnl).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
              <p className="text-[8px] text-[#787b86] mt-0.5">{v.count}t · {Math.round(v.wins / v.count * 100)}%</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Indicator Trade Log ────────────────────────────────────────────────────────
function IndicatorTradeLog({ trades, symbol, onTradeClick, activeTrade }: {
  trades: Trade[];
  symbol: string;
  onTradeClick?: (trade: Trade | null) => void;
  activeTrade?: Trade | null;
}) {
  const [filter, setFilter] = useState<"all"|"win"|"loss">("all");
  const [search, setSearch] = useState("");
  const [sortK, setSortK] = useState<"entryDate"|"pnl"|"holdDays">("entryDate");
  const [asc, setAsc] = useState(true);
  const filtered = useMemo(() => {
    let rows = [...trades];
    if (filter === "win") rows = rows.filter(t => t.pnl > 0);
    if (filter === "loss") rows = rows.filter(t => t.pnl <= 0);
    if (search) rows = rows.filter(t => t.entryDate.includes(search) || t.exitReason.toLowerCase().includes(search.toLowerCase()));
    rows.sort((a, b) => {
      const va = a[sortK], vb = b[sortK];
      if (va < vb) return asc ? -1 : 1;
      if (va > vb) return asc ? 1 : -1;
      return 0;
    });
    return rows;
  }, [trades, filter, search, sortK, asc]);
  function thClick(k: typeof sortK) { if (sortK === k) setAsc(x => !x); else { setSortK(k); setAsc(true); } }
  const Th = ({ k, label }: { k: typeof sortK; label: string }) => (
    <th className="pb-2 pr-3 text-left text-[10px] uppercase tracking-widest cursor-pointer hover:text-slate-300 select-none whitespace-nowrap" onClick={() => thClick(k)}>
      {label} {sortK === k ? (asc ? "▲" : "▼") : <span className="opacity-30">⇅</span>}
    </th>
  );
  const reasonStyle: Record<string, string> = {
    SL:  "bg-[#ef5350]/20 text-[#ef5350] border-[#ef5350]/30",
    TP:  "bg-[#26a69a]/20 text-[#26a69a] border-[#26a69a]/30",
    TSL: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    END: "bg-slate-700 text-slate-400 border-slate-600",
  };

  // Total stats
  const wins  = trades.filter(t => t.pnl > 0).length;
  const total = trades.length;
  const totalPnl = trades.reduce((a, t) => a + t.pnl, 0);
  const avgHold  = total ? Math.round(trades.reduce((a, t) => a + t.holdDays, 0) / total) : 0;

  return (
    <div>
      {/* Header + filters */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{color:"#787b86"}}>{symbol} — Trade Log</p>
        <div className="flex gap-1">
          {(["all","win","loss"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold capitalize transition-all ${filter===f
                ? f==="win"  ? "bg-[#26a69a]/20 text-[#26a69a] border border-[#26a69a]/40"
                : f==="loss" ? "bg-[#ef5350]/20 text-[#ef5350] border border-[#ef5350]/40"
                             : "bg-slate-700 text-slate-300 border border-slate-600"
                : "text-[#787b86] border border-transparent hover:text-slate-300"}`}>
              {f === "all" ? `All (${total})` : f === "win" ? `✓ Wins (${wins})` : `✗ Loss (${total - wins})`}
            </button>
          ))}
        </div>
        <span className="text-[10px]" style={{color: totalPnl >= 0 ? "#26a69a" : "#ef5350"}}>
          Net: {totalPnl >= 0 ? "+" : ""}₹{totalPnl.toLocaleString("en-IN", {maximumFractionDigits: 0})}
        </span>
        <span className="text-[10px]" style={{color:"#787b86"}}>Avg hold: {avgHold}d</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter…"
          className="ml-auto bg-[#131722] border border-[#2a2e39] rounded-lg px-3 py-0.5 text-xs text-slate-300 focus:outline-none focus:border-[#26a69a] w-28"
          style={{background:"#131722"}} />
        <span className="text-[10px]" style={{color:"#787b86"}}>{filtered.length} rows</span>
      </div>

      {/* Active trade detail card */}
      {activeTrade && (
        <div className="mb-3 rounded-xl p-3 flex flex-wrap items-center gap-4" style={{background:"rgba(41,98,255,0.08)",border:"1px solid rgba(41,98,255,0.3)"}}>
          <div>
            <p className="text-[9px] uppercase tracking-widest mb-0.5" style={{color:"#787b86"}}>Entry</p>
            <p className="text-xs font-mono text-slate-200">{activeTrade.entryDate}</p>
            <p className="text-sm font-bold font-mono text-slate-100">₹{activeTrade.entryPrice.toFixed(2)}</p>
          </div>
          <div className="text-[#2962ff] text-lg">→</div>
          <div>
            <p className="text-[9px] uppercase tracking-widest mb-0.5" style={{color:"#787b86"}}>Exit</p>
            <p className="text-xs font-mono text-slate-200">{activeTrade.exitDate}</p>
            <p className="text-sm font-bold font-mono text-slate-100">₹{activeTrade.exitPrice.toFixed(2)}</p>
          </div>
          <div className="h-8 w-px" style={{background:"#2a2e39"}}/>
          <div>
            <p className="text-[9px] uppercase tracking-widest mb-0.5" style={{color:"#787b86"}}>P&L</p>
            <p className={`text-base font-bold font-mono ${activeTrade.pnl >= 0 ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
              {activeTrade.pnl >= 0 ? "+" : ""}₹{activeTrade.pnl.toFixed(0)}
            </p>
            <p className={`text-[10px] font-mono ${activeTrade.pnlPct >= 0 ? "text-[#26a69a]/70" : "text-[#ef5350]/70"}`}>
              {activeTrade.pnlPct >= 0 ? "+" : ""}{activeTrade.pnlPct.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest mb-0.5" style={{color:"#787b86"}}>Hold</p>
            <p className="text-base font-bold text-slate-200">{activeTrade.holdDays}<span className="text-xs text-slate-500 ml-1">days</span></p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest mb-0.5" style={{color:"#787b86"}}>Exit Reason</p>
            <span className={`px-2 py-0.5 rounded text-xs font-bold border ${reasonStyle[activeTrade.exitReason] ?? "text-slate-500 border-slate-700"}`}>
              {activeTrade.exitReason}
            </span>
          </div>
          <button onClick={() => onTradeClick?.(null)}
            className="ml-auto text-slate-600 hover:text-slate-300 text-lg leading-none transition-colors">×</button>
        </div>
      )}

      {/* Trade table */}
      <div className="overflow-x-auto overflow-y-auto max-h-72 rounded-xl" style={{border:"1px solid #2a2e39"}}>
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10" style={{background:"#1a1f2e",borderBottom:"1px solid #2a2e39"}}>
            <tr className="text-[#787b86]">
              <th className="pb-2 pr-3 pl-3 text-left text-[10px] uppercase tracking-widest">#</th>
              <Th k="entryDate" label="Entry Date" />
              <th className="pb-2 pr-3 text-left text-[10px] uppercase tracking-widest">Entry ₹</th>
              <th className="pb-2 pr-3 text-left text-[10px] uppercase tracking-widest">Exit Date</th>
              <th className="pb-2 pr-3 text-left text-[10px] uppercase tracking-widest">Exit ₹</th>
              <th className="pb-2 pr-3 text-left text-[10px] uppercase tracking-widest">Reason</th>
              <Th k="pnl" label="P&L ₹" />
              <th className="pb-2 pr-3 text-left text-[10px] uppercase tracking-widest">P&L%</th>
              <Th k="holdDays" label="Hold" />
              <th className="pb-2 pr-3 text-left text-[10px] uppercase tracking-widest">Chart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e222d]">
            {filtered.map((t, i) => {
              const isActive = activeTrade?.entryDate === t.entryDate && activeTrade?.exitDate === t.exitDate;
              return (
                <tr key={i}
                  onClick={() => onTradeClick?.(isActive ? null : t)}
                  className="cursor-pointer transition-colors"
                  style={{background: isActive ? "rgba(41,98,255,0.12)" : t.pnl > 0 ? "rgba(38,166,154,0.02)" : "rgba(239,83,80,0.02)"}}>
                  <td className="py-2 pr-3 pl-3 text-[#787b86]">{i + 1}</td>
                  <td className="py-2 pr-3 font-mono text-slate-300 whitespace-nowrap">{t.entryDate}</td>
                  <td className="py-2 pr-3 font-mono text-slate-200">{t.entryPrice.toFixed(2)}</td>
                  <td className="py-2 pr-3 font-mono text-slate-300 whitespace-nowrap">{t.exitDate}</td>
                  <td className="py-2 pr-3 font-mono text-slate-200">{t.exitPrice.toFixed(2)}</td>
                  <td className="py-2 pr-3">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${reasonStyle[t.exitReason] ?? "text-slate-500 border-slate-700"}`}>
                      {t.exitReason}
                    </span>
                  </td>
                  <td className={`py-2 pr-3 font-mono font-bold ${t.pnl > 0 ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
                    {t.pnl >= 0 ? "+" : ""}₹{t.pnl.toFixed(0)}
                  </td>
                  <td className={`py-2 pr-3 font-mono text-xs ${t.pnlPct > 0 ? "text-[#26a69a]/80" : "text-[#ef5350]/80"}`}>
                    {t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(2)}%
                  </td>
                  <td className="py-2 pr-3 text-slate-500">{t.holdDays}d</td>
                  <td className="py-2 pr-3">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${isActive ? "text-blue-300 border border-blue-500/40 bg-blue-500/10" : "text-[#787b86] border border-[#2a2e39] hover:border-blue-500/40 hover:text-blue-400"}`}>
                      {isActive ? "● Viewing" : "📈 View"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function EquityStrategyBuilder({ editId }: { editId?: string }) {
  const router = useRouter();

  const [name, setName] = useState("Untitled Strategy");
  const nameRef = useRef<HTMLHeadingElement>(null);

  const [instruments, setInstruments] = useState<string[]>(["SBIN"]);
  const [active, setActive] = useState("SBIN");
  const [tf, setTf] = useState<string>("1D");
  const [action, setAction] = useState<"BUY"|"SELL">("BUY");

  const [conds, setConds] = useState<ECond[]>([
    mkC({kind:"SMA",src:"close",period:9},{kind:"SMA",src:"close",period:21},"crosses above"),
  ]);

  const [exitMode, setExitMode] = useState<ExitM>("%");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [tsl, setTsl] = useState("");
  const [maxLoss, setMaxLoss] = useState("5000");
  const [maxTrades, setMaxTrades] = useState("5");
  const [holdDays, setHoldDays] = useState("30");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);

  // ── Focus trade (for chart zoom from trade log click) ─────────────────
  const [focusTrade, setFocusTrade] = useState<Trade|null>(null);

  // ── Chart OHLCV from DB ──────────────────────────────────────────────────
  const [ohlcv, setOhlcv] = useState<OHLCVRow[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  const fetchChartData = useCallback(async (sym: string, timeframe: string) => {
    setChartLoading(true);
    const tfKey = TF_TO_TIMEFRAME[timeframe] ?? "daily";
    const toDate = new Date().toISOString().slice(0,10);
    const fromDate = new Date(Date.now() - 365*86400000).toISOString().slice(0,10);
    try {
      const data = await api<{candles: OHLCVRow[]}>(`/orb/chart-data?symbol=${sym}&timeframe=${tfKey}&from_date=${fromDate}&to_date=${toDate}&limit=500`);
      setOhlcv(data.candles ?? []);
    } catch {
      setOhlcv([]);
    } finally {
      setChartLoading(false);
    }
  }, []);

  useEffect(()=>{ fetchChartData(active, tf); },[active, tf, fetchChartData]);

  const [activeTab, setActiveTab] = useState<"builder"|"backtest">("builder");
  const [btUniverse, setBtUniverse] = useState<"selected"|"n50"|"next50"|"n100"|"midcap150"|"midcap250"|"smallcap250"|"n500"|"microcap250"|"fo">("selected");
  const [btUniverseCount, setBtUniverseCount] = useState<number|null>(null);
  const [btFromDate, setBtFromDate] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0,10);
  });
  const [btToDate, setBtToDate] = useState(() => new Date().toISOString().slice(0,10));
  const [btQty, setBtQty] = useState("100");
  const [btResults, setBtResults] = useState<StockResult[]>([]);
  const [btRunning, setBtRunning] = useState(false);
  const [btProgress, setBtProgress] = useState(0);
  const [btSelectedSym, setBtSelectedSym] = useState<string|null>(null);
  const [btSortBy, setBtSortBy] = useState<"totalPnl"|"winRate"|"maxDD"|"sharpe"|"totalTrades">("totalPnl");
  const [btSortDir, setBtSortDir] = useState<"asc"|"desc">("desc");

  useEffect(()=>{
    if(!editId) return;
    api<any>(`/strategies/${editId}`).then(row=>{
      const s=row.strategy_json;
      setName(s.name??"Untitled Strategy");
      // Restore all selected instruments (multi-symbol support)
      const syms: string[] = s.symbols?.length ? s.symbols : s.symbol ? [s.symbol] : ["SBIN"];
      setInstruments(syms);
      setActive(s.symbol ?? syms[0]);
      if(s.action) setAction(s.action);
      if(s.tf) setTf(s.tf);
      if(s.exitMode) setExitMode(s.exitMode as ExitM);
      if(s.sl != null) setSl(String(s.sl));
      if(s.tp != null) setTp(String(s.tp));
      if(s.tsl != null) setTsl(String(s.tsl));
      if(s.risk?.maxLossPerDay != null) setMaxLoss(String(s.risk.maxLossPerDay));
      if(s.risk?.maxTradesPerDay != null) setMaxTrades(String(s.risk.maxTradesPerDay));
      if(s.risk?.holdDays != null) setHoldDays(String(s.risk.holdDays));
      // Restore raw conditions for round-trip editing
      if(s.rawConditions?.length){
        setConds(s.rawConditions.map((c: any)=>({...c, id: uid()})));
      }
      setLoadingEdit(false);
    }).catch(()=>setLoadingEdit(false));
  },[editId]);

  const inds   = useMemo(()=>activeInds(conds), [conds]);

  const legend  = useMemo(()=>inds.filter(x=>x.kind!=="RSI"&&x.kind!=="MACD"), [inds]);
  const hasRSI  = useMemo(()=>inds.some(x=>x.kind==="RSI"), [inds]);
  const hasMACD = useMemo(()=>inds.some(x=>x.kind==="MACD"), [inds]);

  function addCond() {
    setConds(p=>[...p, mkC({kind:"SMA",src:"close",period:9},{kind:"SMA",src:"close",period:21},"crosses above")]);
  }
  function updCond(id:string,c:ECond) { setConds(p=>p.map(x=>x.id===id?c:x)); }
  function delCond(id:string) { setConds(p=>p.filter(x=>x.id!==id)); }

  const lastClose = useMemo(()=>{
    const last=ohlcv[ohlcv.length-1], prev=ohlcv[ohlcv.length-2];
    if(!last) return {price:0,pct:0};
    const pct=prev?((last.close-prev.close)/prev.close)*100:0;
    return {price:last.close,pct};
  },[ohlcv]);

  // ── Backtest derived ─────────────────────────────────────────────────────
  const sortedResults = useMemo(()=>{
    return [...btResults].sort((a,b)=>{
      const v = btSortDir==="desc" ? -1 : 1;
      return (a[btSortBy]-b[btSortBy])*v;
    });
  },[btResults,btSortBy,btSortDir]);

  const btSummary = useMemo(()=>{
    if(!btResults.length) return null;
    const totalTrades = btResults.reduce((a,r)=>a+r.totalTrades,0);
    const totalWins   = btResults.reduce((a,r)=>a+r.winTrades,0);
    const winRate     = totalTrades ? totalWins/totalTrades*100 : 0;
    const totalPnl    = btResults.reduce((a,r)=>a+r.totalPnl,0);
    const maxDD       = btResults.length ? Math.max(...btResults.map(r=>r.maxDD)) : 0;
    const allPnlPct   = btResults.flatMap(r=>r.trades.map(t=>t.pnlPct));
    const avgReturn   = allPnlPct.length ? allPnlPct.reduce((a,b)=>a+b,0)/allPnlPct.length : 0;
    const sorted      = [...btResults].sort((a,b)=>b.totalPnl-a.totalPnl);
    const bestStock   = sorted[0];
    const worstStock  = sorted[sorted.length-1];
    return { totalTrades, winRate, totalPnl, maxDD, avgReturn, bestStock, worstStock };
  },[btResults]);

  const selectedBtResult = useMemo(()=>btResults.find(r=>r.symbol===btSelectedSym)||null,[btResults,btSelectedSym]);

  const chartTrades = useMemo(()=>{
    const r = btResults.find(x=>x.symbol===active);
    return r?.trades;
  },[btResults,active]);

  // ── Server-side backtest (real DB data) ──────────────────────────────────
  async function runBacktest() {
    if(!conds.length){ setError("Add at least one entry condition."); return; }
    if(!parseFloat(sl)){ setError("Stop Loss required for backtesting"); return; }
    setError(null); setBtResults([]); setBtProgress(0); setBtRunning(true); setBtSelectedSym(null);

    const toDate   = btToDate;
    const fromDate = btFromDate;
    const tfKey    = TF_TO_TIMEFRAME[tf] ?? "daily";

    // Build symbol list from universe selection
    let symbols: string[] = instruments;
    if (btUniverse !== "selected") {
      try {
        const resp = await api<{symbols: string[], count: number}>(`/charts/index-symbols?index=${btUniverse}`);
        symbols = resp.symbols.length ? resp.symbols : instruments;
        setBtUniverseCount(resp.count);
      } catch { symbols = instruments; }
    }

    try {
      setBtProgress(20);
      const resp = await api<{results: StockResult[]}>("/charts/indicator-backtest", {
        method: "POST",
        body: JSON.stringify({
          symbols,
          timeframe: tfKey,
          from_date: fromDate,
          to_date: toDate,
          conditions: conds.map(c => ({ lhs: c.lhs, op: c.op, rhs: c.rhs })),
          action,
          sl_pct:  parseFloat(sl)  || 0,
          tp_pct:  parseFloat(tp)  || 0,
          tsl_pct: parseFloat(tsl) || 0,
          qty: parseInt(btQty) || 100,
          max_hold_days: parseInt(holdDays) || 30,
        }),
      });
      setBtResults(resp.results ?? []);
      setBtProgress(100);
    } catch (e: any) {
      setError(`Backtest failed: ${e.message}`);
    } finally {
      setBtRunning(false);
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function save() {
    if(!conds.length){setError("Add at least one entry condition.");return;}
    if(!parseFloat(sl)){setError("Stop loss is required.");return;}
    setError(null); setSaving(true);
    const entryC=conds.map(c=>({
      type:"indicator" as const,
      indicator:(c.lhs.kind==="price"||c.lhs.kind==="value"?"EMA":c.lhs.kind) as any,
      period:c.lhs.period,
      operator:c.op==="crosses above"?"crosses_above" as const:c.op==="crosses below"?"crosses_below" as const:c.op as any,
      ...(c.rhs.kind==="value"?{value:c.rhs.value}:{compareTo:"indicator" as const,rhsIndicator:c.rhs.kind as any,rhsPeriod:c.rhs.period}),
    }));
    const stratJson:any={
      version:1, name, desk:"equity",
      symbols: instruments,          // all selected symbols
      symbol:active,                 // primary/preview symbol
      action,
      tf,
      exitMode,
      sl: parseFloat(sl)||0,
      tp: parseFloat(tp)||0,
      tsl: parseFloat(tsl)||0,
      rawConditions: conds,          // raw conditions for round-trip edit
      candleTime:tf==="1D"?"EOD":tf==="1H"?"1H":tf==="15m"?"15min":"5min",
      quantity:100, mode:"paper", status:"draft",
      entry:{logic:"AND",conditions:entryC},
      exit:{logic:"OR",conditions:[
        {type:"stop_loss",value:parseFloat(sl)||0},
        ...(parseFloat(tp)?[{type:"target",value:parseFloat(tp)}]:[]),
        ...(parseFloat(tsl)?[{type:"trailing_stop_loss",value:parseFloat(tsl)}]:[]),
      ]},
      risk:{maxLossPerDay:parseFloat(maxLoss)||5000,maxTradesPerDay:parseInt(maxTrades)||5,maxOpenPositions:instruments.length,holdDays:parseInt(holdDays)||30},
    };
    const n=nameRef.current?.textContent?.trim()||name;
    stratJson.name=n;
    const body={name:n,strategy_json:stratJson,mode:"paper",status:"draft"};
    try {
      if(editId){
        await api(`/strategies/${editId}`,{method:"PATCH",body:JSON.stringify(body)});
        router.push(`/equity/strategies/${editId}`);
      } else {
        const created=await api<{id:string}>("/strategies",{method:"POST",body:JSON.stringify(body)});
        router.push(`/equity/strategies/${created.id}`);
      }
    } catch(e:any){setError(e.message);}
    finally{setSaving(false);}
  }

  if(loadingEdit) return <div className="flex items-center justify-center h-64 text-slate-400">Loading...</div>;

  const sortIcon = (col: typeof btSortBy) => btSortBy===col ? (btSortDir==="desc"?"▼":"▲") : "";
  const toggleSort = (col: typeof btSortBy) => {
    if(btSortBy===col) setBtSortDir(d=>d==="desc"?"asc":"desc");
    else { setBtSortBy(col); setBtSortDir("desc"); }
  };

  return (
    <div className="fixed flex flex-col" style={{top:60,left:240,right:0,bottom:0,zIndex:5,background:"#131722"}}>

      {/* ── CHART HEADER: instruments + price + TF + buy/sell ─────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0" style={{borderColor:"#2a2e39",background:"#131722"}}>
        {/* Instrument tabs */}
        <div className="flex items-center gap-0 overflow-x-auto shrink-0" style={{scrollbarWidth:"none"}}>
          {instruments.map(sym=>(
            <button key={sym} onClick={()=>setActive(sym)}
              className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 text-xs font-semibold transition-all whitespace-nowrap ${sym===active
                ?"border-blue-500 text-blue-300":"border-transparent text-slate-600 hover:text-slate-400"}`}>
              <span className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-[7px] font-bold text-white shrink-0">{sym[0]}</span>
              {sym}
            </button>
          ))}
        </div>
        {/* Price */}
        <div className="flex items-center gap-2 mx-3">
          <span className="font-bold text-slate-100 text-sm">{active}</span>
          <span className="text-[10px] text-slate-600 border border-slate-800 rounded px-1">NSE</span>
          <span className={`text-sm font-semibold ${lastClose.pct>=0?"text-emerald-400":"text-rose-400"}`}>₹{lastClose.price.toFixed(2)}</span>
          <span className={`text-xs ${lastClose.pct>=0?"text-emerald-500":"text-rose-500"}`}>({lastClose.pct>=0?"+":""}{lastClose.pct.toFixed(2)}%)</span>
          {chartLoading&&<span className="text-[10px] text-slate-600 animate-pulse">Loading…</span>}
        </div>
        {/* Right controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-1">
            {legend.map(ind=>(
              <span key={`${ind.kind}-${ind.period}`} className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-4 h-0.5 rounded" style={{backgroundColor:ind.color}}/>
                {ind.kind}({ind.period})
              </span>
            ))}
            {hasRSI&&<span className="text-[10px] text-purple-400 border border-purple-500/20 rounded px-1.5 py-0.5 bg-purple-500/10">RSI</span>}
            {hasMACD&&<span className="text-[10px] text-blue-400 border border-blue-500/20 rounded px-1.5 py-0.5 bg-blue-500/10">MACD</span>}
          </div>
          <select value={tf} onChange={e=>setTf(e.target.value)}
            className="rounded-lg px-2 py-1 text-xs text-slate-400 focus:outline-none"
            style={{background:"#1e222d",border:"1px solid #2a2e39"}}>
            {TFs.map(t=><option key={t}>{t}</option>)}
          </select>
          <div className="flex rounded-lg p-0.5" style={{background:"#1e222d",border:"1px solid #2a2e39"}}>
            <button onClick={()=>setAction("BUY")} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${action==="BUY"?"bg-emerald-600 text-white":"text-slate-500 hover:text-slate-300"}`}>Buy</button>
            <button onClick={()=>setAction("SELL")} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${action==="SELL"?"bg-rose-600 text-white":"text-slate-500 hover:text-slate-300"}`}>Sell</button>
          </div>
        </div>
      </div>

      {/* ── OHLCV Chart ────────────────────────────────────────────────────── */}
      <div className="shrink-0 relative" style={{height:"42%"}}>
        <TradingChart ohlcv={ohlcv} conds={conds} trades={chartTrades} action={action}
          focusTrade={focusTrade}
          key={`${active}-${hasRSI}-${hasMACD}`} />
      </div>

      {/* ── STRATEGY NAME BAR ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-b shrink-0" style={{borderColor:"#2a2e39",background:"#0e1117"}}>
        <div className="flex items-center gap-2">
          <h1 ref={nameRef} contentEditable suppressContentEditableWarning
            onBlur={()=>setName(nameRef.current?.textContent?.trim()||"Untitled Strategy")}
            className="text-sm font-semibold text-slate-100 focus:outline-none cursor-text min-w-[120px] truncate max-w-[200px]"
            style={{borderBottom:"1px solid transparent"}}
            onFocus={e=>(e.currentTarget.style.borderBottomColor="#26a69a")}
            onBlurCapture={e=>(e.currentTarget.style.borderBottomColor="transparent")}>
            {name}
          </h1>
          {editId&&<span className="text-[10px] text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5 bg-amber-500/10 shrink-0">Editing</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>router.push("/equity/strategies")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors rounded-lg"
            style={{border:"1px solid #2a2e39"}}>
            ← Strategies
          </button>
          {error&&<span className="text-xs text-rose-400 max-w-[180px] truncate">{error}</span>}
          <button onClick={save} disabled={saving}
            className="px-4 py-1.5 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            style={{background:saving?"#1e222d":"#2962ff"}}>
            {saving?"Saving…":editId?"Update":"Save Strategy"}
          </button>
        </div>
      </div>

      {/* ── SINGLE SCROLL COLUMN: config → backtest results ─────────────── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5" style={{background:"#131722"}}>

        {/* ── Instruments + Candle Period ──────────────────────────────────── */}
        <div className="rounded-xl p-4" style={{background:"#1e222d",border:"1px solid #2a2e39"}}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{color:"#787b86"}}>Instruments</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px]" style={{color:"#787b86"}}>Candle Period</span>
              <select value={tf} onChange={e=>setTf(e.target.value)}
                className="rounded-lg px-2.5 py-1 text-xs text-slate-300 focus:outline-none"
                style={{background:"#131722",border:"1px solid #2a2e39"}}>
                {TFs.map(t=><option key={t}>{t}</option>)}
              </select>
              <div className="flex rounded-lg p-0.5" style={{background:"#131722",border:"1px solid #2a2e39"}}>
                <button onClick={()=>setAction("BUY")} className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-all ${action==="BUY"?"bg-emerald-600 text-white":"text-slate-500 hover:text-slate-300"}`}>Buy</button>
                <button onClick={()=>setAction("SELL")} className={`px-2.5 py-0.5 rounded-md text-xs font-semibold transition-all ${action==="SELL"?"bg-rose-600 text-white":"text-slate-500 hover:text-slate-300"}`}>Sell</button>
              </div>
            </div>
          </div>
          <InstrumentRow
            instruments={instruments} active={active}
            onSwitch={setActive}
            onRemove={sym=>{ const n=instruments.filter(s=>s!==sym); setInstruments(n); if(active===sym) setActive(n[0]); }}
            onAdd={sym=>{ if(!instruments.includes(sym)){setInstruments(p=>[...p,sym]);} setActive(sym); }}
          />
        </div>

        {/* ── Entry Conditions ──────────────────────────────────────────────── */}
        <div className="rounded-xl p-4" style={{background:"#1e222d",border:"1px solid #2a2e39"}}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{color:"#787b86"}}>Entry Conditions</p>
            <span className="text-[9px] rounded-full px-2 py-0.5 font-bold" style={{background:"rgba(38,166,154,0.12)",color:"#26a69a",border:"1px solid rgba(38,166,154,0.3)"}}>{conds.length} condition{conds.length!==1?"s":""}</span>
          </div>
          <div className="space-y-1">
            {conds.map((c,i)=>(
              <CondRow key={c.id} cond={c} isFirst={i===0} onChange={nc=>updCond(c.id,nc)} onDel={()=>delCond(c.id)}/>
            ))}
            {!conds.length&&<p className="text-xs py-1" style={{color:"#4a4f5a"}}>No conditions yet — add one below.</p>}
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <button onClick={addCond}
              className="flex items-center gap-1.5 text-xs transition-colors group"
              style={{color:"#787b86"}}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-base leading-none" style={{border:"1px dashed #2a2e39"}}>+</span>
              Add Condition
            </button>
            <span style={{color:"#2a2e39"}}>|</span>
            <p className="text-[10px]" style={{color:"#4a4f5a"}}>Quick:</p>
            {SETUPS.map(s=>(
              <button key={s.name} onClick={()=>setConds(p=>[...p,s.mk()])}
                className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all hover:text-slate-200"
                style={{background:"#131722",border:"1px solid #2a2e39",color:"#787b86"}}>
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* ── Exit + Risk in a row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Exit */}
          <div className="rounded-xl p-4" style={{background:"#1e222d",border:"1px solid #2a2e39"}}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{color:"#787b86"}}>Exit Rules</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              {([["Stop Loss *",sl,setSl],["Target Profit",tp,setTp],["Trailing SL",tsl,setTsl]] as const).map(([lbl,val,set]: any)=>(
                <div key={lbl}>
                  <p className="text-[10px] mb-1" style={{color:"#787b86"}}>{lbl}</p>
                  <div className="flex items-center rounded-lg overflow-hidden" style={{background:"#131722",border:"1px solid #2a2e39"}}>
                    <input type="number" min="0" step="0.01" value={val} onChange={(e:any)=>set(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 bg-transparent px-2 py-2 text-xs text-slate-200 placeholder-slate-700 focus:outline-none min-w-0"/>
                    <span className="px-2 text-[10px] border-l" style={{borderColor:"#2a2e39",color:"#787b86"}}>
                      {exitMode==="%"?"%":exitMode==="pts"?"pts":"₹"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4">
              {(["%","pts","₹"] as ExitM[]).map(m=>(
                <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="exitMode" value={m} checked={exitMode===m} onChange={()=>setExitMode(m)} className="accent-blue-500"/>
                  <span className="text-xs" style={{color:"#787b86"}}>{m==="%" ? "Percentage" : m==="pts" ? "Points" : "PNL (₹)"}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Risk Controls */}
          <div className="rounded-xl p-4" style={{background:"#1e222d",border:"1px solid #2a2e39"}}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{color:"#787b86"}}>Risk Controls</p>
            <div className="grid grid-cols-3 gap-3">
              {([["Max Loss/Day ₹",maxLoss,setMaxLoss],["Max Trades/Day",maxTrades,setMaxTrades],["Hold Days",holdDays,setHoldDays]] as const).map(([lbl,val,set]: any)=>(
                <div key={lbl}>
                  <p className="text-[10px] mb-1" style={{color:"#787b86"}}>{lbl}</p>
                  <input type="number" min="0" value={val} onChange={(e:any)=>set(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs text-slate-200 focus:outline-none rounded-lg"
                    style={{background:"#131722",border:"1px solid #2a2e39"}}/>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Backtest Controls ─────────────────────────────────────────────── */}
        <div className="rounded-xl p-4" style={{background:"rgba(245,158,11,0.04)",border:"1px solid rgba(245,158,11,0.2)"}}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{color:"#f59e0b"}}>Backtest Settings</p>

          {/* Universe selection */}
          <div className="mb-4">
            <p className="text-[10px] mb-2" style={{color:"#787b86"}}>Stock Universe</p>
            <div className="flex gap-2 flex-wrap mb-2">
              {([
                ["selected", `My Selection (${instruments.length})`],
                ["n50",        "Nifty 50"],
                ["next50",     "Nifty Next 50"],
                ["n100",       "Nifty 100"],
                ["midcap150",  "Midcap 150"],
                ["midcap250",  "Midcap 250"],
                ["smallcap250","Smallcap 250"],
                ["n500",       "Nifty 500"],
                ["microcap250","Microcap 250"],
                ["fo",         "F&O Stocks"],
              ] as const).map(([val, label]) => (
                <button key={val} onClick={()=>{ setBtUniverse(val as typeof btUniverse); setBtUniverseCount(null); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={btUniverse===val
                    ? {background:"#f59e0b",color:"#0e1117"}
                    : {background:"#131722",border:"1px solid #2a2e39",color:"#787b86"}}>
                  {label}
                </button>
              ))}
            </div>
            {/* Show selected symbols pill list when "My Selection" */}
            {btUniverse==="selected" && (
              <div className="flex flex-wrap gap-1.5 mt-2 p-2 rounded-lg min-h-8" style={{background:"#131722",border:"1px solid #2a2e39"}}>
                {instruments.length===0
                  ? <span className="text-[10px] self-center" style={{color:"#787b86"}}>No symbols — add in Instruments above</span>
                  : instruments.map(s=>(
                    <span key={s} className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold" style={{background:"#1e222d",color:"#e2e8f0",border:"1px solid #2a2e39"}}>{s}</span>
                  ))
                }
              </div>
            )}
            {btUniverse!=="selected" && (
              <p className="text-[10px] mt-1" style={{color:"#787b86"}}>
                {btUniverseCount!=null ? `${btUniverseCount} symbols loaded from DB` : "Symbols loaded from DB on Run"}
                {" · "}{btUniverse==="n500"||btUniverse==="microcap250"?"⚠ Large universe — daily TF recommended":""}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-[10px] mb-1" style={{color:"#787b86"}}>From Date</p>
              <input type="date" value={btFromDate} onChange={e=>setBtFromDate(e.target.value)}
                className="w-full px-2.5 py-2 text-xs text-slate-300 focus:outline-none rounded-lg"
                style={{background:"#1e222d",border:"1px solid #2a2e39",colorScheme:"dark"}}/>
            </div>
            <div>
              <p className="text-[10px] mb-1" style={{color:"#787b86"}}>To Date</p>
              <input type="date" value={btToDate} onChange={e=>setBtToDate(e.target.value)}
                className="w-full px-2.5 py-2 text-xs text-slate-300 focus:outline-none rounded-lg"
                style={{background:"#1e222d",border:"1px solid #2a2e39",colorScheme:"dark"}}/>
            </div>
            <div>
              <p className="text-[10px] mb-1" style={{color:"#787b86"}}>Quantity</p>
              <input type="number" min="1" value={btQty} onChange={e=>setBtQty(e.target.value)}
                className="w-full px-2.5 py-2 text-xs text-slate-300 focus:outline-none rounded-lg"
                style={{background:"#1e222d",border:"1px solid #2a2e39"}}/>
            </div>
          </div>
          {btRunning&&(
            <div className="mb-3 space-y-1">
              <p className="text-[10px]" style={{color:"#787b86"}}>Running backtest… {btProgress}%</p>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{background:"#1e222d"}}>
                <div className="h-full rounded-full transition-all duration-300" style={{width:`${btProgress}%`,background:"#f59e0b"}}/>
              </div>
            </div>
          )}
          <button onClick={runBacktest} disabled={btRunning}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            style={{background:btRunning?"#1e222d":"#f59e0b",color:btRunning?"#787b86":"#0e1117"}}>
            {btRunning?(
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            ):"▶"} {btRunning?"Running…":"Run Backtest"}
          </button>
        </div>

        {/* ── Backtest Results ──────────────────────────────────────────────── */}
        {btSummary&&(
          <>
            {/* KPI cards */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{color:"#787b86"}}>
                Results · {sortedResults.length} symbol{sortedResults.length!==1?"s":""} · {btFromDate} → {btToDate}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  {icon:"📈",label:"Trades",value:String(btSummary.totalTrades),sub:`${btResults.reduce((a,r)=>a+r.winTrades,0)}W / ${btSummary.totalTrades-btResults.reduce((a,r)=>a+r.winTrades,0)}L`,col:"text-slate-100"},
                  {icon:"🎯",label:"Win Rate",value:`${btSummary.winRate.toFixed(1)}%`,sub:"all symbols",col:btSummary.winRate>=50?"text-[#26a69a]":btSummary.winRate>=40?"text-amber-400":"text-[#ef5350]"},
                  {icon:"💰",label:"Total P&L",value:`${btSummary.totalPnl>=0?"+":""}₹${Math.abs(btSummary.totalPnl).toLocaleString("en-IN",{maximumFractionDigits:0})}`,sub:"combined",col:btSummary.totalPnl>=0?"text-[#26a69a]":"text-[#ef5350]"},
                  {icon:"📉",label:"Max DD",value:`${btSummary.maxDD.toFixed(1)}%`,sub:"worst symbol",col:"text-[#ef5350]"},
                  {icon:"📊",label:"Avg Return",value:`${btSummary.avgReturn>=0?"+":""}${btSummary.avgReturn.toFixed(2)}%`,sub:"per trade",col:btSummary.avgReturn>=0?"text-[#26a69a]":"text-[#ef5350]"},
                  {icon:"🏆",label:"Best Stock",value:btSummary.bestStock?.symbol??"—",sub:btSummary.bestStock?`+₹${btSummary.bestStock.totalPnl.toLocaleString("en-IN",{maximumFractionDigits:0})}`:undefined,col:"text-[#26a69a]"},
                ].map(c=>(
                  <div key={c.label} className="rounded-xl p-3" style={{background:"#1e222d",border:"1px solid #2a2e39"}}>
                    <div className="flex items-center gap-1.5 mb-1.5"><span className="text-sm">{c.icon}</span><p className="text-[9px] font-bold uppercase tracking-widest" style={{color:"#787b86"}}>{c.label}</p></div>
                    <p className={`text-lg font-bold font-mono ${c.col}`}>{c.value}</p>
                    {c.sub&&<p className="text-[9px] mt-0.5" style={{color:"#787b86"}}>{c.sub}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Per-symbol table */}
            <div className="rounded-xl overflow-hidden" style={{border:"1px solid #2a2e39"}}>
              <div className="px-4 py-2 flex items-center justify-between" style={{background:"#1e222d",borderBottom:"1px solid #2a2e39"}}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{color:"#787b86"}}>Per-Symbol Results</span>
                <span className="text-[9px]" style={{color:"#787b86"}}>↑ Click row → drill down + switch chart</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10" style={{background:"#1a1f2e",borderBottom:"1px solid #2a2e39"}}>
                    <tr>
                      {[
                        {label:"Symbol",col:null},
                        {label:"Trades",col:"totalTrades" as const},
                        {label:"Win%",col:"winRate" as const},
                        {label:"Net P&L ₹",col:"totalPnl" as const},
                        {label:"Avg Ret%",col:null},
                        {label:"Max DD%",col:"maxDD" as const},
                        {label:"Sharpe",col:"sharpe" as const},
                        {label:"",col:null},
                      ].map(({label,col})=>(
                        <th key={label} onClick={col?()=>toggleSort(col):undefined}
                          className={`px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${col?"cursor-pointer hover:text-slate-300 select-none":""}`}
                          style={{color:"#787b86"}}>
                          {label}{col?" "+sortIcon(col):""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedResults.map((r,idx)=>{
                      const avgRet=r.trades.length?r.trades.reduce((a,t)=>a+t.pnlPct,0)/r.trades.length:0;
                      const isSel=r.symbol===btSelectedSym;
                      return (
                        <tr key={r.symbol}
                          onClick={()=>{ setBtSelectedSym(isSel?null:r.symbol); setActive(r.symbol); setFocusTrade(null); }}
                          className="border-b cursor-pointer transition-colors hover:bg-white/5"
                          style={{borderColor:"#1e2030",background:isSel?"rgba(41,98,255,0.1)":idx%2===0?"#131722":"#0f131a"}}>
                          <td className="px-3 py-2 font-semibold text-slate-200 whitespace-nowrap">
                            <span className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-[8px] font-bold text-white shrink-0">{r.symbol[0]}</span>
                              {r.symbol}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-400">{r.totalTrades}</td>
                          <td className={`px-3 py-2 ${r.winRate>=50?"text-[#26a69a]":"text-amber-400"}`}>{r.winRate.toFixed(1)}%</td>
                          <td className={`px-3 py-2 font-semibold font-mono ${r.totalPnl>=0?"text-[#26a69a]":"text-[#ef5350]"}`}>
                            {r.totalPnl>=0?"+":""}₹{Math.abs(r.totalPnl).toLocaleString("en-IN",{maximumFractionDigits:0})}
                          </td>
                          <td className={`px-3 py-2 font-mono text-xs ${avgRet>=0?"text-[#26a69a]/80":"text-[#ef5350]/80"}`}>{avgRet>=0?"+":""}{avgRet.toFixed(2)}%</td>
                          <td className="px-3 py-2 font-mono text-[#ef5350]">{r.maxDD.toFixed(1)}%</td>
                          <td className={`px-3 py-2 font-mono ${r.sharpe>=1?"text-blue-400":r.sharpe>=0?"text-slate-400":"text-slate-600"}`}>{r.sharpe.toFixed(2)}</td>
                          <td className="px-3 py-2">
                            {r.totalTrades===0
                              ?<span className="text-[9px] rounded px-1.5 py-0.5" style={{border:"1px solid #2a2e39",color:"#4a4f5a"}}>No Signal</span>
                              :<span className="text-[9px] rounded px-1.5 py-0.5" style={{background:"rgba(38,166,154,0.1)",border:"1px solid rgba(38,166,154,0.3)",color:"#26a69a"}}>Done</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Selected symbol drill-down */}
            {selectedBtResult&&selectedBtResult.trades.length>0&&(
              <>
                {/* Equity Curve */}
                <div className="rounded-xl overflow-hidden" style={{border:"1px solid #2a2e39"}}>
                  <div className="px-4 py-2 flex items-center gap-2" style={{background:"#1e222d",borderBottom:"1px solid #2a2e39"}}>
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{color:"#787b86"}}>Equity Curve</span>
                    <span className="text-[10px]" style={{color:"#787b86"}}>· {selectedBtResult.symbol}</span>
                    <span className="ml-auto text-[9px]" style={{color:"#787b86"}}>{selectedBtResult.totalTrades} trades</span>
                  </div>
                  <div style={{height:220}}>
                    <IndicatorEquityCurve trades={selectedBtResult.trades} key={selectedBtResult.symbol}/>
                  </div>
                </div>

                {/* Monthly P&L */}
                <div className="rounded-xl p-4" style={{background:"#1e222d",border:"1px solid #2a2e39"}}>
                  <IndicatorMonthlyGrid trades={selectedBtResult.trades}/>
                </div>

                {/* Trade Log */}
                <div className="rounded-xl p-4" style={{background:"#1e222d",border:"1px solid #2a2e39"}}>
                  <IndicatorTradeLog
                    trades={selectedBtResult.trades}
                    symbol={selectedBtResult.symbol}
                    activeTrade={focusTrade}
                    onTradeClick={trade => {
                      setFocusTrade(trade);
                    }}
                  />
                </div>
              </>
            )}

            {selectedBtResult&&selectedBtResult.trades.length===0&&(
              <div className="rounded-xl p-6 text-center" style={{background:"#1e222d",border:"1px solid #2a2e39"}}>
                <p className="text-slate-400 font-medium mb-1">No trades for {selectedBtResult.symbol}</p>
                <p className="text-xs" style={{color:"#787b86"}}>Conditions did not trigger in this period.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
