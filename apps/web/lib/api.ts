import { auth } from "./auth";
import { mockApi } from "./mock";

const BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8003") + "/api/v1";

const USE_MOCK =
  (process.env.NEXT_PUBLIC_USE_MOCK ?? "false").toLowerCase() === "true";

const REQUEST_TIMEOUT_MS = 30_000;
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
  init: RequestInit = {},
): Promise<T> {
  if (USE_MOCK) return mockApi<T>(path, init);

  const method = (init.method ?? "GET").toUpperCase();
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
    const timeoutId   = setTimeout(() => timeoutCtrl.abort(), REQUEST_TIMEOUT_MS);

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
