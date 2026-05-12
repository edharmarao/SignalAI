"use client";
import Link from "next/link";

const DESKS = [
  {
    id: "equity",
    href: "/equity",
    emoji: "📊",
    label: "Equity",
    tagline: "Trade index futures & equity strategies",
    description: "Build RSI, EMA, and MACD strategies on NIFTY, BANKNIFTY, FINNIFTY. Intraday and positional timeframes with paper trading.",
    features: ["5min · 15min · 1H · EOD candles", "RSI, EMA, MACD, Supertrend indicators", "Paper P&L tracking & backtesting"],
    gradient: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/30 hover:border-emerald-400/60",
    cta: "bg-emerald-500 hover:bg-emerald-400 text-slate-950",
  },
  {
    id: "mutual-funds",
    href: "/mutual-funds",
    emoji: "💰",
    label: "Mutual Funds",
    tagline: "Track your SIPs and portfolio",
    description: "Monitor all your mutual fund holdings — NAV, XIRR, absolute returns and SIP schedule across Large Cap, Mid Cap, ELSS and more.",
    features: ["Holdings · NAV · XIRR tracking", "SIP schedule & monthly outflow", "Category-wise allocation breakdown"],
    gradient: "from-sky-500/20 to-sky-600/5 border-sky-500/30 hover:border-sky-400/60",
    cta: "bg-sky-500 hover:bg-sky-400 text-slate-950",
  },
  {
    id: "options",
    href: "/options",
    emoji: "🎯",
    label: "Options",
    tagline: "CE / PE directional strategies",
    description: "Trade NIFTY and BANKNIFTY options with weekly/monthly expiry. Strike selection, indicator-based entry/exit, and stop-loss controls.",
    features: ["CE / PE · ATM ± strikes · expiry", "1min · 5min · 15min candles", "Weekly & monthly expiry management"],
    gradient: "from-violet-500/20 to-violet-600/5 border-violet-500/30 hover:border-violet-400/60",
    cta: "bg-violet-500 hover:bg-violet-400 text-slate-950",
  },
] as const;

export default function HomePage() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center gap-8 py-12">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Signal AI</h1>
        <p className="text-slate-400 text-base max-w-lg mx-auto">
          One platform for equity trading strategies, mutual fund portfolio tracking, and options plays on Indian markets.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-5xl">
        {DESKS.map((d) => (
          <div
            key={d.id}
            className={`rounded-xl border bg-gradient-to-b ${d.gradient} p-6 flex flex-col gap-4 transition-all`}
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl mt-0.5">{d.emoji}</span>
              <div>
                <div className="font-bold text-lg text-slate-100">{d.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{d.tagline}</div>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">{d.description}</p>

            <ul className="space-y-1.5">
              {d.features.map((f) => (
                <li key={f} className="text-xs text-slate-400 flex items-start gap-2">
                  <span className="text-slate-600 mt-0.5">›</span>
                  {f}
                </li>
              ))}
            </ul>

            <Link
              href={d.href}
              className={`mt-auto w-full text-center px-4 py-2.5 rounded-md text-sm font-semibold transition ${d.cta}`}
            >
              Open {d.label} →
            </Link>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-600 text-center max-w-sm">
        For educational purposes only. All strategies run in paper mode by default.
      </p>
    </div>
  );
}
