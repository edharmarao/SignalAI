"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Input } from "@signalai/ui";
import { auth } from "@/lib/auth";
import { useAuth } from "@/store/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/";
  const { signIn } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already logged in — skip straight to destination
  useEffect(() => {
    if (auth.isLoggedIn()) router.replace(nextPath);
  }, [nextPath, router]);

  async function login() {
    setError(null);
    setLoading(true);
    try {
      // Use relative path - goes through Next.js rewrite to backend
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? "Invalid credentials");
      }
      signIn(username, password);
      router.replace(nextPath);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-24">
      <Card title="Signal AI">
        <div className="space-y-3">
          <Input
            placeholder="Username"
            value={username}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && login()}
            autoComplete="current-password"
          />
          <Button onClick={login} disabled={!username || !password || loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </div>
        {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
