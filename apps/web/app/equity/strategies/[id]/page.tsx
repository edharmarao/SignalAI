"use client";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import EquityStrategyDetail from "@/components/equity/EquityStrategyDetail";
import EquityStrategyBuilder from "@/components/equity/EquityStrategyBuilder";

function StrategyPage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  if (sp.get("edit") === "1") return <EquityStrategyBuilder editId={id} />;
  return <EquityStrategyDetail id={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="text-slate-400 p-8">Loading…</div>}>
      <StrategyPage />
    </Suspense>
  );
}
