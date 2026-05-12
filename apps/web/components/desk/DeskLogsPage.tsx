"use client";
import { useEffect, useState } from "react";
import { Badge, Card } from "@signalai/ui";
import { api } from "@/lib/api";
import type { LogRow, DeskType } from "@signalai/types";
import { DESK_META } from "@signalai/utils";

const DESK_ACCENT: Record<DeskType, string> = {
  equity:         "text-emerald-400",
  options:        "text-violet-400",
  "mutual-funds": "text-sky-400",
};

export function DeskLogsPage({ desk }: { desk: DeskType }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const accent = DESK_ACCENT[desk];
  const meta = DESK_META[desk];

  useEffect(() => {
    api<LogRow[]>(`/logs?desk=${desk}`).then(setRows).catch(() => setRows([]));
  }, [desk]);

  const tone = (l: LogRow["level"]) =>
    l === "error" ? "danger" : l === "warn" ? "warn" : l === "signal" ? "info" : "neutral";

  return (
    <div className="space-y-4">
      <h1 className={`text-2xl font-semibold ${accent}`}>{meta.label} Logs</h1>
      <Card>
        {rows.length === 0 ? (
          <div className="text-sm text-slate-400">No logs yet.</div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {rows.map((r) => (
              <li key={r.id} className="py-2 flex items-start gap-3">
                <Badge tone={tone(r.level)}>{r.level}</Badge>
                <div>
                  <div className="text-sm">{r.event}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(r.created_at).toLocaleString()} · {JSON.stringify(r.data)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
