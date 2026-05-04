import { supabase } from "./supabase";
import { mockApi } from "./mock";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// Default to mock so the UI runs with zero backend.
// Set NEXT_PUBLIC_USE_MOCK=false in .env.local to use the real FastAPI.
const USE_MOCK =
  (process.env.NEXT_PUBLIC_USE_MOCK ?? "true").toLowerCase() !== "false";

async function authHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token
      ? { Authorization: `Bearer ${token}` }
      : { Authorization: `Bearer demo-user` };
  } catch {
    return { Authorization: `Bearer demo-user` };
  }
}

export async function api<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  if (USE_MOCK) return mockApi<T>(path, init);
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeader()),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
