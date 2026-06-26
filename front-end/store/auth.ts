"use client";
import { create } from "zustand";
import { auth } from "../lib/auth";

interface AuthState {
  user: { id: string } | null;
  loading: boolean;
  init: () => void;
  signOut: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  init: () => {
    set({ user: auth.getUser(), loading: false });
  },
  signOut: () => {
    auth.clearSession();
    set({ user: null });
    window.location.href = "/login";
  },
}));
