"use client";
import { create } from "zustand";
import { auth } from "../lib/auth";

interface AuthState {
  user: { id: string } | null;
  loading: boolean;
  init: () => void;
  signIn: (username: string, password: string) => void;
  signOut: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  init: () => {
    set({ user: auth.getUser(), loading: false });
  },
  signIn: (username: string, password: string) => {
    auth.setSession(username, password);
    set({ user: auth.getUser() });
  },
  signOut: () => {
    auth.clearSession();
    set({ user: null });
    window.location.href = "/login";
  },
}));
