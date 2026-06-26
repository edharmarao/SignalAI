import DeskStrategyBuilder from "@/components/desk/DeskStrategyBuilder";
export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Options Strategy</h1>
        <p className="text-slate-400 text-sm">Step-by-step builder with live JSON preview.</p>
      </div>
      <DeskStrategyBuilder desk="options" />
    </div>
  );
}
