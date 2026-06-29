"use client";
import { useState, useEffect } from "react";
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
  charts: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <rect x="3" y="12" width="3" height="9" rx="1" />
      <rect x="9" y="7" width="3" height="14" rx="1" />
      <rect x="15" y="3" width="3" height="18" rx="1" />
      <path d="M21 21H3" />
    </svg>
  ),
  import: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  api: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  ),
  monitor: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <polyline points="6 8 9 11 12 8 15 11 18 8" />
    </svg>
  ),
  live: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={p.className}>
      <circle cx="12" cy="12" r="5" />
    </svg>
  ),
  chevronDown: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  ohlcv: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  ),
  symbols: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  fundamentals: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
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
    { href: "/equity/live",               label: "Live Strategies", icon: I.live },
    { href: "/equity/strategies/new",     label: "New Strategy",  icon: I.create },
    { href: "/equity/trades",             label: "Trades",        icon: I.trades },
    { href: "/equity/orb-backtest",       label: "ORB Backtest",  icon: I.backtest },
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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dataImportOpen, setDataImportOpen] = useState(false);

  // Persist + broadcast collapse state
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "1") setCollapsed(true);
  }, []);

  // Auto-expand data import submenu if on any data-import path
  useEffect(() => {
    if (path.startsWith("/data-import")) {
      setDataImportOpen(true);
    }
  }, [path]);

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [path]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
    window.dispatchEvent(new CustomEvent("sidebar-toggle", { detail: { collapsed: next } }));
  }

  const navContent = (onLinkClick?: () => void) => (
    <>
      {/* Desk switcher */}
      <div className="mb-5">
        {!collapsed && <div className="text-[10px] uppercase text-slate-500 px-2 mb-2 tracking-wider">Section</div>}
        <div className="flex flex-col gap-1">
          {DESKS.map(({ id, emoji, label }) => (
            <Link key={id} href={`/${id}`} onClick={onLinkClick} title={collapsed ? label : undefined}
              className={`flex items-center gap-2 rounded-md text-sm border transition ${collapsed ? "justify-center p-2" : "px-3 py-2"} ${
                desk === id ? DESK_TAB[id] : "border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
              }`}>
              <span>{emoji}</span>
              {!collapsed && <span className="font-medium">{label}</span>}
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
            <Link key={n.href} href={n.href} onClick={onLinkClick} title={collapsed ? n.label : undefined}
              className={`flex items-center gap-3 rounded-md text-sm transition ${collapsed ? "justify-center p-2" : "px-3 py-2"} ${
                isActive ? `${DESK_ACTIVE_LINK[desk]} font-medium` : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
              }`}>
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? DESK_ACTIVE_ICON[desk] : "text-slate-400"}`} />
              {!collapsed && <span>{n.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Charts + Tools + Settings */}
      <div className="mt-4 border-t border-slate-800 pt-4 flex flex-col gap-1">
        <Link href="/charts" onClick={onLinkClick} title={collapsed ? "Charts" : undefined}
          className={`flex items-center gap-3 rounded-md text-sm transition ${collapsed ? "justify-center p-2" : "px-3 py-2"} ${
            path.startsWith("/charts") ? "bg-amber-500/10 text-amber-300" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
          }`}>
          <I.charts className={`w-4 h-4 shrink-0 ${path.startsWith("/charts") ? "text-amber-400" : "text-slate-400"}`} />
          {!collapsed && <span>Charts</span>}
        </Link>
        <Link href="/fundamentals" onClick={onLinkClick} title={collapsed ? "Fundamentals" : undefined}
          className={`flex items-center gap-3 rounded-md text-sm transition ${collapsed ? "justify-center p-2" : "px-3 py-2"} ${
            path.startsWith("/fundamentals") ? "bg-blue-500/10 text-blue-300" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
          }`}>
          <I.fundamentals className={`w-4 h-4 shrink-0 ${path.startsWith("/fundamentals") ? "text-blue-400" : "text-slate-400"}`} />
          {!collapsed && <span>Fundamentals</span>}
        </Link>

        {/* Data Import with submenu */}
        <div>
          <button
            onClick={() => !collapsed && setDataImportOpen(!dataImportOpen)}
            title={collapsed ? "Data Import" : undefined}
            className={`w-full flex items-center gap-3 rounded-md text-sm transition ${collapsed ? "justify-center p-2" : "px-3 py-2"} ${
              path.startsWith("/data-import") ? "bg-teal-500/10 text-teal-300" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
            }`}>
            <I.import className={`w-4 h-4 shrink-0 ${path.startsWith("/data-import") ? "text-teal-400" : "text-slate-400"}`} />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Data Import</span>
                <I.chevronDown className={`w-3.5 h-3.5 transition-transform ${dataImportOpen ? "rotate-180" : ""}`} />
              </>
            )}
          </button>
          {!collapsed && dataImportOpen && (
            <div className="mt-1 ml-7 space-y-0.5 border-l border-slate-700/50 pl-3">
              <Link href="/data-import/ohlcv" onClick={onLinkClick}
                className={`flex items-center gap-2 rounded-md text-xs transition px-2 py-1.5 ${
                  path.startsWith("/data-import/ohlcv") ? "bg-emerald-500/10 text-emerald-300 font-medium" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
                }`}>
                <I.ohlcv className="w-3.5 h-3.5 shrink-0" />
                <span>OHLCV Data</span>
              </Link>
              <Link href="/data-import/fundamentals" onClick={onLinkClick}
                className={`flex items-center gap-2 rounded-md text-xs transition px-2 py-1.5 ${
                  path.startsWith("/data-import/fundamentals") ? "bg-sky-500/10 text-sky-300 font-medium" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
                }`}>
                <I.fundamentals className="w-3.5 h-3.5 shrink-0" />
                <span>Fundamentals</span>
              </Link>
              <Link href="/data-import/symbols" onClick={onLinkClick}
                className={`flex items-center gap-2 rounded-md text-xs transition px-2 py-1.5 ${
                  path.startsWith("/data-import/symbols") ? "bg-violet-500/10 text-violet-300 font-medium" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
                }`}>
                <I.symbols className="w-3.5 h-3.5 shrink-0" />
                <span>Symbols Update</span>
              </Link>
            </div>
          )}
        </div>
        <Link href="/api-tester" onClick={onLinkClick} title={collapsed ? "API Tester" : undefined}
          className={`flex items-center gap-3 rounded-md text-sm transition ${collapsed ? "justify-center p-2" : "px-3 py-2"} ${
            path.startsWith("/api-tester") ? "bg-violet-500/10 text-violet-300" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
          }`}>
          <I.api className={`w-4 h-4 shrink-0 ${path.startsWith("/api-tester") ? "text-violet-400" : "text-slate-400"}`} />
          {!collapsed && <span>API Tester</span>}
        </Link>
        <Link href="/system-monitor" onClick={onLinkClick} title={collapsed ? "System Monitor" : undefined}
          className={`flex items-center gap-3 rounded-md text-sm transition ${collapsed ? "justify-center p-2" : "px-3 py-2"} ${
            path.startsWith("/system-monitor") ? "bg-rose-500/10 text-rose-300" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
          }`}>
          <I.monitor className={`w-4 h-4 shrink-0 ${path.startsWith("/system-monitor") ? "text-rose-400" : "text-slate-400"}`} />
          {!collapsed && <span>System Monitor</span>}
        </Link>
        <Link href="/settings" onClick={onLinkClick} title={collapsed ? "Settings" : undefined}
          className={`flex items-center gap-3 rounded-md text-sm transition ${collapsed ? "justify-center p-2" : "px-3 py-2"} ${
            path.startsWith("/settings") ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
          }`}>
          <I.settings className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
      </div>
      {!collapsed && <div className="text-[10px] text-slate-500 px-2 mt-3">v0.1.0</div>}
    </>
  );

  return (
    <>
      {/* ── Mobile hamburger button (top-left, only on small screens) ── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 w-9 h-9 flex items-center justify-center rounded-lg bg-slate-900 border border-slate-700 text-slate-300 shadow-lg"
        aria-label="Open navigation">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {/* ── Mobile overlay drawer ─────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          {/* Drawer */}
          <aside className="relative w-72 max-w-[85vw] bg-slate-950 border-r border-slate-800 flex flex-col p-4 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 px-2">
              <Link href="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
                <div className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-emerald-400 via-emerald-500 to-sky-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 ring-1 ring-white/10">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-slate-950">
                    <path d="M3 14l3.5-3.5 3 3L14 8l3 4 4-5" />
                    <circle cx="14" cy="8" r="1.6" fill="currentColor" stroke="none" />
                  </svg>
                </div>
                <div className="font-semibold tracking-tight text-slate-100">Signal <span className="text-emerald-400">AI</span></div>
              </Link>
              <button onClick={() => setMobileOpen(false)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            {navContent(() => setMobileOpen(false))}
          </aside>
        </div>
      )}

      {/* ── Desktop sidebar (hidden on mobile) ───────────────────────── */}
      <aside className={`shrink-0 bg-slate-950/80 border-r border-slate-800 hidden md:flex flex-col transition-all duration-200 ${collapsed ? "w-14 p-2" : "w-60 p-4"}`}>
        {/* Logo + collapse button row */}
        <div className={`flex items-center mb-6 ${collapsed ? "justify-center" : "justify-between px-2"}`}>
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-emerald-400 via-emerald-500 to-sky-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 ring-1 ring-white/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-slate-950">
                <path d="M3 14l3.5-3.5 3 3L14 8l3 4 4-5" />
                <circle cx="14" cy="8" r="1.6" fill="currentColor" stroke="none" />
              </svg>
            </div>
            {!collapsed && <div className="font-semibold tracking-tight text-slate-100">Signal <span className="text-emerald-400">AI</span></div>}
          </Link>
          {!collapsed && (
            <button onClick={toggle} title="Collapse sidebar"
              className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M11 19l-7-7 7-7M21 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {collapsed && (
            <button onClick={toggle} title="Expand sidebar"
              className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors mt-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M13 5l7 7-7 7M3 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        {navContent()}
      </aside>
    </>
  );
}
