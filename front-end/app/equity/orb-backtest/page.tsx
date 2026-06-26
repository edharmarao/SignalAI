"use client";
import { Suspense } from "react";
import ORBBacktestDashboard from "@/components/equity/ORBBacktestDashboard";

export default function Page() {
  return (
    <Suspense fallback={<div className="text-slate-400 p-8">Loading…</div>}>
      <ORBBacktestDashboard />
    </Suspense>
  );
}
