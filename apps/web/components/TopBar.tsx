"use client";
import { useEffect } from "react";
import { Badge, Button } from "@signalai/ui";
import { useKillSwitch } from "@/store/kill-switch";
import { useAuth } from "@/store/auth";
import Link from "next/link";

export default function TopBar() {
  const killed = useKillSwitch((s) => s.killed);
  const setKilled = useKillSwitch((s) => s.setKilled);
  const { user, init, signOut } = useAuth();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="border-b border-slate-800 bg-slate-950/60 px-6 py-3 flex items-center gap-3 sticky top-0 z-10 backdrop-blur">
      <Badge tone="info">PAPER MODE (default)</Badge>
      {(process.env.NEXT_PUBLIC_USE_MOCK ?? "true").toLowerCase() !== "false" && (
        <Badge tone="warn">DEMO DATA</Badge>
      )}
      {killed && <Badge tone="danger">EMERGENCY STOP ENGAGED</Badge>}
      <div className="ml-auto flex items-center gap-3">
        <Button
          variant={killed ? "secondary" : "danger"}
          onClick={() => setKilled(!killed)}
          title="Disable all strategies and square off everything"
        >
          {killed ? "Resume" : "Emergency Square-Off"}
        </Button>
        {user ? (
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <span className="hidden sm:inline">{user.email}</span>
            <Button variant="ghost" onClick={signOut}>
              Sign out
            </Button>
          </div>
        ) : (
          <Link href="/login">
            <Button variant="secondary">Sign in</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
