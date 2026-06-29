export default function QuarterlyTable({ data }: { data: any[] }) {
  if (!data || data.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-slate-100 mb-4">Quarterly Financials</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left py-2 px-3 text-slate-400 font-medium">Quarter</th>
              <th className="text-right py-2 px-3 text-slate-400 font-medium">Revenue (Cr)</th>
              <th className="text-right py-2 px-3 text-slate-400 font-medium">Profit (Cr)</th>
              <th className="text-right py-2 px-3 text-slate-400 font-medium">EBITDA (Cr)</th>
              <th className="text-right py-2 px-3 text-slate-400 font-medium">EPS</th>
            </tr>
          </thead>
          <tbody>
            {data.map((quarter, idx) => (
              <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="py-2 px-3 text-slate-300">
                  {new Date(quarter.quarter_end_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                </td>
                <td className="text-right py-2 px-3 text-slate-200 tabular-nums">
                  {quarter.total_revenue?.toLocaleString() || '—'}
                </td>
                <td className="text-right py-2 px-3 text-slate-200 tabular-nums">
                  {quarter.net_income?.toLocaleString() || '—'}
                </td>
                <td className="text-right py-2 px-3 text-slate-200 tabular-nums">
                  {quarter.ebitda?.toLocaleString() || '—'}
                </td>
                <td className="text-right py-2 px-3 text-slate-200 tabular-nums">
                  {quarter.eps_diluted?.toFixed(2) || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
