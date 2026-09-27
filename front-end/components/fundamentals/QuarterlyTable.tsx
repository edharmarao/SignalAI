function formatNumber(value: unknown, digits = 0): string {
  if (value == null || value === "") return "—";
  const numericValue = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(numericValue) ? numericValue.toLocaleString("en-IN", { maximumFractionDigits: digits }) : "—";
}

export default function QuarterlyTable({ data }: { data: any[] }) {
  if (!data || data.length === 0) return null;

  const rows = [
    ["Sales", "total_revenue"],
    ["Operating Profit", "operating_income"],
    ["EBITDA", "ebitda"],
    ["Net Profit", "net_income"],
    ["EPS in Rs", "eps_diluted", 2],
    ["Total Assets", "total_assets"],
    ["Operating Cash Flow", "operating_cashflow"],
    ["Free Cash Flow", "free_cashflow"],
  ] as const;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div><h2 className="text-xl font-semibold text-slate-100">Quarterly Results</h2><p className="mt-1 text-sm text-slate-500">Consolidated figures in Rs. Crores</p></div>
        <span className="rounded-md border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">Latest {data.length} quarters</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[860px] w-full text-sm">
          <thead><tr className="border-b border-slate-800 bg-slate-950"><th className="sticky left-0 bg-slate-950 px-4 py-3 text-left font-semibold text-slate-400">Particulars</th>{data.map((quarter, idx) => <th key={idx} className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-400">{new Date(quarter.quarter_end_date).toLocaleDateString("en-IN", { year: "numeric", month: "short" })}</th>)}</tr></thead>
          <tbody>
            {rows.map(([label, key, digits = 0], rowIndex) => <tr key={key} className={`border-b border-slate-800/70 ${rowIndex === 1 || rowIndex === 3 ? "font-semibold" : ""}`}><td className="sticky left-0 bg-slate-900 px-4 py-2.5 text-left text-slate-300">{label}</td>{data.map((quarter, idx) => <td key={idx} className="px-4 py-2.5 text-right tabular-nums text-slate-200">{formatNumber(quarter[key], digits)}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
