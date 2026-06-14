"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import EquityStrategyDetail from "@/components/equity/EquityStrategyDetail";
import EquityStrategyBuilder from "@/components/equity/EquityStrategyBuilder";
import ORBStrategyBuilder from "@/components/equity/ORBStrategyBuilder";
import SwingStrategyBuilder from "@/components/equity/SwingStrategyBuilder";

function StrategyPage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const isEdit = sp.get("edit") === "1";

  const [strategyType, setStrategyType] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    api<{ strategy_json: any }>(`/strategies/${id}`)
      .then(row => {
        const sj = row.strategy_json as any;
        const pat = sj?.priceActionType ?? sj?.strategy_type;
        setStrategyType(pat ?? "technical");
      })
      .catch(() => setStrategyType("technical"))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  if (!isEdit) return <EquityStrategyDetail id={id} />;
  if (loading) return <div className="text-slate-400 p-8">Loading strategy…</div>;

  if (strategyType === "orb")   return <ORBStrategyBuilder editId={id} />;
  if (strategyType === "swing") return <SwingStrategyBuilder editId={id} />;
  return <EquityStrategyBuilder editId={id} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="text-slate-400 p-8">Loading…</div>}>
      <StrategyPage />
    </Suspense>
  );
}
