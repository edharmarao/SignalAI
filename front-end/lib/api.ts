import { auth } from "./auth";
import { mockApi } from "./mock";

// Use relative path so the browser always calls the same host it loaded from.
// Next.js rewrites proxy /api/v1/* → FastAPI internally.
// NEXT_PUBLIC_API_URL is kept as a fallback for direct API access (e.g. dev without Next.js).
const BASE =
  (typeof window !== "undefined"
    ? ""  // browser: relative path, handled by Next.js rewrite
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8003")  // SSR: direct internal call
  ) + "/api/v1";

const USE_MOCK =
  (process.env.NEXT_PUBLIC_USE_MOCK ?? "false").toLowerCase() === "true";

const REQUEST_TIMEOUT_MS = 30_000;
const LONG_REQUEST_TIMEOUT_MS = 600_000; // 10 min for bulk import
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function authHeader(): Record<string, string> {
  const h = auth.getHeader();
  return h ? { Authorization: `Basic ${h}` } : {};
}

function isRetryable(method: string, status: number): boolean {
  const safeMethod = ["GET", "HEAD"].includes(method.toUpperCase());
  const serverError = status >= 500 && status < 600;
  return safeMethod && serverError;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Redirect to /login on 401 — clears stale session first. */
function handleUnauthorized(pathname: string): void {
  auth.clearSession();
  if (typeof window !== "undefined") {
    window.location.href = `/login?next=${encodeURIComponent(pathname)}`;
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  if (USE_MOCK) return mockApi<T>(path, init);

  const method = (init.method ?? "GET").toUpperCase();
  const timeoutMs = init.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const externalSignal = init.signal;   // caller's AbortController (e.g. component unmount)
  let lastError: Error = new Error("Request failed");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Bail immediately if the caller already aborted before we start a retry
    if (externalSignal?.aborted) throw new DOMException("Aborted", "AbortError");

    if (attempt > 0) {
      const backoff = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      await sleep(backoff);
    }

    // Combine timeout controller with caller's external signal
    const timeoutCtrl = new AbortController();
    const timeoutId   = setTimeout(() => timeoutCtrl.abort(), timeoutMs);

    // Use AbortSignal.any() when available (Node 20+, modern browsers),
    // otherwise fall back to listening on the external signal manually.
    let signal: AbortSignal;
    if (externalSignal && typeof AbortSignal.any === "function") {
      signal = AbortSignal.any([timeoutCtrl.signal, externalSignal]);
    } else if (externalSignal) {
      // Manual combination: forward external abort to our timeout controller
      externalSignal.addEventListener("abort", () => timeoutCtrl.abort(), { once: true });
      signal = timeoutCtrl.signal;
    } else {
      signal = timeoutCtrl.signal;
    }

    try {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        signal,
        headers: {
          "Content-Type": "application/json",
          ...authHeader(),
          ...(init.headers ?? {}),
        },
        cache: "no-store",
      });
      clearTimeout(timeoutId);

      const requestId = res.headers.get("X-Request-ID") ?? undefined;

      if (!res.ok) {
        if (res.status === 401) {
          handleUnauthorized(typeof window !== "undefined" ? window.location.pathname : "/");
          // Return a never-resolving promise so the component doesn't continue rendering
          return new Promise<T>(() => {});
        }
        let message = `${res.status} ${res.statusText}`;
        try {
          const body = await res.json();
          message = body.error ?? body.detail ?? message;
        } catch {
          // Non-JSON error body
        }
        const err = new ApiError(res.status, message, requestId);
        if (!isRetryable(method, res.status)) throw err;
        lastError = err;
        continue;
      }

      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof ApiError) {
        lastError = err;
        if (!isRetryable(method, err.status)) throw err;
        continue;
      }
      // Re-throw AbortError as-is so callers can distinguish unmount-abort from timeout
      if (err instanceof DOMException && err.name === "AbortError") {
        // If the external caller aborted, rethrow AbortError (not a timeout)
        if (externalSignal?.aborted) throw err;
        throw new ApiError(408, "Request timed out after 30 seconds");
      }
      throw err;
    }
  }

  throw lastError;
}

// ============================================================================
// Strategies API
// ============================================================================
export const strategiesApi = {
  list: () => api<any>("/strategies"),
  get: (id: string) => api<any>(`/strategies/${id}`),
  create: (strategy: any) => api<any>("/strategies", { method: "POST", body: JSON.stringify(strategy) }),
  update: (id: string, strategy: any) => api<any>(`/strategies/${id}`, { method: "PATCH", body: JSON.stringify(strategy) }),
  delete: (id: string) => api<any>(`/strategies/${id}`, { method: "DELETE" }),
  duplicate: (id: string) => api<any>(`/strategies/${id}/duplicate`, { method: "POST" }),
};

// ============================================================================
// Backtest API
// ============================================================================
export const backtestApi = {
  run: (params: any) => api<any>("/backtest", { method: "POST", body: JSON.stringify(params) }),
};

// ============================================================================
// Orders API
// ============================================================================
export const ordersApi = {
  list: (desk?: string) => api<any>(`/orders${desk ? `?desk=${desk}` : ""}`),
  place: (order: any) => api<any>("/orders/place", { method: "POST", body: JSON.stringify(order) }),
};

// ============================================================================
// Trades API
// ============================================================================
export const tradesApi = {
  list: () => api<any>("/trades"),
};

// ============================================================================
// Charts API
// ============================================================================
export const chartsApi = {
  symbols: () => api<any>("/charts/symbols"),
  candles: (params: { symbol: string; timeframe: string; from?: string; to?: string }) => {
    const query = new URLSearchParams(params as any);
    return api<any>(`/charts/candles?${query}`);
  },
  summary: (symbol: string) => api<any>(`/charts/summary?symbol=${symbol}`),
  indicatorBacktest: (params: any) => api<any>("/charts/indicator-backtest", { method: "POST", body: JSON.stringify(params) }),
};

// ============================================================================
// Instruments API
// ============================================================================
export const instrumentsApi = {
  listIndex: () => api<any>("/instruments?type=index"),
  listEquity: () => api<any>("/instruments?type=equity"),
  lookup: (isin: string) => api<any>(`/instruments/lookup?isin=${isin}`),
};

// ============================================================================
// Prices API
// ============================================================================
export const pricesApi = {
  ltp: (symbol: string) => api<any>(`/prices/ltp/${symbol}`),
};

// ============================================================================
// Broker API
// ============================================================================
export const brokerApi = {
  upstoxLoginUrl: () => api<any>("/broker/upstox/login-url"),
  upstoxConnect: (code: string) => api<any>("/broker/upstox/connect", { method: "POST", body: JSON.stringify({ code }) }),
  accounts: () => api<any>("/broker/accounts"),
  disconnect: () => api<any>("/broker/disconnect", { method: "POST" }),
};

// ============================================================================
// ORB Strategy API
// ============================================================================
export const orbApi = {
  chartData: (params: any) => {
    const query = new URLSearchParams(params);
    return api<any>(`/orb/chart-data?${query}`);
  },
  signal: (params: any) => {
    const query = new URLSearchParams(params);
    return api<any>(`/orb/signal?${query}`);
  },
  backtest: (params: any) => api<any>("/orb/backtest", { method: "POST", body: JSON.stringify(params) }),
};

// ============================================================================
// Fundamentals API
// ============================================================================
export const fundamentalsApi = {
  list: () => api<any>("/fundamentals/"),
  get: (symbol: string, quarterlyLimit = 4, yearlyLimit = 3) =>
    api<any>(`/fundamentals/${symbol}?quarterly_limit=${quarterlyLimit}&yearly_limit=${yearlyLimit}`),
  fetch: (symbols: string[], exchange = "NSE") =>
    api<any>("/fundamentals/fetch", { method: "POST", body: JSON.stringify({ symbols, exchange }) }),
  delete: (symbol: string) => api<any>(`/fundamentals/${symbol}`, { method: "DELETE" }),
};

// ============================================================================
// Symbols API
// ============================================================================
export const symbolsApi = {
  list: (params?: {
    cap_type?: "LARGE" | "MID" | "SMALL" | "MICRO";
    is_nifty_50?: boolean;
    is_nifty_500?: boolean;
    is_fo_enabled?: boolean;
    min_market_cap?: number;
    max_market_cap?: number;
    industry?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, String(value));
        }
      });
    }
    return api<any>(`/symbols?${query.toString()}`);
  },
  get: (symbol: string) => api<any>(`/symbols/${symbol}`),
  capDistribution: () => api<any>("/symbols/stats/cap-distribution"),
  indexCoverage: () => api<any>("/symbols/stats/index-coverage"),
  industries: () => api<any>("/symbols/industry/list"),
  compare: (symbols: string[]) => api<any>(`/symbols/compare?symbols=${symbols.join(",")}`),
};

// ============================================================================
// Data Sync API
// ============================================================================
export const dataSyncApi = {
  updateFundamentals: (params: {
    symbols: string[];
    exchange?: string;
    from_year?: number;
    to_year?: number;
    single_year?: number;
  }) => api<any>("/data-sync/fundamentals", { method: "POST", body: JSON.stringify({ exchange: "NSE", ...params }) }),

  updateSymbols: (symbols: string[], exchange = "NSE") =>
    api<any>("/data-sync/symbols", { method: "POST", body: JSON.stringify({ symbols, exchange }) }),

  fullUpdate: (params: {
    symbols: string[];
    exchange?: string;
    from_year?: number;
    to_year?: number;
    single_year?: number;
  }) => api<any>("/data-sync/full", { method: "POST", body: JSON.stringify({ exchange: "NSE", ...params }) }),

  fundamentalsStatus: () => api<any>("/data-sync/status/fundamentals"),
  symbolsStatus: () => api<any>("/data-sync/status/symbols"),
};

// ============================================================================
// System API
// ============================================================================
export const systemApi = {
  health: () => api<any>("/health"),
  root: () => api<any>("/"),
};
