"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PrismMark } from "@/components/Prism";
import ThemeSwitcher from "@/components/ThemeSwitcher";

// Ten flat links wrapped onto two lines at desktop width and three on a
// phone, so the five interactive tools live behind one "Tools" menu.
const TOOLS = [
  { href: "/paper-trading", label: "Paper Trading", hint: "Live Alpaca account, journal, risk metrics" },
  { href: "/rotation", label: "Momentum", hint: "Automated momentum + leverage strategy" },
  { href: "/dcf-builder", label: "DCF Builder", hint: "Valuation with sensitivity table" },
  { href: "/optimizer", label: "Optimizer", hint: "Efficient frontier across your tickers" },
  { href: "/monte-carlo", label: "Monte Carlo", hint: "10,000 simulated portfolio paths" },
  { href: "/quant/backtester", label: "Regime Backtester", hint: "The strategy through 2008, 2020, 2022 and a bull run" },
  { href: "/quant/factor-risk", label: "Factor Risk", hint: "Equity, rates and inflation risk in a multi-asset mix" },
  { href: "/quant/vol-smile", label: "Vol Smile", hint: "Implied volatility across strikes, with dials" },
];

const LINKS = [
  { href: "/research", label: "Research" },
  { href: "/education", label: "Education" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  // Signed out, proxy.ts bounces this to /login, so one link covers both states.
  { href: "/dashboard", label: "Account" },
];

const itemClass = (active: boolean) =>
  `rounded-[var(--radius-sm)] px-2 py-1 text-[11px] caps transition-colors duration-100 ${
    active ? "bg-accent text-background" : "text-zinc-500 hover:bg-border/60 hover:text-foreground"
  }`;

export default function Nav() {
  const pathname = usePathname();
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const inTools = TOOLS.some((t) => pathname.startsWith(t.href));

  // Close the menu on outside click / Escape (menu links close it on click).
  useEffect(() => {
    if (!toolsOpen) return;
    function onDown(e: PointerEvent) {
      if (!toolsRef.current?.contains(e.target as Node)) setToolsOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setToolsOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [toolsOpen]);

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex w-full items-center gap-1 px-4 py-1.5 sm:px-6 lg:px-10">
        <Link
          href="/"
          aria-label="PRISM home"
          className={`mr-2 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-0.5 transition-colors duration-100 ${
            pathname === "/" ? "text-foreground" : "text-zinc-400 hover:text-foreground"
          }`}
        >
          <PrismMark size={26} />
          <span className="text-[15px] font-semibold tracking-[0.18em]">PRISM</span>
        </Link>

        <div
          ref={toolsRef}
          className="relative"
          onMouseEnter={() => setToolsOpen(true)}
          onMouseLeave={() => setToolsOpen(false)}
        >
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={toolsOpen}
            onClick={() => setToolsOpen((o) => !o)}
            className={`${itemClass(inTools)} inline-flex items-center gap-1`}
          >
            Tools
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={`transition-transform ${toolsOpen ? "rotate-180" : ""}`}>
              <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          {toolsOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full z-50 mt-1 w-72 rounded-[var(--radius)] border border-border bg-panel p-1.5 shadow-lg"
            >
              {TOOLS.map((t) => {
                const active = pathname.startsWith(t.href);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    role="menuitem"
                    onClick={() => setToolsOpen(false)}
                    className={`block rounded-[var(--radius-sm)] px-2.5 py-2 transition-colors duration-100 ${
                      active ? "bg-accent/10" : "hover:bg-border/60"
                    }`}
                  >
                    <span className={`block text-[11px] caps ${active ? "text-accent" : "text-foreground"}`}>{t.label}</span>
                    <span className="mt-0.5 block text-[11px] text-zinc-500">{t.hint}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className={itemClass(pathname.startsWith(link.href))}>
            {link.label}
          </Link>
        ))}
        <ThemeSwitcher />
      </div>
      {/* Status line, desktop only; on a phone the nav should be one row. */}
      <div className="hidden border-t border-border/60 bg-panel sm:block">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-1 text-[10px] caps text-zinc-500 sm:px-6 lg:px-10">
          <span className="truncate">
            <span className="text-accent">PRISM</span>
            <span className="ml-2">Portfolio Research in Systematic Markets</span>
            <span className="ml-2 text-zinc-600">by Ethan Biancardi</span>
          </span>
          <span className="shrink-0">Data: Alpaca · SEC EDGAR · Anthropic</span>
        </div>
      </div>
    </nav>
  );
}
