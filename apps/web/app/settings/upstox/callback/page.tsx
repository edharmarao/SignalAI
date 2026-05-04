"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card } from "@signalai/ui";
import { api } from "@/lib/api";

function CallbackInner() {
  const search = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState("Connecting…");

  useEffect(() => {
    const code = search.get("code");
    if (!code) {
      setStatus("Missing code.");
      return;
    }
    api("/broker/upstox/connect", {
      method: "POST",
      body: JSON.stringify({ code }),
    })
      .then(() => {
        setStatus("Connected. Redirecting…");
        setTimeout(() => router.push("/settings"), 800);
      })
      .catch((e) => setStatus(`Failed: ${e.message}`));
  }, [search, router]);

  return (
    <div className="max-w-md mx-auto mt-16">
      <Card title="Upstox connect">
        <p className="text-sm text-slate-300">{status}</p>
      </Card>
    </div>
  );
}

export default function UpstoxCallback() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md mx-auto mt-16">
          <Card>Loading…</Card>
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
