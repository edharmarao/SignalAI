"use client";
/**
 * StrategyTypePicker — shown before the builder to let users pick:
 *   Technical | Price Action | Combined
 * and then the specific sub-type within each category.
 */
import { useRouter } from "next/navigation";

interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  badge: string;
  badgeColor: string;
  path: string;
  tags: string[];
}

const STRATEGIES: Record<string, StrategyTemplate[]> = {
  technical: [
    {
      id: "indicator",
      name: "Indicator Strategy",
      description: "Build entry/exit rules using SMA, EMA, RSI, MACD, VWAP, Bollinger Bands, Supertrend and more.",
      badge: "Technical",
      badgeColor: "blue",
      path: "/equity/strategies/new?type=technical",
      tags: ["SMA","EMA","RSI","MACD","VWAP","Bollinger","Supertrend"],
    },
  ],
  price_action: [
    {
      id: "orb",
      name: "Opening Range Breakout (ORB)",
      description: "Entry when price breaks the first candle's high/low with 2× volume confirmation. 1:1 R:R with trailing stop.",
      badge: "Price Action",
      badgeColor: "amber",
      path: "/equity/strategies/new?type=orb",
      tags: ["ORB","Volume Filter","1:1 R:R","Trailing SL","Intraday"],
    },
    {
      id: "swing",
      name: "Swing High / Low",
      description: "Detect swing highs and lows with a configurable lookback. Enter on breakout above swing high or below swing low.",
      badge: "Price Action",
      badgeColor: "amber",
      path: "/equity/strategies/new?type=swing",
      tags: ["Swing High","Swing Low","Breakout","Multi-timeframe"],
    },
  ],
  combined: [
    {
      id: "orb_rsi",
      name: "ORB + RSI Confirmation",
      description: "ORB breakout with RSI > 60 (long) or RSI < 40 (short) as additional confirmation filter.",
      badge: "Combined",
      badgeColor: "purple",
      path: "/equity/strategies/new?type=orb_rsi",
      tags: ["ORB","RSI","Combined","Confirmation"],
    },
    {
      id: "swing_ema",
      name: "Swing + EMA Trend Filter",
      description: "Swing breakout entries only when price is above (long) or below (short) a configurable EMA.",
      badge: "Combined",
      badgeColor: "purple",
      path: "/equity/strategies/new?type=swing_ema",
      tags: ["Swing","EMA","Trend Filter","Combined"],
    },
  ],
};

const TABS = [
  { id: "technical",    label: "Technical",    icon: "📊", color: "blue" },
  { id: "price_action", label: "Price Action", icon: "🕯️", color: "amber" },
  { id: "combined",     label: "Combined",     icon: "⚡", color: "purple" },
] as const;

type TabId = typeof TABS[number]["id"];

const BADGE_COLORS: Record<string, string> = {
  blue:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
  amber:  "bg-amber-500/10 text-amber-400 border-amber-500/20",
  purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

const TAB_ACTIVE: Record<string, string> = {
  technical:    "border-blue-500 text-blue-300",
  price_action: "border-amber-500 text-amber-300",
  combined:     "border-purple-500 text-purple-300",
};

export default function StrategyTypePicker() {
  const router = useRouter();

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Choose Strategy Type</h2>
        <p className="text-slate-500 text-sm mt-1">Select a category and strategy to get started with the builder.</p>
      </div>

      <div className="space-y-8">
        {TABS.map(tab => (
          <div key={tab.id}>
            {/* Section header */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-lg">{tab.icon}</span>
              <h3 className="text-base font-bold text-slate-200">{tab.label}</h3>
              <div className={`h-px flex-1 bg-slate-800`} />
              <span className="text-[10px] text-slate-600">{STRATEGIES[tab.id].length} strateg{STRATEGIES[tab.id].length === 1 ? "y" : "ies"}</span>
            </div>

            {/* Strategy cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {STRATEGIES[tab.id].map(s => (
                <button key={s.id} onClick={() => router.push(s.path)}
                  className="text-left p-4 bg-slate-900 border border-slate-800 rounded-2xl hover:border-slate-600 hover:bg-slate-800/60 transition-all group">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-sm font-semibold text-slate-100 group-hover:text-white transition-colors">{s.name}</h4>
                    <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 shrink-0 ml-2 ${BADGE_COLORS[s.badgeColor]}`}>
                      {s.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed mb-3">{s.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {s.tags.map(t => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded-full text-slate-500">
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 mt-3 text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors">
                    <span>Open builder</span>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 translate-x-0 group-hover:translate-x-0.5 transition-transform">
                      <path d="M3 8h10M9 4l4 4-4 4"/>
                    </svg>
                  </div>
                </button>
              ))}

              {/* Coming soon placeholder for combined */}
              {tab.id === "combined" && (
                <div className="p-4 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl opacity-50">
                  <p className="text-xs text-slate-600 font-semibold mb-1">More coming soon…</p>
                  <p className="text-[10px] text-slate-700">Supertrend + VWAP, MACD + Swing, and more combinations.</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
