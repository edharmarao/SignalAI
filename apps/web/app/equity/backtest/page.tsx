"use client";
import { Suspense } from "react";
import EquityBacktestPage from "@/components/equity/EquityBacktestPage";
export default function Page() {
  return (
    <Suspense fallback={<div className="text-slate-400 p-8">Loading…</div>}>
      <EquityBacktestPage />
    </Suspense>
  );
}
