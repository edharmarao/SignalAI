"use client";
import { useEffect, useState } from "react";

export interface Tick {
  symbol: string;
  ltp: number;
  ts: number;
}

export function useLiveTicks() {
  const [ticks, setTicks] = useState<Record<string, Tick>>({});

  useEffect(() => {
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
