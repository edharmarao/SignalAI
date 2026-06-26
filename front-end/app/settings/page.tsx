"use client";
import { useEffect, useState } from "react";
import { Button, Card, Badge } from "@signalai/ui";
import { api } from "@/lib/api";

export default function SettingsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);

  async function load() {
    try {
      setAccounts(await api("/broker/accounts"));
    } catch {
      setAccounts([]);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function connect() {
    const { url } = await api<{ url: string }>("/broker/upstox/login-url");
    window.location.href = url;
  }
  async function disconnect() {
    await api("/broker/disconnect", { method: "POST" });
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card title="Broker connection">
        <p className="text-sm text-slate-400 mb-3">
          Connect your Upstox account to fetch live data and (optionally) place
          live orders. Live trading requires{" "}
          <code className="text-amber-400">ALLOW_LIVE_TRADING=true</code> on the
          server and explicit per-order confirmation.
        </p>
        {accounts.length === 0 ? (
          <Button onClick={connect}>Connect Upstox</Button>
        ) : (
          <div className="space-y-2">
            {accounts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between border border-slate-800 rounded-md p-3"
              >
                <div>
                  <div className="font-medium">{a.broker.toUpperCase()}</div>
                  <div className="text-xs text-slate-500">{a.client_id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={a.is_active ? "success" : "neutral"}>
                    {a.is_active ? "ACTIVE" : "INACTIVE"}
                  </Badge>
                  <Button variant="ghost" onClick={disconnect}>
                    Disconnect
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Risk defaults">
        <p className="text-sm text-slate-400">
          Configure your global guard rails. These apply on top of per-strategy
          risk controls.
        </p>
      </Card>
    </div>
  );
}
