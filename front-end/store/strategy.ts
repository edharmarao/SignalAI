"use client";
import { create } from "zustand";
import type { StrategyJSON, DeskType } from "@signalai/types";
import { emptyStrategyForDesk } from "@signalai/utils";

interface StrategyState {
  draft: StrategyJSON;
  set: (patch: Partial<StrategyJSON>) => void;
  setRaw: (s: StrategyJSON) => void;
  reset: (desk?: DeskType) => void;
}

export const useStrategy = create<StrategyState>((set) => ({
  draft: emptyStrategyForDesk("equity"),
  set: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  setRaw: (s) => set({ draft: s }),
  reset: (desk: DeskType = "equity") => set({ draft: emptyStrategyForDesk(desk) }),
}));
