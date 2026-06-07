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

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (USE_MOCK) return mockApi<T>(path, init);

  const method = (init.method ?? "GET").toUpperCase();
  let lastError: Error = new Error("Request failed");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      await sleep(backoff);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        signal: controller.signal,
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
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ApiError(408, "Request timed out after 30 seconds");
      }
      throw err;
    }
  }

  throw lastError;
}
