"use client";
import { useState } from "react";
import { Button, Card, Input } from "@signalai/ui";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="max-w-md mx-auto mt-16">
      <Card title="Sign in to Signal AI">
        <p className="text-sm text-slate-400 mb-4">
          Magic-link login via Supabase. We never store your password.
        </p>
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="mt-3 flex gap-2">
          <Button onClick={send} disabled={!email}>
            Send magic link
          </Button>
        </div>
        {sent && (
          <p className="text-sm text-emerald-400 mt-3">
            Check your inbox for the sign-in link.
          </p>
        )}
        {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}
      </Card>
    </div>
  );
}
