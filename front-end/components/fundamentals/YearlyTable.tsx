export default function YearlyTable({ data }: { data: any[] }) {
  if (!data || data.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-slate-100 mb-4">Annual Financials</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left py-2 px-3 text-slate-400 font-medium">Year</th>
              <th className="text-right py-2 px-3 text-slate-400 font-medium">Revenue (Cr)</th>
              <th className="text-right py-2 px-3 text-slate-400 font-medium">Profit (Cr)</th>
              <th className="text-right py-2 px-3 text-slate-400 font-medium">EBITDA (Cr)</th>
              <th className="text-right py-2 px-3 text-slate-400 font-medium">EPS</th>
              <th className="text-right py-2 px-3 text-slate-400 font-medium">Total Assets (Cr)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((year, idx) => (
              <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="py-2 px-3 text-slate-300">
                  {new Date(year.fiscal_year_end).getFullYear()}
                </td>
                <td className="text-right py-2 px-3 text-slate-200 tabular-nums">
                  {year.total_revenue?.toLocaleString() || '—'}
                </td>
                <td className="text-right py-2 px-3 text-slate-200 tabular-nums">
                  {year.net_income?.toLocaleString() || '—'}
                </td>
                <td className="text-right py-2 px-3 text-slate-200 tabular-nums">
                  {year.ebitda?.toLocaleString() || '—'}
                </td>
                <td className="text-right py-2 px-3 text-slate-200 tabular-nums">
                  {year.eps_diluted?.toFixed(2) || '—'}
                </td>
                <td className="text-right py-2 px-3 text-slate-200 tabular-nums">
                  {year.total_assets?.toLocaleString() || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
