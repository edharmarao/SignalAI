"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@signalai/ui";
import { auth } from "@/lib/auth";

const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8003") + "/api/v1";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? "Invalid credentials");
      }
      auth.setSession(username, password);
      router.push("/");
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
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
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
