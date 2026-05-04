"use client";
import { create } from "zustand";
import type { StrategyJSON } from "@signalai/types";
import { emptyStrategy } from "@signalai/utils";

interface StrategyState {
  draft: StrategyJSON;
  set: (patch: Partial<StrategyJSON>) => void;
  setRaw: (s: StrategyJSON) => void;
  reset: () => void;
}

export const useStrategy = create<StrategyState>((set) => ({
  draft: emptyStrategy(),
  set: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  setRaw: (s) => set({ draft: s }),
  reset: () => set({ draft: emptyStrategy() }),
}));
