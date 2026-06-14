"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Highcharts from "highcharts/highstock";
import { useRouter } from "next/navigation";
import { NIFTY500_STOCKS } from "@signalai/utils";
import { api } from "@/lib/api";

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
}

interface OHLCVRow { time: string; open: number; high: number; low: number; close: number; volume: number; }

// ── Constants ─────────────────────────────────────────────────────────────────
const OPS: Op[] = ["crosses above","crosses below",">","<",">=","<=","=="];
const KINDS: IKind[] = ["SMA","EMA","WMA","RSI","MACD","VWAP","BBANDS","SUPERTREND","price","value"];
const TFs = ["1D","1W","1H","15m","5m","3m"] as const;
const PAL = ["#f59e0b","#3b82f6","#a855f7","#06b6d4","#f97316","#ec4899"];

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

// ── Mock OHLCV generator ──────────────────────────────────────────────────────
const STOCK_BASE: Record<string,number> = {
  RELIANCE:2900,TCS:3800,HDFCBANK:1650,INFY:1580,SBIN:780,
  ICICIBANK:1200,BHARTIARTL:1600,KOTAKBANK:1900,LT:3500,
  AXISBANK:1100,WIPRO:540,HCLTECH:1700,BAJFINANCE:7000,
  MARUTI:12000,TITAN:3400,SUNPHARMA:1700,NESTLEIND:2400,
  ADANIENT:2400,APOLLOHOSP:5800,ITC:470,HINDUNILVR:2600,
};
function generateOHLCV(sym: string, days=365): OHLCVRow[] {
  let seed = sym.split("").reduce((a,c)=>a+c.charCodeAt(0),17);
  const rnd = () => { seed=(seed*1664525+1013904223)&0x7fffffff; return seed/0x7fffffff; };
  let close = STOCK_BASE[sym] ?? (800+rnd()*2000);
  const rows: OHLCVRow[] = [];
  const end = new Date();
  for (let i=days;i>=0;i--) {
    const d=new Date(end); d.setDate(d.getDate()-i);
    if(d.getDay()===0||d.getDay()===6) continue;
    const chg=(rnd()-0.47)*close*0.022;
    const open=close; close=Math.max(10,close+chg);
    const w=rnd()*close*0.008;
    rows.push({ time:d.toISOString().slice(0,10), open:+open.toFixed(2),
      high:+(Math.max(open,close)+w).toFixed(2), low:+(Math.min(open,close)-w).toFixed(2),
      close:+close.toFixed(2), volume:Math.floor(500000+rnd()*5000000) });
  }
  return rows;
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

// ── Backtest engine ───────────────────────────────────────────────────────────
function precomputeInds(conds: ECond[], rows: OHLCVRow[]): Record<string, number[]> {
  const pc: Record<string, number[]> = {};
  const closes = rows.map(r => r.close);
  for (const cond of conds) {
    for (const ind of [cond.lhs, cond.rhs]) {
      if (ind.kind === "price" || ind.kind === "value") continue;
      const key = `${ind.kind}-${ind.period ?? 14}-${ind.src ?? "close"}`;
      if (pc[key]) continue;
      const p = ind.period ?? 14;
      const src = ind.src ?? "close";
      const srcArr = src === "close" ? closes : src === "open" ? rows.map(r=>r.open) : src === "high" ? rows.map(r=>r.high) : rows.map(r=>r.low);
      if (ind.kind === "SMA" || ind.kind === "WMA") pc[key] = sma(srcArr, p);
      else if (ind.kind === "EMA") pc[key] = ema(srcArr, p);
      else if (ind.kind === "RSI") pc[key] = rsi(srcArr, p);
      else if (ind.kind === "MACD") pc[key] = macd(srcArr).ml;
      else if (ind.kind === "VWAP") pc[key] = vwap(rows);
      else if (ind.kind === "BBANDS") pc[key] = bbands(srcArr, p).upper;
      else if (ind.kind === "SUPERTREND") pc[key] = supertrend(rows, p);
    }
  }
  return pc;
}

function getIndVal(ind: CInd, i: number, rows: OHLCVRow[], pc: Record<string, number[]>): number {
  if (ind.kind === "price") return rows[i].close;
  if (ind.kind === "value") return ind.value ?? 0;
  const key = `${ind.kind}-${ind.period ?? 14}-${ind.src ?? "close"}`;
  const arr = pc[key];
  if (!arr) return NaN;
  const idx = i + (ind.offset ?? 0);
  if (idx < 0 || idx >= arr.length) return NaN;
  return arr[idx];
}

function evalCond(cond: ECond, i: number, rows: OHLCVRow[], pc: Record<string, number[]>): boolean {
  const lhsNow = getIndVal(cond.lhs, i, rows, pc);
  const rhsNow = getIndVal(cond.rhs, i, rows, pc);
  if (isNaN(lhsNow) || isNaN(rhsNow)) return false;
  if (cond.op === "crosses above") {
    if (i === 0) return false;
    const lp = getIndVal(cond.lhs, i-1, rows, pc), rp = getIndVal(cond.rhs, i-1, rows, pc);
    if (isNaN(lp) || isNaN(rp)) return false;
    return lp <= rp && lhsNow > rhsNow;
  }
  if (cond.op === "crosses below") {
    if (i === 0) return false;
    const lp = getIndVal(cond.lhs, i-1, rows, pc), rp = getIndVal(cond.rhs, i-1, rows, pc);
    if (isNaN(lp) || isNaN(rp)) return false;
    return lp >= rp && lhsNow < rhsNow;
  }
  if (cond.op === ">")  return lhsNow > rhsNow;
  if (cond.op === "<")  return lhsNow < rhsNow;
  if (cond.op === ">=") return lhsNow >= rhsNow;
  if (cond.op === "<=") return lhsNow <= rhsNow;
  if (cond.op === "==") return Math.abs(lhsNow - rhsNow) < 0.001;
  return false;
}

function runBacktestForSymbol(
  symbol: string, ohlcv: OHLCVRow[], conds: ECond[],
  slPct: number, tpPct: number, tslPct: number,
  action: "BUY"|"SELL", quantity: number, maxHoldDays: number
): StockResult {
  const pc = precomputeInds(conds, ohlcv);
  const trades: Trade[] = [];
  let inTrade = false;
  let entryDate = "", entryPrice = 0, entryIdx = 0;
  let highSince = 0, lowSince = Infinity;
  const WARMUP = 40;

  for (let i = WARMUP; i < ohlcv.length; i++) {
    const row = ohlcv[i];
    if (!inTrade) {
      if (conds.length > 0 && conds.every(c => evalCond(c, i, ohlcv, pc))) {
        inTrade = true; entryDate = row.time; entryPrice = row.close;
        entryIdx = i; highSince = row.high; lowSince = row.low;
      }
    } else {
      highSince = Math.max(highSince, row.high);
      lowSince  = Math.min(lowSince,  row.low);
      const holdDays = i - entryIdx;
      const isBuy = action === "BUY";
      const price = row.close;
      let exitReason: Trade["exitReason"] | null = null;
      let exitPrice = price;

      if (slPct > 0) {
        if (isBuy  && price <= entryPrice*(1-slPct/100)) { exitReason="SL"; exitPrice=entryPrice*(1-slPct/100); }
        if (!isBuy && price >= entryPrice*(1+slPct/100)) { exitReason="SL"; exitPrice=entryPrice*(1+slPct/100); }
      }
      if (!exitReason && tpPct > 0) {
        if (isBuy  && price >= entryPrice*(1+tpPct/100)) { exitReason="TP"; exitPrice=entryPrice*(1+tpPct/100); }
        if (!isBuy && price <= entryPrice*(1-tpPct/100)) { exitReason="TP"; exitPrice=entryPrice*(1-tpPct/100); }
      }
      if (!exitReason && tslPct > 0) {
        if (isBuy)  { const t=highSince*(1-tslPct/100); if(price<=t){exitReason="TSL";exitPrice=t;} }
        if (!isBuy) { const t=lowSince*(1+tslPct/100);  if(price>=t){exitReason="TSL";exitPrice=t;} }
      }
      if (!exitReason && holdDays >= maxHoldDays) { exitReason="END"; exitPrice=price; }

      if (exitReason) {
        const pnl = isBuy ? (exitPrice-entryPrice)*quantity : (entryPrice-exitPrice)*quantity;
        const pnlPct = isBuy ? (exitPrice-entryPrice)/entryPrice*100 : (entryPrice-exitPrice)/entryPrice*100;
        trades.push({ entryDate, entryPrice, exitDate:row.time, exitPrice, exitReason, pnl, pnlPct, holdDays });
        inTrade = false;
      }
    }
  }

  if (inTrade && ohlcv.length > 0) {
    const last = ohlcv[ohlcv.length-1];
    const isBuy = action === "BUY";
    const ep = last.close;
    const pnl = isBuy ? (ep-entryPrice)*quantity : (entryPrice-ep)*quantity;
    const pnlPct = isBuy ? (ep-entryPrice)/entryPrice*100 : (entryPrice-ep)/entryPrice*100;
    trades.push({ entryDate, entryPrice, exitDate:last.time, exitPrice:ep, exitReason:"END", pnl, pnlPct, holdDays:ohlcv.length-1-entryIdx });
  }

  const totalPnl = trades.reduce((a,t)=>a+t.pnl,0);
  const winTrades = trades.filter(t=>t.pnl>0).length;
  const winRate = trades.length ? winTrades/trades.length*100 : 0;

  let peak=0, maxDD=0, cum=0;
  for (const t of trades) {
    cum += t.pnl;
    if (cum > peak) peak = cum;
    const dd = peak > 0 ? (peak-cum)/peak*100 : 0;
    if (dd > maxDD) maxDD = dd;
  }

  let sharpe = 0;
  if (trades.length > 1) {
    const rets = trades.map(t=>t.pnlPct);
    const mean = rets.reduce((a,b)=>a+b,0)/rets.length;
    const std  = Math.sqrt(rets.reduce((a,b)=>a+(b-mean)**2,0)/rets.length);
    if (std > 0) sharpe = (mean/std)*Math.sqrt(252);
  }

  return { symbol, trades, totalPnl, winRate, maxDD, sharpe, totalTrades:trades.length, winTrades };
}

// ── TradingChart ──────────────────────────────────────────────────────────────
function TradingChart({ ohlcv, conds, trades, action }: {
  ohlcv: OHLCVRow[]; conds: ECond[]; trades?: Trade[]; action?: "BUY"|"SELL";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<Highcharts.StockChart | null>(null);

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
    chartRef.current?.destroy();
    chartRef.current = null;
    if (!containerRef.current || ohlcv.length === 0) return;

    const toMs = (t: string) => new Date(t).getTime();

    // ── Build yAxis panels ────────────────────────────────────────────────────
    const subCount = (hasRSI ? 1 : 0) + (hasMACD ? 1 : 0);
    const subH     = subCount > 0 ? 18 : 0;
    const mainH    = 100 - subH * subCount;
    const yAxes: Highcharts.YAxisOptions[] = [];
    const series:  Highcharts.SeriesOptionsType[] = [];
    let   top = 0;

    // Main price axis
    yAxes.push({
      height: `${mainH}%`, top: `${top}%`, offset: 0,
      lineWidth: 1, lineColor: "#1e293b",
      gridLineColor: "#0f172a",
      labels: { align: "right", x: -5, style: { color: "#475569" } },
      resize: { enabled: subCount > 0 },
    });
    top += mainH + 2;

    // Candlestick
    series.push({
      type: "candlestick",
      name: "Price",
      id: "candle",
      data: ohlcv.map(r => [toMs(r.time), r.open, r.high, r.low, r.close]),
      yAxis: 0,
      color: "#f43f5e", upColor: "#10b981",
      lineColor: "#f43f5e", upLineColor: "#10b981",
      dataGrouping: { enabled: false },
    } as Highcharts.SeriesCandlestickOptions);

    // Indicator overlays on main chart
    seriesData.forEach(({ color, data }) => {
      series.push({
        type: "line",
        data: data.map(d => [toMs(d.time), d.value]),
        color, lineWidth: 1, yAxis: 0,
        enableMouseTracking: false,
        marker: { enabled: false },
        showInLegend: false,
        dataGrouping: { enabled: false },
      } as Highcharts.SeriesLineOptions);
    });

    // Trade entry/exit flags
    if (trades && trades.length > 0) {
      const isBuy = action !== "SELL";
      series.push({
        type: "flags", name: "Entries",
        onSeries: "candle", shape: "arrowUp",
        color: "#10b981", fillColor: "#10b981",
        style: { color: "#fff", fontSize: "9px" },
        yAxis: 0,
        data: trades.map(t => ({ x: toMs(t.entryDate), title: isBuy ? "B" : "S" })),
        dataGrouping: { enabled: false },
      } as any);
      series.push({
        type: "flags", name: "Exits",
        onSeries: "candle", shape: "arrowDown",
        yAxis: 0,
        data: trades.map(t => ({
          x: toMs(t.exitDate),
          title: t.exitReason,
          color: t.exitReason==="SL" ? "#f43f5e" : t.exitReason==="TP" ? "#3b82f6" : t.exitReason==="TSL" ? "#f97316" : "#94a3b8",
          fillColor: t.exitReason==="SL" ? "#f43f5e" : t.exitReason==="TP" ? "#3b82f6" : t.exitReason==="TSL" ? "#f97316" : "#94a3b8",
        })),
        style: { color: "#fff", fontSize: "9px" },
        dataGrouping: { enabled: false },
      } as any);
    }

    // ── RSI panel ─────────────────────────────────────────────────────────────
    if (hasRSI) {
      const rsiAxis = yAxes.length;
      yAxes.push({
        height: `${subH}%`, top: `${top}%`, offset: 0,
        lineWidth: 1, lineColor: "#1e293b",
        gridLineColor: "#0f172a",
        labels: { align: "right", x: -5, style: { color: "#475569" } },
        min: 0, max: 100,
        plotLines: [
          { value: 70, color: "#f43f5e88", width: 1, dashStyle: "Dash" },
          { value: 30, color: "#10b98188", width: 1, dashStyle: "Dash" },
        ],
      });
      top += subH + 2;
      series.push({
        type: "line", name: "RSI",
        data: ohlcv.map((r,i) => [toMs(r.time), rsiData[i]]).filter(d => !isNaN(d[1] as number)),
        yAxis: rsiAxis, color: "#a855f7", lineWidth: 1,
        marker: { enabled: false },
        dataGrouping: { enabled: false },
      } as Highcharts.SeriesLineOptions);
    }

    // ── MACD panel ────────────────────────────────────────────────────────────
    if (hasMACD && macdData) {
      const macdAxis = yAxes.length;
      yAxes.push({
        height: `${subH}%`, top: `${top}%`, offset: 0,
        lineWidth: 1, lineColor: "#1e293b",
        gridLineColor: "#0f172a",
        labels: { align: "right", x: -5, style: { color: "#475569" } },
      });
      series.push({
        type: "line", name: "MACD",
        data: ohlcv.map((r,i) => [toMs(r.time), macdData.ml[i]]).filter(d => !isNaN(d[1] as number)),
        yAxis: macdAxis, color: "#3b82f6", lineWidth: 1,
        marker: { enabled: false },
        dataGrouping: { enabled: false },
      } as Highcharts.SeriesLineOptions);
      series.push({
        type: "line", name: "Signal",
        data: ohlcv.map((r,i) => [toMs(r.time), macdData.sl[i]]).filter(d => !isNaN(d[1] as number)),
        yAxis: macdAxis, color: "#f97316", lineWidth: 1,
        marker: { enabled: false },
        dataGrouping: { enabled: false },
      } as Highcharts.SeriesLineOptions);
      series.push({
        type: "column", name: "Histogram",
        data: ohlcv.map((r,i) => ({
          x: toMs(r.time),
          y: macdData.hist[i],
          color: macdData.hist[i] >= 0 ? "#10b98199" : "#f43f5e99",
        })).filter(d => !isNaN(d.y)),
        yAxis: macdAxis,
        dataGrouping: { enabled: false },
      } as Highcharts.SeriesColumnOptions);
    }

    chartRef.current = Highcharts.stockChart(containerRef.current, {
      accessibility: { enabled: false },
      chart: {
        backgroundColor: "#020617",
        margin: [0, 60, 30, 0],
        style: { fontFamily: "inherit" },
      },
      title: { text: undefined },
      rangeSelector: { enabled: false },
      navigator:     { enabled: false },
      scrollbar:     { enabled: false },
      xAxis: {
        type: "datetime",
        lineColor: "#1e293b", tickColor: "#1e293b",
        gridLineColor: "#0f172a",
        labels: { style: { color: "#475569" } },
        crosshair: { color: "#334155" },
      },
      yAxis: yAxes,
      series,
      tooltip: {
        split: false, shared: true,
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        style: { color: "#e2e8f0" },
      },
      legend: { enabled: false },
      credits: { enabled: false },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ohlcv, seriesData, hasRSI, hasMACD, rsiData, macdData, trades]);

  return <div ref={containerRef} className="w-full h-full" />;
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

// ── Instrument chip ───────────────────────────────────────────────────────────
function InstrumentRow({ instruments, active, onSwitch, onRemove, onAdd }: {
  instruments:string[]; active:string; onSwitch:(s:string)=>void; onRemove:(s:string)=>void;
  onAdd:(s:string)=>void;
}) {
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open) return;
    const h=(e:MouseEvent)=>{ if(ref.current&&!ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[open]);
  const filtered=useMemo(()=>{
    const lq=q.toLowerCase();
    return NIFTY500_STOCKS.filter(s=>!instruments.includes(s.symbol)&&(s.symbol.toLowerCase().includes(lq)||s.name.toLowerCase().includes(lq))).slice(0,8);
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
          {instruments.length>1&&<button onClick={e=>{e.stopPropagation();onRemove(sym);}} className="text-slate-600 hover:text-rose-400 ml-0.5">x</button>}
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
                placeholder="Search Nifty 500..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500"/>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {filtered.map(s=>(
                <button key={s.symbol} onClick={()=>{onAdd(s.symbol);setOpen(false);}}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-700 text-left">
                  <span className="font-bold text-slate-100 text-sm w-24 shrink-0">{s.symbol}</span>
                  <span className="text-slate-500 text-xs truncate">{s.name}</span>
                  <span className="ml-auto text-[9px] text-slate-600 shrink-0">{s.sector}</span>
                </button>
              ))}
              {!filtered.length&&<p className="px-3 py-3 text-xs text-slate-600 text-center">No matches</p>}
            </div>
          </div>
        )}
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

  // ── Backtest state ───────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"builder"|"backtest">("builder");
  const [btUniverse, setBtUniverse] = useState<"selected"|"n50"|"n100"|"n500">("selected");
  const [btPeriod, setBtPeriod] = useState<"180"|"365"|"730">("365");
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
      if(s.symbol){ setInstruments([s.symbol]); setActive(s.symbol); }
      if(s.action) setAction(s.action);
      setLoadingEdit(false);
    }).catch(()=>setLoadingEdit(false));
  },[editId]);

  const ohlcv = useMemo(()=>generateOHLCV(active), [active]);
  const inds   = useMemo(()=>activeInds(conds), [conds]);

  const legend  = useMemo(()=>inds.filter(x=>x.kind!=="RSI"&&x.kind!=="MACD"), [inds]);
  const hasRSI  = useMemo(()=>inds.some(x=>x.kind==="RSI"), [inds]);
  const hasMACD = useMemo(()=>inds.some(x=>x.kind==="MACD"), [inds]);

  function addCond() {
    setConds(p=>[...p, mkC({kind:"SMA",src:"close",period:9},{kind:"SMA",src:"close",period:21},"crosses above")]);
  }
  function updCond(id:string,c:ECond) { setConds(p=>p.map(x=>x.id===id?c:x)); }
  function delCond(id:string) { setConds(p=>p.filter(x=>x.id!==id)); }

  const currentStock = NIFTY500_STOCKS.find(s=>s.symbol===active);
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

  // Chart trades: show trades of btSelectedSym if on backtest tab and sym matches active
  const chartTrades = useMemo(()=>{
    if(activeTab!=="backtest") return undefined;
    const r = btResults.find(x=>x.symbol===active);
    return r?.trades;
  },[activeTab,btResults,active]);

  // ── Backtest runner ──────────────────────────────────────────────────────
  function runBacktest() {
    if(!conds.length){ setError("Add at least one entry condition."); return; }
    if(!parseFloat(sl)){ setError("Stop Loss required for backtesting"); return; }
    setError(null);

    const universeMap = {
      selected: instruments.map(s=>NIFTY500_STOCKS.find(x=>x.symbol===s)!).filter(Boolean),
      n50:  NIFTY500_STOCKS.slice(0,50),
      n100: NIFTY500_STOCKS.slice(0,100),
      n500: NIFTY500_STOCKS,
    };
    const universe = universeMap[btUniverse];

    setBtResults([]); setBtProgress(0); setBtRunning(true); setBtSelectedSym(null);

    const slPct  = parseFloat(sl)  || 0;
    const tpPct  = parseFloat(tp)  || 0;
    const tslPct = parseFloat(tsl) || 0;
    const qty    = parseInt(btQty) || 100;
    const days   = parseInt(btPeriod);
    const mhd    = parseInt(holdDays) || 30;
    const accum: StockResult[] = [];
    const BATCH = 20;

    function processBatch(start: number) {
      const end = Math.min(start+BATCH, universe.length);
      for(let i=start;i<end;i++){
        const stock = universe[i];
        const rows  = generateOHLCV(stock.symbol, days);
        accum.push(runBacktestForSymbol(stock.symbol,rows,conds,slPct,tpPct,tslPct,action,qty,mhd));
      }
      setBtProgress(Math.round(end/universe.length*100));
      setBtResults([...accum]);
      if(end<universe.length){ setTimeout(()=>processBatch(end),0); }
      else { setBtRunning(false); }
    }
    setTimeout(()=>processBatch(0),0);
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
      version:1, name, desk:"equity", symbol:active, action,
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
    <div className="fixed flex flex-col bg-slate-950" style={{top:60,left:240,right:0,bottom:0,zIndex:5}}>

      {/* TOP: Chart ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col shrink-0" style={{height:"52%"}}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950 shrink-0">
          <div className="flex items-center gap-0 overflow-x-auto" style={{scrollbarWidth:"none"}}>
            {instruments.map(sym=>(
              <button key={sym} onClick={()=>setActive(sym)}
                className={`flex items-center gap-1.5 px-3 py-1.5 border-b-2 text-xs font-semibold transition-all whitespace-nowrap ${sym===active
                  ?"border-blue-500 text-blue-300":"border-transparent text-slate-600 hover:text-slate-400"}`}>
                <span className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-[7px] font-bold text-white">{sym[0]}</span>
                {sym}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mx-4">
            <span className="font-bold text-slate-100 text-sm">{active}</span>
            <span className="text-[10px] text-slate-600 border border-slate-800 rounded px-1">NSE</span>
            <span className={`text-sm font-semibold ${lastClose.pct>=0?"text-emerald-400":"text-rose-400"}`}>
              Rs.{lastClose.price.toFixed(2)}
            </span>
            <span className={`text-xs ${lastClose.pct>=0?"text-emerald-500":"text-rose-500"}`}>
              ({lastClose.pct>=0?"+":""}{lastClose.pct.toFixed(2)}%)
            </span>
            {currentStock&&<span className="text-[10px] text-slate-700 hidden sm:block">{currentStock.sector}</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 mr-2">
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
              className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-400 focus:outline-none">
              {TFs.map(t=><option key={t}>{t}</option>)}
            </select>
            <button className="flex items-center gap-1 px-2.5 py-1 text-[10px] text-slate-600 hover:text-slate-300 border border-slate-800 rounded-lg transition-colors">
              <span className="font-mono font-bold text-[9px]">fx</span> Indicators
            </button>
            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              <button onClick={()=>setAction("BUY")} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${action==="BUY"?"bg-emerald-600 text-white":"text-slate-500 hover:text-slate-300"}`}>Buy</button>
              <button onClick={()=>setAction("SELL")} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${action==="SELL"?"bg-rose-600 text-white":"text-slate-500 hover:text-slate-300"}`}>Sell</button>
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-0 relative">
          <TradingChart ohlcv={ohlcv} conds={conds} trades={chartTrades} action={action} key={`${active}-${hasRSI}-${hasMACD}-${activeTab}`} />
        </div>
      </div>

      {/* BOTTOM: Tabbed panel ──────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0 border-t border-slate-800">
        {/* Combined header: name | tabs | save */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950 shrink-0">
          {/* Left: Strategy name */}
          <div className="flex items-center gap-3 min-w-0">
            <h1 ref={nameRef} contentEditable suppressContentEditableWarning
              onBlur={()=>setName(nameRef.current?.textContent?.trim()||"Untitled Strategy")}
              className="text-sm font-semibold text-slate-100 focus:outline-none focus:border-b focus:border-emerald-500 cursor-text min-w-[120px] truncate max-w-[160px]">
              {name}
            </h1>
            {editId&&<span className="text-[10px] text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5 bg-amber-500/10 shrink-0">Editing</span>}
          </div>
          {/* Center: Tab buttons */}
          <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800 rounded-lg p-0.5">
            <button onClick={()=>setActiveTab("builder")}
              className={`px-4 py-1 rounded-md text-xs font-semibold transition-all ${activeTab==="builder"
                ?"bg-slate-800 text-blue-300 border-b-2 border-blue-500"
                :"text-slate-500 hover:text-slate-300"}`}>
              Builder
            </button>
            <button onClick={()=>setActiveTab("backtest")}
              className={`px-4 py-1 rounded-md text-xs font-semibold transition-all ${activeTab==="backtest"
                ?"bg-slate-800 text-blue-300 border-b-2 border-blue-500"
                :"text-slate-500 hover:text-slate-300"}`}>
              Backtest
            </button>
          </div>
          {/* Right: error + save */}
          <div className="flex items-center gap-2">
            <button onClick={()=>router.push("/equity/strategies")}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-800 rounded-lg text-xs text-slate-500 hover:border-slate-600 hover:text-slate-300 transition-colors">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5"><path d="M2 4h12M2 8h12M2 12h8"/></svg>
              My Strategies
            </button>
            {error&&<span className="text-xs text-rose-400 max-w-[140px] truncate">{error}</span>}
            <button onClick={save} disabled={saving}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow shadow-blue-600/20">
              {saving?"Saving...":editId?"Update":"Save Strategy"}
            </button>
          </div>
        </div>

        {/* ── Builder Tab ─────────────────────────────────────────────────── */}
        {activeTab==="builder"&&(
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950">
            <Accordion title="Entry" badge={`${conds.length} condition${conds.length!==1?"s":""}`}>
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Instruments</p>
                <InstrumentRow
                  instruments={instruments} active={active}
                  onSwitch={setActive}
                  onRemove={sym=>{ const n=instruments.filter(s=>s!==sym); setInstruments(n); if(active===sym) setActive(n[0]); }}
                  onAdd={sym=>{ if(!instruments.includes(sym)){setInstruments(p=>[...p,sym]);} setActive(sym); }}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Conditions</p>
                  <button className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-emerald-400 border border-slate-800 hover:border-emerald-600 rounded-lg px-2 py-0.5 transition-colors">
                    Assist
                  </button>
                </div>
                <div className="space-y-0.5">
                  {conds.map((c,i)=>(
                    <CondRow key={c.id} cond={c} isFirst={i===0} onChange={nc=>updCond(c.id,nc)} onDel={()=>delCond(c.id)}/>
                  ))}
                  {!conds.length&&<p className="text-xs text-slate-700 py-1">No conditions yet.</p>}
                </div>
                <button onClick={addCond}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-emerald-400 transition-colors mt-1 group">
                  <span className="w-5 h-5 rounded-full border border-dashed border-slate-700 group-hover:border-emerald-600 flex items-center justify-center text-base leading-none">+</span>
                  Add Condition
                </button>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Quick Setups</p>
                <div className="flex gap-2 overflow-x-auto pb-1" style={{scrollbarWidth:"none"}}>
                  {SETUPS.map(s=>(
                    <button key={s.name} onClick={()=>setConds(p=>[...p,s.mk()])}
                      className="flex-none flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-800 bg-slate-900 hover:border-emerald-600/40 hover:bg-slate-800 transition-all group min-w-[64px]">
                      <svg viewBox="0 0 36 24" className="w-9 h-6 opacity-50 group-hover:opacity-90 transition-opacity">
                        {[3,5,4,8,6,11,9,14,12,17,15,20,18].map((h,i)=>(
                          <rect key={i} x={i*2.7+0.5} y={24-h} width="1.8" height={h} fill={i%3===0?"#f43f5e":"#10b981"} rx="0.4"/>
                        ))}
                        <path d="M0,14 Q4,12 9,10 Q14,8 18,6 Q23,5 36,3" stroke="#f59e0b" strokeWidth="1.2" fill="none"/>
                      </svg>
                      <span className="text-[9px] text-slate-600 group-hover:text-slate-300 text-center leading-tight transition-colors whitespace-nowrap">{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </Accordion>

            <Accordion title="Exit" defaultOpen>
              <div className="grid grid-cols-3 gap-3">
                {([["Stop Loss",sl,setSl,true],["Target Profit",tp,setTp,false],["Trailing SL",tsl,setTsl,false]] as const).map(
                  ([lbl,val,set,req]: any)=>(
                    <div key={lbl}>
                      <p className="text-[10px] text-slate-600 mb-1.5">{lbl}{req&&<span className="text-rose-500 ml-0.5">*</span>}</p>
                      <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg overflow-hidden focus-within:border-slate-600 transition-colors">
                        <input type="number" min="0" step="0.01" value={val} onChange={(e:any)=>set(e.target.value)}
                          placeholder="0.00"
                          className="flex-1 bg-transparent px-2.5 py-2 text-sm text-slate-200 placeholder-slate-700 focus:outline-none min-w-0"/>
                        <span className="px-2 text-xs text-slate-600 border-l border-slate-800">
                          {exitMode==="%"?"%":exitMode==="pts"?"pts":"₹"}
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
              <div className="flex items-center gap-4">
                {(["%","pts","₹"] as ExitM[]).map(m=>(
                  <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="exitMode" value={m} checked={exitMode===m} onChange={()=>setExitMode(m)} className="accent-blue-500"/>
                    <span className="text-xs text-slate-500">{m==="%" ? "Percentage" : m==="pts" ? "Points" : "PNL (\u20b9)"}</span>
                  </label>
                ))}
              </div>
            </Accordion>

            <Accordion title="Risk Controls" defaultOpen={false}>
              <div className="grid grid-cols-3 gap-3">
                {([
                  ["Max Loss / Day (Rs.)", maxLoss, setMaxLoss] as const,
                  ["Max Trades / Day",     maxTrades, setMaxTrades] as const,
                  ["Hold Days",            holdDays,  setHoldDays] as const,
                ]).map(([lbl, val, set]) => (
                  <div key={lbl}>
                    <p className="text-[10px] text-slate-600 mb-1.5">{lbl}</p>
                    <input type="number" min="0" value={val}
                      onChange={(e) => set(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-600 transition-colors"/>
                  </div>
                ))}
              </div>
            </Accordion>
          </div>
        )}

        {/* ── Backtest Tab ─────────────────────────────────────────────────── */}
        {activeTab==="backtest"&&(
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950">
            {/* Controls */}
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <p className="text-[10px] text-slate-600 uppercase mb-1">Universe</p>
                <select value={btUniverse} onChange={e=>setBtUniverse(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none">
                  <option value="selected">Selected Stocks</option>
                  <option value="n50">Nifty 50</option>
                  <option value="n100">Nifty 100</option>
                  <option value="n500">Nifty 500</option>
                </select>
              </div>
              <div>
                <p className="text-[10px] text-slate-600 uppercase mb-1">Period</p>
                <select value={btPeriod} onChange={e=>setBtPeriod(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none">
                  <option value="180">6M (180d)</option>
                  <option value="365">1Y (365d)</option>
                  <option value="730">2Y (730d)</option>
                </select>
              </div>
              <div>
                <p className="text-[10px] text-slate-600 uppercase mb-1">Quantity</p>
                <input type="number" min="1" value={btQty} onChange={e=>setBtQty(e.target.value)}
                  className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"/>
              </div>
              <button onClick={runBacktest} disabled={btRunning}
                className="flex items-center gap-2 px-5 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors shadow shadow-emerald-800/30">
                {btRunning?(
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 70"/>
                  </svg>
                ):"▶"} {btRunning?"Running...":"Run Backtest"}
              </button>
            </div>

            {/* Progress bar */}
            {btRunning&&(
              <div className="space-y-1">
                <p className="text-[10px] text-slate-500">
                  Testing {Math.round(btProgress/100*({selected:instruments.length,n50:50,n100:100,n500:NIFTY500_STOCKS.length}[btUniverse]||1))}/{({selected:instruments.length,n50:50,n100:100,n500:NIFTY500_STOCKS.length}[btUniverse])} stocks...
                </p>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-200" style={{width:`${btProgress}%`}}/>
                </div>
              </div>
            )}

            {/* Results */}
            {btSummary&&(
              <div className="space-y-3">
                {/* Summary cards row 1 */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    {label:"Total Trades",    value:String(btSummary.totalTrades),     color:"text-slate-100"},
                    {label:"Win Rate",        value:`${btSummary.winRate.toFixed(1)}%`, color:"text-emerald-400"},
                    {label:"Total P&L (Rs.)", value:`${btSummary.totalPnl>=0?"+":""}${btSummary.totalPnl.toLocaleString("en-IN",{maximumFractionDigits:0})}`, color:btSummary.totalPnl>=0?"text-emerald-400":"text-rose-400"},
                    {label:"Max Drawdown",    value:`${btSummary.maxDD.toFixed(1)}%`,   color:"text-rose-400"},
                  ].map(c=>(
                    <div key={c.label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
                      <p className="text-[10px] text-slate-600 mb-1">{c.label}</p>
                      <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
                    </div>
                  ))}
                </div>
                {/* Summary cards row 2 */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
                    <p className="text-[10px] text-slate-600 mb-1">Avg Return / Trade</p>
                    <p className={`text-base font-bold ${btSummary.avgReturn>=0?"text-emerald-400":"text-rose-400"}`}>
                      {btSummary.avgReturn>=0?"+":""}{btSummary.avgReturn.toFixed(2)}%
                    </p>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
                    <p className="text-[10px] text-slate-600 mb-1">Best Stock</p>
                    {btSummary.bestStock?(
                      <p className="text-base font-bold text-emerald-400">
                        {btSummary.bestStock.symbol}
                        <span className="text-xs ml-1 text-emerald-500/70">
                          +{btSummary.bestStock.totalPnl.toLocaleString("en-IN",{maximumFractionDigits:0})}
                        </span>
                      </p>
                    ):<p className="text-slate-600 text-xs">—</p>}
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
                    <p className="text-[10px] text-slate-600 mb-1">Worst Stock</p>
                    {btSummary.worstStock?(
                      <p className="text-base font-bold text-rose-400">
                        {btSummary.worstStock.symbol}
                        <span className="text-xs ml-1 text-rose-500/70">
                          {btSummary.worstStock.totalPnl.toLocaleString("en-IN",{maximumFractionDigits:0})}
                        </span>
                      </p>
                    ):<p className="text-slate-600 text-xs">—</p>}
                  </div>
                </div>

                {/* Sortable table */}
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto max-h-52 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-900 border-b border-slate-800">
                        <tr>
                          {[
                            {label:"Stock",      col:null},
                            {label:"Sector",     col:null},
                            {label:"Trades",     col:"totalTrades" as const},
                            {label:"Win%",       col:"winRate" as const},
                            {label:"Net P&L (Rs.)", col:"totalPnl" as const},
                            {label:"Return%",    col:null},
                            {label:"Max DD%",    col:"maxDD" as const},
                            {label:"Sharpe",     col:"sharpe" as const},
                            {label:"Signal",     col:null},
                          ].map(({label,col})=>(
                            <th key={label}
                              onClick={col?()=>toggleSort(col):undefined}
                              className={`px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap ${col?"cursor-pointer hover:text-slate-300":""}`}>
                              {label} {col?sortIcon(col):""}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedResults.map((r,idx)=>{
                          const stock = NIFTY500_STOCKS.find(s=>s.symbol===r.symbol);
                          const avgRetPct = r.trades.length ? r.trades.reduce((a,t)=>a+t.pnlPct,0)/r.trades.length : 0;
                          const lastTrade = r.trades[r.trades.length-1];
                          const isActive = lastTrade && lastTrade.exitReason==="END" && lastTrade.exitDate===r.trades[r.trades.length-1]?.exitDate;
                          const isSelected = r.symbol===btSelectedSym;
                          return (
                            <tr key={r.symbol}
                              onClick={()=>{ setBtSelectedSym(isSelected?null:r.symbol); setActive(r.symbol); }}
                              className={`border-b border-slate-800/50 cursor-pointer transition-colors ${isSelected?"bg-blue-500/10":idx%2===0?"bg-slate-950":"bg-slate-900/40"} hover:bg-slate-800/60`}>
                              <td className="px-3 py-2 font-semibold text-slate-200 whitespace-nowrap">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-[7px] font-bold text-white shrink-0">{r.symbol[0]}</span>
                                  {r.symbol}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-600 truncate max-w-[100px]">{stock?.sector||"—"}</td>
                              <td className="px-3 py-2 text-slate-400">{r.totalTrades}</td>
                              <td className="px-3 py-2 text-emerald-400">{r.winRate.toFixed(1)}%</td>
                              <td className={`px-3 py-2 font-semibold ${r.totalPnl>=0?"text-emerald-400":"text-rose-400"}`}>
                                {r.totalPnl>=0?"+":""}{r.totalPnl.toLocaleString("en-IN",{maximumFractionDigits:0})}
                              </td>
                              <td className={`px-3 py-2 ${avgRetPct>=0?"text-emerald-400":"text-rose-400"}`}>
                                {avgRetPct>=0?"+":""}{avgRetPct.toFixed(2)}%
                              </td>
                              <td className="px-3 py-2 text-rose-400">{r.maxDD.toFixed(1)}%</td>
                              <td className={`px-3 py-2 ${r.sharpe>=0?"text-blue-400":"text-slate-500"}`}>{r.sharpe.toFixed(2)}</td>
                              <td className="px-3 py-2">
                                {r.totalTrades===0?(
                                  <span className="text-[9px] text-slate-700 border border-slate-800 rounded px-1.5 py-0.5">No Signal</span>
                                ):isActive?(
                                  <span className="text-[9px] text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5 bg-emerald-500/10">Active</span>
                                ):(
                                  <span className="text-[9px] text-slate-400 border border-slate-700 rounded px-1.5 py-0.5">Done</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Trade detail panel */}
                {selectedBtResult&&selectedBtResult.trades.length>0&&(
                  <div className="border border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300">
                        {selectedBtResult.symbol} — {selectedBtResult.totalTrades} trade{selectedBtResult.totalTrades!==1?"s":""}
                      </span>
                      <button onClick={()=>setBtSelectedSym(null)} className="text-slate-600 hover:text-slate-300 text-sm">x</button>
                    </div>
                    <div className="overflow-x-auto max-h-40 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-900 border-b border-slate-800">
                          <tr>
                            {["#","Entry Date","Entry Rs.","Exit Date","Exit Rs.","Reason","P&L (Rs.)","Hold"].map(h=>(
                              <th key={h} className="px-3 py-1.5 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedBtResult.trades.map((t,i)=>{
                            const reasonColor = t.exitReason==="SL"?"text-rose-400 bg-rose-500/10 border-rose-500/30":
                              t.exitReason==="TP"?"text-blue-400 bg-blue-500/10 border-blue-500/30":
                              t.exitReason==="TSL"?"text-orange-400 bg-orange-500/10 border-orange-500/30":
                              "text-slate-400 bg-slate-800 border-slate-700";
                            return (
                              <tr key={i} className={`border-b border-slate-800/50 ${t.pnl>0?"bg-emerald-950/30":"bg-rose-950/20"}`}>
                                <td className="px-3 py-1.5 text-slate-600">{i+1}</td>
                                <td className="px-3 py-1.5 text-slate-400 font-mono">{t.entryDate}</td>
                                <td className="px-3 py-1.5 text-slate-300">{t.entryPrice.toFixed(2)}</td>
                                <td className="px-3 py-1.5 text-slate-400 font-mono">{t.exitDate}</td>
                                <td className="px-3 py-1.5 text-slate-300">{t.exitPrice.toFixed(2)}</td>
                                <td className="px-3 py-1.5">
                                  <span className={`text-[9px] border rounded px-1.5 py-0.5 font-semibold ${reasonColor}`}>{t.exitReason}</span>
                                </td>
                                <td className={`px-3 py-1.5 font-semibold ${t.pnl>=0?"text-emerald-400":"text-rose-400"}`}>
                                  {t.pnl>=0?"+":""}{t.pnl.toFixed(0)}
                                </td>
                                <td className="px-3 py-1.5 text-slate-500">{t.holdDays}d</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!btRunning&&!btSummary&&(
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-3 text-2xl">
                  ▶
                </div>
                <p className="text-sm text-slate-500 font-medium">Run a backtest to see results</p>
                <p className="text-xs text-slate-700 mt-1">Configure universe and period, then click Run Backtest</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
