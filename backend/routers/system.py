"""System monitoring endpoints.

GET  /system/stats        — snapshot: CPU, RAM, disk, network, top processes
GET  /system/stats/stream — SSE stream, pushes a snapshot every 2 seconds
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime

import psutil
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from deps import get_current_user

router = APIRouter(prefix="/system", tags=["system"])
logger = logging.getLogger("signal_ai")

# ── helpers ───────────────────────────────────────────────────────────────────

def _bytes_to_mb(b: int) -> float:
    return round(b / 1024 / 1024, 1)

def _bytes_to_gb(b: int) -> float:
    return round(b / 1024 / 1024 / 1024, 2)

def _net_counters() -> dict:
    n = psutil.net_io_counters()
    return {"bytes_sent": n.bytes_sent, "bytes_recv": n.bytes_recv,
            "packets_sent": n.packets_sent, "packets_recv": n.packets_recv}

_prev_net: dict | None = None
_prev_net_ts: float = 0.0

def _net_speed_mbps() -> dict:
    """Return current network throughput in MB/s since last call."""
    global _prev_net, _prev_net_ts
    now = time.time()
    cur = _net_counters()
    if _prev_net is None:
        _prev_net = cur
        _prev_net_ts = now
        return {"tx_mbps": 0.0, "rx_mbps": 0.0}
    elapsed = max(now - _prev_net_ts, 0.1)
    tx = round((cur["bytes_sent"] - _prev_net["bytes_sent"]) / elapsed / 1024 / 1024, 3)
    rx = round((cur["bytes_recv"] - _prev_net["bytes_recv"]) / elapsed / 1024 / 1024, 3)
    _prev_net = cur
    _prev_net_ts = now
    return {"tx_mbps": max(tx, 0), "rx_mbps": max(rx, 0)}


def _top_processes(n: int = 25) -> list[dict]:
    # First pass — seeds the cpu_percent cache per process
    procs_raw = []
    for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info", "status", "username"]):
        try:
            mi = p.info["memory_info"]
            procs_raw.append({
                "proc":   p,
                "pid":    p.info["pid"],
                "name":   p.info["name"],
                "cpu":    p.info["cpu_percent"] or 0,
                "mem_mb": _bytes_to_mb(mi.rss) if mi else 0,
                "status": p.info["status"],
                "user":   p.info["username"] or "",
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    # Short sleep so the second cpu_percent call returns a real interval value
    time.sleep(0.3)

    procs = []
    for item in procs_raw:
        try:
            cpu = item["proc"].cpu_percent(interval=None) or item["cpu"]
            procs.append({
                "pid":    item["pid"],
                "name":   item["name"],
                "cpu":    round(cpu, 1),
                "mem_mb": item["mem_mb"],
                "status": item["status"],
                "user":   item["user"],
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            procs.append({k: v for k, v in item.items() if k != "proc"})

    # Sort by CPU desc; break ties by memory
    return sorted(procs, key=lambda x: (x["cpu"], x["mem_mb"]), reverse=True)[:n]


def _snapshot() -> dict:
    cpu_per_core = psutil.cpu_percent(percpu=True)
    cpu_overall  = round(sum(cpu_per_core) / len(cpu_per_core), 1)

    mem  = psutil.virtual_memory()
    swap = psutil.swap_memory()
    disk = psutil.disk_usage("/")

    net_speed = _net_speed_mbps()

    # Load average (unix only)
    try:
        load1, load5, load15 = psutil.getloadavg()
    except AttributeError:
        load1 = load5 = load15 = 0.0

    return {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "cpu": {
            "overall_pct": cpu_overall,
            "per_core":    [round(c, 1) for c in cpu_per_core],
            "core_count":  psutil.cpu_count(logical=True),
            "physical_cores": psutil.cpu_count(logical=False),
            "load_avg":    {"1m": round(load1, 2), "5m": round(load5, 2), "15m": round(load15, 2)},
        },
        "memory": {
            "total_gb":  _bytes_to_gb(mem.total),
            "used_gb":   _bytes_to_gb(mem.used),
            "free_gb":   _bytes_to_gb(mem.available),
            "used_pct":  mem.percent,
            "cached_gb": _bytes_to_gb(getattr(mem, "cached", 0)),
        },
        "swap": {
            "total_gb": _bytes_to_gb(swap.total),
            "used_gb":  _bytes_to_gb(swap.used),
            "used_pct": swap.percent,
        },
        "disk": {
            "total_gb":  _bytes_to_gb(disk.total),
            "used_gb":   _bytes_to_gb(disk.used),
            "free_gb":   _bytes_to_gb(disk.free),
            "used_pct":  disk.percent,
        },
        "network": {
            "tx_mbps": net_speed["tx_mbps"],
            "rx_mbps": net_speed["rx_mbps"],
        },
        "processes": _top_processes(),
    }


# ── routes ────────────────────────────────────────────────────────────────────

@router.get("/stats")
def get_stats(user: dict = Depends(get_current_user)) -> dict:
    """One-shot system snapshot."""
    # Warm up cpu_percent (first call always returns 0)
    psutil.cpu_percent(percpu=True)
    time.sleep(0.2)
    return _snapshot()


@router.get("/stats/stream")
async def stream_stats(user: dict = Depends(get_current_user)) -> StreamingResponse:
    """SSE stream — emits a system snapshot every 2 seconds."""
    # Warm up
    psutil.cpu_percent(percpu=True)
    await asyncio.sleep(0.3)

    async def event_gen():
        while True:
            try:
                snap = _snapshot()
                yield f"data: {json.dumps(snap)}\n\n"
            except Exception as e:
                logger.error("system stats error: %s", e)
            await asyncio.sleep(2)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
