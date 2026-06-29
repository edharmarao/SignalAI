export default function RatiosCard({ info }: { info: any }) {
  if (!info) return null;

  const ratios = [
    { label: "Profit Margin", value: info.profit_margins, format: "percent" },
    { label: "ROA", value: info.return_on_assets, format: "percent" },
    { label: "ROE", value: info.return_on_equity, format: "percent" },
    { label: "Debt to Equity", value: info.debt_to_equity, format: "number" },
    { label: "Current Ratio", value: info.current_ratio, format: "number" },
    { label: "Revenue Growth", value: info.revenue_growth, format: "percent" },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-slate-100 mb-4">Key Ratios</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {ratios.map((ratio) => {
          if (ratio.value == null) return null;
          const displayValue = ratio.format === "percent"
            ? `${(ratio.value * 100).toFixed(2)}%`
            : ratio.value.toFixed(2);

          return (
            <div key={ratio.label} className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs text-slate-500">{ratio.label}</div>
              <div className="text-lg font-semibold text-slate-200 mt-1">{displayValue}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
