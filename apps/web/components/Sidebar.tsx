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
  settings: (p: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
};

const NAV = [
  { href: "/", label: "Dashboard", icon: I.dashboard },
  { href: "/strategies", label: "Strategies", icon: I.strategies },
  { href: "/strategies/new", label: "Create Strategy", icon: I.create },
  { href: "/trades", label: "Live Trades", icon: I.trades },
  { href: "/backtest", label: "Backtest", icon: I.backtest },
  { href: "/logs", label: "Logs", icon: I.logs },
  { href: "/settings", label: "Settings", icon: I.settings },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    // Outer reserves a fixed 64px column so main content doesn't shift.
    // Inner is absolutely positioned and expands to 240px on hover.
    <div className="hidden md:block w-16 shrink-0 relative">
      <aside
        className="group absolute inset-y-0 left-0 w-16 hover:w-60 transition-[width] duration-200 ease-out
                   bg-slate-950/95 border-r border-slate-800 p-3 flex flex-col z-30 overflow-hidden shadow-xl"
      >
        <div className="flex items-center gap-2 mb-8 px-1 h-8">
          <div className="w-8 h-8 shrink-0 rounded-md bg-gradient-to-br from-emerald-400 to-sky-500" />
          <div className="font-semibold tracking-tight text-slate-100 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            Signal AI
          </div>
        </div>
        <nav className="flex-1 flex flex-col gap-1">
          {NAV.map((n) => {
            const active = path === n.href || (n.href !== "/" && path?.startsWith(n.href));
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                title={n.label}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition ${
                  active
                    ? "bg-slate-800 text-emerald-400"
                    : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${active ? "text-emerald-400" : "text-slate-400"}`} />
                <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  {n.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="text-[10px] text-slate-500 px-2 mt-4 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          v0.1.0
        </div>
      </aside>
    </div>
  );
}
