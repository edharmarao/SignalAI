export default function CompanyOverview({ info }: { info: any }) {
  if (!info) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{info.symbol}</h1>
          <p className="text-slate-400 text-sm mt-1">{info.company_name}</p>
          <div className="flex gap-3 mt-2 text-xs">
            <span className="px-2 py-1 bg-slate-800 text-slate-300 rounded">{info.sector}</span>
            <span className="px-2 py-1 bg-slate-800 text-slate-300 rounded">{info.industry}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500">Market Cap</div>
          <div className="text-xl font-bold text-emerald-400">
            ₹{info.market_cap?.toLocaleString()}Cr
          </div>
          {info.market_cap_usd && (
            <div className="text-sm text-slate-500">${info.market_cap_usd?.toLocaleString()}M</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        {info.trailing_pe && (
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-500">P/E Ratio</div>
            <div className="text-lg font-semibold text-slate-200">{info.trailing_pe.toFixed(2)}</div>
          </div>
        )}
        {info.price_to_book && (
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-500">P/B Ratio</div>
            <div className="text-lg font-semibold text-slate-200">{info.price_to_book.toFixed(2)}</div>
          </div>
        )}
        {info.dividend_yield && (
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-500">Dividend Yield</div>
            <div className="text-lg font-semibold text-slate-200">{(info.dividend_yield * 100).toFixed(2)}%</div>
          </div>
        )}
        {info.return_on_equity && (
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-500">ROE</div>
            <div className="text-lg font-semibold text-slate-200">{(info.return_on_equity * 100).toFixed(2)}%</div>
          </div>
        )}
      </div>

      {(info.fifty_two_week_high || info.fifty_two_week_low) && (
        <div className="mt-4 p-3 bg-slate-800/30 rounded-lg">
          <div className="text-xs text-slate-500 mb-2">52 Week Range</div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-red-400">Low: ₹{info.fifty_two_week_low}</span>
            <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-red-500 to-emerald-500 w-1/2"></div>
            </div>
            <span className="text-emerald-400">High: ₹{info.fifty_two_week_high}</span>
          </div>
        </div>
      )}
    </div>
  );
}
