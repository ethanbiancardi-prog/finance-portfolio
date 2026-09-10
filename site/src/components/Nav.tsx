"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeSwitcher from "@/components/ThemeSwitcher";

const links = [
  { href: "/", label: "Home" },
  { href: "/paper-trading", label: "Paper Trading" },
  { href: "/rotation", label: "Sector Rotation" },
  { href: "/monte-carlo", label: "Monte Carlo" },
  { href: "/optimizer", label: "Optimizer" },
  { href: "/dcf-builder", label: "DCF Builder" },
  { href: "/statement-analyzer", label: "10-K Analyzer" },
  { href: "/quant-notes", label: "Quant Notes" },
  { href: "/about", label: "About" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-background font-mono">
      {/* Tab bar: the active route is inverse-video, like a tmux window list. */}
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-1 gap-y-1 px-4 py-1.5 sm:px-6">
        <span className="mr-2 text-[10px] text-accent">■</span>
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-1.5 py-0.5 text-[11px] uppercase tracking-[0.1em] transition-colors duration-100 ${
                active
                  ? "bg-accent text-background"
                  : "text-zinc-500 hover:bg-border/60 hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
        <ThemeSwitcher />
      </div>
      {/* Status line. */}
      <div className="border-t border-border/60 bg-panel">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500 sm:px-6">
          <span className="truncate">
            <span className="text-accent">ethan@portfolio</span>:~{pathname === "/" ? "" : pathname}
          </span>
          <span className="hidden shrink-0 sm:inline">alpaca · sec edgar · anthropic</span>
        </div>
      </div>
    </nav>
  );
}
