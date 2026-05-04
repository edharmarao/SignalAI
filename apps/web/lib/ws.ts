"use client";
import { useEffect, useState } from "react";

export interface Tick {
  symbol: string;
  ltp: number;
  ts: number;
}

const USE_MOCK =
  (process.env.NEXT_PUBLIC_USE_MOCK ?? "true").toLowerCase() !== "false";

const SEEDS: Record<string, number> = {
  NIFTY: 22500,
  BANKNIFTY: 48000,
  FINNIFTY: 21000,
  SENSEX: 74000,
};

export function useLiveTicks() {
  const [ticks, setTicks] = useState<Record<string, Tick>>(() =>
    Object.fromEntries(
      Object.entries(SEEDS).map(([s, v]) => [s, { symbol: s, ltp: v, ts: Date.now() }])
    )
  );

  useEffect(() => {
    if (USE_MOCK) {
      const id = setInterval(() => {
        setTicks((prev) => {
          const next: Record<string, Tick> = { ...prev };
          for (const sym of Object.keys(SEEDS)) {
            const last = prev[sym]?.ltp ?? SEEDS[sym];
            const drift = (Math.random() - 0.5) * last * 0.0008;
            next[sym] = {
              symbol: sym,
              ltp: +(last + drift).toFixed(2),
              ts: Date.now(),
            };
          }
          return next;
        });
      }, 1000);
      return () => clearInterval(id);
    }

    const url = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws";
    let ws: WebSocket | null = null;
    let stopped = false;
    function connect() {
      ws = new WebSocket(url);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "ticks") {
            setTicks((prev) => {
              const next = { ...prev };
              for (const t of msg.data as Tick[]) next[t.symbol] = t;
              return next;
            });
          }
        } catch {}
      };
      ws.onclose = () => {
        if (!stopped) setTimeout(connect, 2000);
      };
    }
    connect();
    return () => {
      stopped = true;
      ws?.close();
    };
  }, []);

  return ticks;
}
