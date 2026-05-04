"use client";
import { Badge } from "@signalai/ui";
import type { Mode } from "@signalai/types";

export function ModeBadge({ mode }: { mode: Mode }) {
  return mode === "live" ? (
    <Badge tone="danger">LIVE MODE</Badge>
  ) : (
    <Badge tone="success">PAPER MODE</Badge>
  );
}
