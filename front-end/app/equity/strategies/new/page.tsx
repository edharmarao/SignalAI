"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import EquityStrategyBuilder from "@/components/equity/EquityStrategyBuilder";
import ORBStrategyBuilder from "@/components/equity/ORBStrategyBuilder";
import SwingStrategyBuilder from "@/components/equity/SwingStrategyBuilder";
import StrategyTypePicker from "@/components/equity/StrategyTypePicker";

function NewStrategyContent() {
  const params = useSearchParams();
  const type = params.get("type");

  // Combined types currently reuse the technical builder with pre-seeded conditions
  if (type === "technical" || type === "orb_rsi" || type === "swing_ema") {
    return <EquityStrategyBuilder />;
  }
  if (type === "orb") return <ORBStrategyBuilder />;
  if (type === "swing") return <SwingStrategyBuilder />;

  // No type selected — show picker
  return (
    <div className="p-6">
      <StrategyTypePicker />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <NewStrategyContent />
    </Suspense>
  );
}
