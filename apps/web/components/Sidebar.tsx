"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/strategies", label: "Strategies" },
  { href: "/strategies/new", label: "Create Strategy" },
  { href: "/trades", label: "Live Trades" },
  { href: "/backtest", label: "Backtest" },
  { href: "/logs", label: "Logs" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-60 shrink-0 bg-slate-950/80 border-r border-slate-800 p-4 hidden md:flex flex-col">
      <div className="flex items-center gap-2 mb-8 px-2">
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-emerald-400 to-sky-500" />
        <div className="font-semibold tracking-tight text-slate-100">Signal AI</div>
      </div>
      <nav className="flex-1 flex flex-col gap-1">
        {NAV.map((n) => {
          const active = path === n.href || (n.href !== "/" && path?.startsWith(n.href));
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 py-2 rounded-md text-sm transition ${
                active
                  ? "bg-slate-800 text-emerald-400"
                  : "text-slate-300 hover:bg-slate-800/60"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="text-[10px] text-slate-500 px-2 mt-4">
        v0.1.0
      </div>
    </aside>
  );
}
