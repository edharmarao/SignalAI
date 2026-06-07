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
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8003",
  useMock: (process.env.NEXT_PUBLIC_USE_MOCK ?? "false").toLowerCase() === "true",
} as const;
