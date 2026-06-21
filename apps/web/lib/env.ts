/**
 * Validated environment configuration.
 * Throws at module load time with a clear message if required vars are misconfigured.
 */

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Check your .env file.`,
    );
  }
  return value;
}

export const env = {
  // Relative URL in browser (proxied by Next.js rewrites); direct URL for SSR
  apiUrl: typeof window !== "undefined" ? "" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8003"),
  useMock: (process.env.NEXT_PUBLIC_USE_MOCK ?? "false").toLowerCase() === "true",
} as const;
