"use client";
import { create } from "zustand";

interface KillSwitchState {
  killed: boolean;
  setKilled: (v: boolean) => void;
}

export const useKillSwitch = create<KillSwitchState>((set) => ({
  killed: false,
  setKilled: (v) => set({ killed: v }),
}));
