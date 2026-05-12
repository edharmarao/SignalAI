"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type IconProps = { className?: string };
const I = {
  dashboard: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  strategies: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <path d="M4 4h12l4 4v12a0 0 0 0 1 0 0H4z" /><path d="M16 4v4h4" /><path d="M8 12h8M8 16h6" />
    </svg>
  ),
  create: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" />
    </svg>
  ),
  trades: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <path d="M3 17l5-5 4 3 8-8" /><path d="M14 7h7v7" />
    </svg>
  ),
  backtest: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <circle cx="12" cy="13" r="7" /><path d="M12 9v4l2.5 2.5" /><path d="M9 3h6" />
    </svg>
  ),
  logs: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <path d="M5 4h11l3 3v13H5z" /><path d="M8 9h6M8 13h8M8 17h5" />
    </svg>
  ),
  holdings: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  ),
  sip: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  settings: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1-.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
};

type Desk = "equity" | "mutual-funds" | "options";

const DESKS: { id: Desk; emoji: string; label: string }[] = [
  { id: "equity",       emoji: "📊", label: "Equity" },
  { id: "mutual-funds", emoji: "💰", label: "Mutual Funds" },
  { id: "options",      emoji: "🎯", label: "Options" },
];

const DESK_TAB: Record<Desk, string> = {
  equity:         "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  "mutual-funds": "bg-sky-500/15 text-sky-300 border-sky-500/40",
  options:        "bg-violet-500/15 text-violet-300 border-violet-500/40",
};

const DESK_ACTIVE_LINK: Record<Desk, string> = {
  equity:         "text-emerald-400 bg-emerald-500/10",
  "mutual-funds": "text-sky-400 bg-sky-500/10",
  options:        "text-violet-400 bg-violet-500/10",
};

const DESK_ACTIVE_ICON: Record<Desk, string> = {
  equity:         "text-emerald-400",
  "mutual-funds": "text-sky-400",
  options:        "text-violet-400",
};

function equityNav() {
  return [
    { href: "/equity",                   label: "Overview",      icon: I.dashboard },
    { href: "/equity/strategies",         label: "Strategies",    icon: I.strategies },
    { href: "/equity/strategies/new",     label: "New Strategy",  icon: I.create },
    { href: "/equity/trades",             label: "Trades",        icon: I.trades },
    { href: "/equity/backtest",           label: "Backtest",      icon: I.backtest },
    { href: "/equity/logs",               label: "Logs",          icon: I.logs },
  ];
}

function mfNav() {
  return [
    { href: "/mutual-funds",             label: "Overview",      icon: I.dashboard },
    { href: "/mutual-funds/holdings",    label: "Holdings",      icon: I.holdings },
    { href: "/mutual-funds/sips",        label: "SIP Tracker",   icon: I.sip },
  ];
}

function optionsNav() {
  return [
    { href: "/options",                  label: "Overview",      icon: I.dashboard },
    { href: "/options/strategies",       label: "Strategies",    icon: I.strategies },
    { href: "/options/strategies/new",   label: "New Strategy",  icon: I.create },
    { href: "/options/trades",           label: "Trades",        icon: I.trades },
    { href: "/options/backtest",         label: "Backtest",      icon: I.backtest },
    { href: "/options/logs",             label: "Logs",          icon: I.logs },
  ];
}

function currentDesk(path: string): Desk {
  if (path.startsWith("/mutual-funds")) return "mutual-funds";
  if (path.startsWith("/options"))      return "options";
  return "equity";
}

function navForDesk(desk: Desk) {
  if (desk === "mutual-funds") return mfNav();
  if (desk === "options")      return optionsNav();
  return equityNav();
}

export default function Sidebar() {
  const path = usePathname() ?? "/";
  const desk = currentDesk(path);
  const nav = navForDesk(desk);

  return (
    <aside className="w-60 shrink-0 bg-slate-950/80 border-r border-slate-800 p-4 hidden md:flex flex-col">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mb-6 px-2">
        <div className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-emerald-400 via-emerald-500 to-sky-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 ring-1 ring-white/10">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-slate-950">
            <path d="M3 14l3.5-3.5 3 3L14 8l3 4 4-5" />
            <circle cx="14" cy="8" r="1.6" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <div className="font-semibold tracking-tight text-slate-100">
          Signal <span className="text-emerald-400">AI</span>
        </div>
      </Link>

      {/* Desk switcher */}
      <div className="mb-5">
        <div className="text-[10px] uppercase text-slate-500 px-2 mb-2 tracking-wider">Section</div>
        <div className="flex flex-col gap-1">
          {DESKS.map(({ id, emoji, label }) => (
            <Link
              key={id}
              href={`/${id}`}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition ${
                desk === id
                  ? DESK_TAB[id]
                  : "border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
              }`}
            >
              <span>{emoji}</span>
              <span className="font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="w-full border-t border-slate-800 mb-4" />

      {/* Section nav */}
      <nav className="flex-1 flex flex-col gap-1">
        {nav.map((n) => {
          const isActive = n.href === `/${desk}` ? path === n.href : path?.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition ${
                isActive ? `${DESK_ACTIVE_LINK[desk]} font-medium` : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? DESK_ACTIVE_ICON[desk] : "text-slate-400"}`} />
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Settings */}
      <div className="mt-4 border-t border-slate-800 pt-4">
        <Link
          href="/settings"
          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition ${
            path.startsWith("/settings") ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
          }`}
        >
          <I.settings className="w-4 h-4 shrink-0" />
          <span>Settings</span>
        </Link>
      </div>
      <div className="text-[10px] text-slate-500 px-2 mt-3">v0.1.0</div>
    </aside>
  );
}
