import StrategyBuilder from "@/components/StrategyBuilder";

export default function NewStrategyPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create Strategy</h1>
        <p className="text-slate-400 text-sm">
          Step-by-step builder with live JSON preview. Saved strategies run in
          paper mode by default.
        </p>
      </div>
      <StrategyBuilder />
    </div>
  );
}
