function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatCr(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0);
}

export default function FinancialsChart({ quarterly, yearly }: { quarterly: any[]; yearly: any[] }) {
  const rows = (yearly.length > 0 ? yearly : quarterly).slice().reverse().slice(-6);
  const maxValue = Math.max(...rows.map((row) => number(row.total_revenue)), 1);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Business trend</div>
          <h2 className="text-lg font-semibold text-slate-100 mt-1">Revenue and profitability</h2>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-sky-400" />Revenue</span>
          <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-emerald-400" />Net profit</span>
        </div>
      </div>
      {rows.length > 0 ? (
        <div className="space-y-3">
          <div className="h-48 flex items-end gap-3 border-b border-slate-800 px-2">
            {rows.map((row, index) => {
              const revenue = number(row.total_revenue);
              const profit = number(row.net_income);
              return (
                <div key={index} className="flex-1 h-full min-w-0 flex items-end justify-center gap-1 group">
                  <div className="w-1/2 bg-sky-400/70 rounded-t-sm transition-colors group-hover:bg-sky-300" style={{ height: `${Math.max(3, revenue / maxValue * 100)}%` }} title={`Revenue ${formatCr(revenue)} Cr`} />
                  <div className="w-1/2 bg-emerald-400/70 rounded-t-sm transition-colors group-hover:bg-emerald-300" style={{ height: `${Math.max(3, Math.max(0, profit) / maxValue * 100)}%` }} title={`Profit ${formatCr(profit)} Cr`} />
                </div>
              );
            })}
          </div>
          <div className="flex gap-3 px-2">
            {rows.map((row, index) => (
              <div key={index} className="flex-1 text-center text-[10px] text-slate-500 truncate">
                {new Date(row.fiscal_year_end ?? row.quarter_end_date).toLocaleDateString("en-IN", { year: "numeric", month: "short" })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="h-48 flex items-center justify-center text-sm text-slate-500">Financial history is not available yet.</div>
      )}
    </div>
  );
}
