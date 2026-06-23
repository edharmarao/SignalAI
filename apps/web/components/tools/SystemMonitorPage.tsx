"use client";
import { useEffect, useRef, useState } from "react";
import { auth } from "@/lib/auth";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CpuStats {
  overall_pct: number;
  per_core: number[];
  core_count: number;
  physical_cores: number;
  load_avg: { "1m": number; "5m": number; "15m": number };
}
interface MemStats  { total_gb: number; used_gb: number; free_gb: number; used_pct: number; cached_gb: number }
interface SwapStats { total_gb: number; used_gb: number; used_pct: number }
interface DiskStats { total_gb: number; used_gb: number; free_gb: number; used_pct: number }
interface NetStats  { tx_mbps: number; rx_mbps: number }
interface Process   { pid: number; name: string; cpu: number; mem_mb: number; status: string; user: string }

interface Snapshot {
  timestamp: string;
  cpu: CpuStats;
  memory: MemStats;
  swap: SwapStats;
  disk: DiskStats;
  network: NetStats;
  processes: Process[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const HISTORY_LEN = 60;

function pctColor(pct: number) {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  if (pct >= 40) return "bg-sky-500";
  return "bg-emerald-500";
}
function pctText(pct: number) {
  if (pct >= 90) return "text-red-400";
  if (pct >= 70) return "text-amber-400";
  if (pct >= 40) return "text-sky-400";
  return "text-emerald-400";
}

function Gauge({ pct, label, sub }: { pct: number; label: string; sub: string }) {
  const r = 42, circ = 2 * Math.PI * r;
  const fill = circ * (1 - pct / 100);
  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 100 100" className="w-28 h-28">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none"
          stroke={pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : pct >= 40 ? "#38bdf8" : "#10b981"}
          strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={fill}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 0.6s ease" }} />
        <text x="50" y="47" textAnchor="middle" className="fill-slate-100" style={{ fontSize: 18, fontWeight: 700 }}>{pct.toFixed(0)}%</text>
        <text x="50" y="62" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 9 }}>{label}</text>
      </svg>
      <div className="text-xs text-slate-400 text-center">{sub}</div>
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 200, h = 40;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-10">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SystemMonitorPage() {
  const [snap, setSnap]       = useState<Snapshot | null>(null);
  const [error, setError]     = useState("");
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [sortBy, setSortBy]   = useState<"cpu" | "mem">("cpu");
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const authHdr = auth.getHeader() ? `Basic ${auth.getHeader()}` : "";

    // Use fetch-based SSE so we can send auth header
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/v1/system/stats/stream", {
          headers: { Authorization: authHdr },
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) { setError(`HTTP ${res.status}`); return; }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const s: Snapshot = JSON.parse(line.slice(6));
              setSnap(s);
              setCpuHistory((h) => [...h.slice(-(HISTORY_LEN - 1)), s.cpu.overall_pct]);
              setMemHistory((h) => [...h.slice(-(HISTORY_LEN - 1)), s.memory.used_pct]);
            } catch { /* skip */ }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(String(e));
      }
    })();
    return () => ctrl.abort();
  }, []);

  if (error) return <div className="flex items-center justify-center h-64 text-red-400 text-sm">{error}</div>;
  if (!snap) return (
    <div className="flex items-center justify-center h-64 gap-3 text-slate-500 text-sm">
      <span className="animate-spin w-4 h-4 border-2 border-slate-600 border-t-emerald-500 rounded-full inline-block" />
      Connecting to system monitor…
    </div>
  );

  const { cpu, memory, swap, disk, network, processes } = snap;
  const sortedProcs = [...processes].sort((a, b) => sortBy === "cpu" ? b.cpu - a.cpu : b.mem_mb - a.mem_mb);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">System Monitor</h1>
          <p className="text-xs text-slate-500 mt-1">Updated {snap.timestamp} · live stream</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Live
        </span>
      </div>

      {/* ── Gauges row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-center">
          <Gauge pct={cpu.overall_pct} label="CPU" sub={`${cpu.physical_cores}C / ${cpu.core_count}T`} />
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-center">
          <Gauge pct={memory.used_pct} label="RAM" sub={`${memory.used_gb}GB / ${memory.total_gb}GB`} />
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-center">
          <Gauge pct={disk.used_pct} label="Disk" sub={`${disk.used_gb}GB / ${disk.total_gb}GB`} />
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-center">
          <Gauge pct={swap.used_pct} label="Swap" sub={`${swap.used_gb}GB / ${swap.total_gb}GB`} />
        </div>
      </div>

      {/* ── Sparklines + detail ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CPU detail */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-200">CPU</span>
            <span className={`text-lg font-bold ${pctText(cpu.overall_pct)}`}>{cpu.overall_pct}%</span>
          </div>
          <Sparkline data={cpuHistory} color={cpu.overall_pct >= 80 ? "#ef4444" : "#10b981"} />
          <div className="mt-3 grid grid-cols-3 gap-1 text-xs text-slate-400">
            <span>Load 1m: <span className="text-slate-200">{cpu.load_avg["1m"]}</span></span>
            <span>Load 5m: <span className="text-slate-200">{cpu.load_avg["5m"]}</span></span>
            <span>Load 15m: <span className="text-slate-200">{cpu.load_avg["15m"]}</span></span>
          </div>
          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-2">Per-core usage</div>
            <div className="grid grid-cols-4 gap-1.5">
              {cpu.per_core.map((c, i) => (
                <div key={i}>
                  <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                    <span>C{i}</span><span>{c}%</span>
                  </div>
                  <Bar pct={c} color={pctColor(c)} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Memory detail */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-200">Memory</span>
            <span className={`text-lg font-bold ${pctText(memory.used_pct)}`}>{memory.used_pct}%</span>
          </div>
          <Sparkline data={memHistory} color={memory.used_pct >= 80 ? "#ef4444" : "#38bdf8"} />
          <div className="mt-3 space-y-2 text-xs">
            {[
              { label: "Used",   val: memory.used_gb,   total: memory.total_gb, color: pctColor(memory.used_pct) },
              { label: "Free",   val: memory.free_gb,   total: memory.total_gb, color: "bg-slate-600" },
              { label: "Cached", val: memory.cached_gb, total: memory.total_gb, color: "bg-slate-700" },
            ].map(({ label, val, total, color }) => (
              <div key={label}>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>{label}</span>
                  <span className="text-slate-200">{val} GB <span className="text-slate-500">/ {total} GB</span></span>
                </div>
                <Bar pct={(val / total) * 100} color={color} />
              </div>
            ))}
          </div>

          {/* Network */}
          <div className="mt-4 pt-4 border-t border-slate-800">
            <div className="text-xs text-slate-500 mb-2">Network I/O</div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">↑ Upload</span>
                <span className="font-mono font-semibold text-sky-400">{network.tx_mbps} <span className="text-xs font-normal text-slate-500">MB/s</span></span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">↓ Download</span>
                <span className="font-mono font-semibold text-emerald-400">{network.rx_mbps} <span className="text-xs font-normal text-slate-500">MB/s</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Disk ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-slate-200">Disk ( / )</span>
          <span className={`text-sm font-bold ${pctText(disk.used_pct)}`}>{disk.used_pct}% used</span>
        </div>
        <Bar pct={disk.used_pct} color={pctColor(disk.used_pct)} />
        <div className="flex justify-between text-xs text-slate-400 mt-2">
          <span>Used: <span className="text-slate-200">{disk.used_gb} GB</span></span>
          <span>Free: <span className="text-slate-200">{disk.free_gb} GB</span></span>
          <span>Total: <span className="text-slate-200">{disk.total_gb} GB</span></span>
        </div>
      </div>

      {/* ── Process table ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-slate-200">Top Processes</span>
          <div className="flex gap-1">
            {(["cpu", "mem"] as const).map((k) => (
              <button key={k} onClick={() => setSortBy(k)}
                className={`text-xs px-3 py-1 rounded border transition ${
                  sortBy === k ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "border-slate-700 text-slate-400 hover:text-slate-200"
                }`}>
                Sort by {k.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 uppercase">
                <th className="text-left py-2 pr-3 font-medium">PID</th>
                <th className="text-left py-2 pr-3 font-medium">Name</th>
                <th className="text-left py-2 pr-3 font-medium">User</th>
                <th className="text-right py-2 pr-3 font-medium">CPU %</th>
                <th className="text-right py-2 pr-3 font-medium">MEM MB</th>
                <th className="text-left py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sortedProcs.map((p) => (
                <tr key={p.pid} className="hover:bg-slate-800/40">
                  <td className="py-1.5 pr-3 font-mono text-slate-500">{p.pid}</td>
                  <td className="py-1.5 pr-3 text-slate-200 font-medium max-w-[180px] truncate">{p.name}</td>
                  <td className="py-1.5 pr-3 text-slate-500 max-w-[80px] truncate">{p.user}</td>
                  <td className={`py-1.5 pr-3 text-right font-mono font-semibold ${pctText(p.cpu)}`}>{p.cpu.toFixed(1)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-slate-300">{p.mem_mb.toFixed(0)}</td>
                  <td className="py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      p.status === "running" ? "bg-emerald-500/10 text-emerald-400" :
                      p.status === "sleeping" ? "bg-slate-700 text-slate-400" :
                      "bg-amber-500/10 text-amber-400"
                    }`}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
