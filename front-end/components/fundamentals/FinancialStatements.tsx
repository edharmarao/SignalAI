function formatNumber(value: unknown, digits = 0): string {
  if (value == null || value === "") return "—";
  const numericValue = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(numericValue) ? numericValue.toLocaleString("en-IN", { maximumFractionDigits: digits }) : "—";
}

function periodLabel(row: any, dateKey: string): string {
  const date = new Date(row[dateKey]);
  return dateKey === "quarter_end_date"
    ? date.toLocaleDateString("en-IN", { year: "numeric", month: "short" })
    : String(date.getFullYear());
}

const balanceRows = [
  ["Total Assets", "total_assets"],
  ["Total Liabilities", "total_liabilities"],
  ["Reserves / Equity", "stockholders_equity"],
  ["Borrowings", "total_debt"],
  ["Cash & Equivalents", "cash_and_equivalents"],
] as const;

const cashRows = [
  ["Cash from Operating Activity", "operating_cashflow"],
  ["Cash from Investing Activity", "investing_cashflow"],
  ["Cash from Financing Activity", "financing_cashflow"],
  ["Free Cash Flow", "free_cashflow"],
  ["Capital Expenditure", "capital_expenditure"],
] as const;

const ratioRows = [
  ["Debt to Equity", "debt_to_equity"],
  ["Current Ratio", "current_ratio"],
  ["Return on Equity", "return_on_equity"],
  ["Return on Assets", "return_on_assets"],
  ["Profit Margin", "profit_margins"],
  ["Revenue Growth", "revenue_growth"],
] as const;

function StatementTable({ title, subtitle, data, dateKey, rows, percentKeys = [] }: { title: string; subtitle: string; data: any[]; dateKey: string; rows: readonly (readonly [string, string])[]; percentKeys?: string[] }) {
  if (!data.length) return null;
  return <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"><div className="border-b border-slate-800 px-5 py-4"><h2 className="text-xl font-semibold text-slate-100">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-sm"><thead><tr className="border-b border-slate-800 bg-slate-950"><th className="sticky left-0 bg-slate-950 px-4 py-3 text-left font-semibold text-slate-400">Particulars</th>{data.map((row, index) => <th key={index} className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-400">{periodLabel(row, dateKey)}</th>)}</tr></thead><tbody>{rows.map(([label, key], rowIndex) => <tr key={key} className={`border-b border-slate-800/70 ${rowIndex === 0 ? "font-semibold" : ""}`}><td className="sticky left-0 bg-slate-900 px-4 py-2.5 text-slate-300">{label}</td>{data.map((row, index) => <td key={index} className="px-4 py-2.5 text-right tabular-nums text-slate-200">{percentKeys.includes(key) ? `${formatNumber(Number(row[key]) * 100, 1)}%` : formatNumber(row[key])}</td>)}</tr>)}</tbody></table></div></section>;
}

export default function FinancialStatements({ yearly }: { yearly: any[] }) {
  if (!yearly.length) return null;
  return <div className="space-y-5"><StatementTable title="Balance Sheet" subtitle="Consolidated figures in Rs. Crores" data={yearly} dateKey="fiscal_year_end" rows={balanceRows} /><StatementTable title="Cash Flows" subtitle="Consolidated figures in Rs. Crores" data={yearly} dateKey="fiscal_year_end" rows={cashRows} /><StatementTable title="Ratios" subtitle="Calculated from stored fundamentals" data={yearly} dateKey="fiscal_year_end" rows={ratioRows} percentKeys={["return_on_equity", "return_on_assets", "profit_margins", "revenue_growth"]} /></div>;
}
