"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { MotifMark } from "@/components/Motif";
import ThemeSwitcher from "@/components/ThemeSwitcher";

// Nav, grouped by what a visitor came for: research, the live trading
// bots, and the calculators. The two groups with many pages are dropdowns.
// The dashboard isn't here: it's personal, reached from the footer's
// "Sign in" (see Footer.tsx). The Calibration Tracker is under Trading.
type NavItem = { href: string; label: string; hint: string };
type Menu = { key: string; label: string; items: NavItem[] };
type Entry = { href: string; label: string } | Menu;

const TRADING: NavItem[] = [
  { href: "/paper-trading", label: "Paper Trading", hint: "Live Alpaca account run by the Signal Trader, vs. the S&P 500" },
  { href: "/rotation", label: "Momentum", hint: "Automated momentum + leverage strategy" },
  { href: "/quant/strategy-lab", label: "Strategy Lab", hint: "Five trading strategies tested on 10 years of real prices" },
  { href: "/quant/rule-tester", label: "Rule Tester", hint: "Flip the bot's rules, see $100K since 2017, and AI vs simple rules" },
  { href: "/quant/backtester", label: "Regime Backtester", hint: "The strategy through 2008, 2020, 2022 and a bull run" },
  // Signed-in only: signed out, proxy.ts sends this to /login first.
  { href: "/calibration", label: "Calibration Tracker", hint: "Your predictions scored against Kalshi markets (sign in)" },
];
const TOOLS: NavItem[] = [
  { href: "/dcf-builder", label: "DCF Builder", hint: "Valuation with sensitivity table" },
  { href: "/optimizer", label: "Optimizer", hint: "Efficient frontier across your tickers" },
  { href: "/monte-carlo", label: "Monte Carlo", hint: "10,000 simulated portfolio paths" },
  { href: "/quant/factor-risk", label: "Factor Risk", hint: "Equity, rates and inflation risk in a multi-asset mix" },
  { href: "/quant/vol-smile", label: "Vol Smile", hint: "Implied volatility across strikes, with dials" },
];

const ENTRIES: Entry[] = [
  { href: "/research", label: "Research" },
  { href: "/sustainability", label: "Sustainability" },
  { key: "trading", label: "Trading", items: TRADING },
  { key: "tools", label: "Tools", items: TOOLS },
  { href: "/education", label: "Learn" },
  { href: "/about", label: "About" },
];

const itemClass = (active: boolean) =>
  `rounded-[var(--radius-sm)] px-2 py-1 text-[11px] caps transition-colors duration-100 ${
    active ? "bg-accent text-background" : "text-zinc-500 hover:bg-border/60 hover:text-foreground"
  }`;

export default function Nav() {
  const pathname = usePathname();
  // Which dropdown is open ("trading", "tools"), if any. One at a time.
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  // Hover opens a menu, so a mouse click right after must not toggle it
  // shut again, and leaving waits a beat so a slightly crooked path from the
  // button down to an item doesn't close it.
  const hoverOpenedAt = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function hoverOpen(e: ReactPointerEvent, key: string) {
    if (e.pointerType !== "mouse") return;
    clearTimeout(closeTimer.current);
    // The event's own timestamp (not Date.now()), compared with the click's below.
    if (open !== key) hoverOpenedAt.current = e.timeStamp;
    setOpen(key);
  }
  function hoverClose(e: ReactPointerEvent) {
    if (e.pointerType !== "mouse") return;
    closeTimer.current = setTimeout(() => setOpen(null), 250);
  }
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  // The homepage's "Explore the tools" button opens the Tools menu.
  useEffect(() => {
    const show = () => setOpen("tools");
    window.addEventListener("prism:open-tools", show);
    return () => window.removeEventListener("prism:open-tools", show);
  }, []);

  // Close on outside click / Escape (menu links close it on click).
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!navRef.current?.contains(e.target as Node)) setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div ref={navRef} className="flex w-full flex-wrap items-center gap-x-0.5 gap-y-1 px-3 py-1.5 sm:gap-x-1 sm:px-6 lg:px-10">
        <Link
          href="/"
          aria-label="PRISM home"
          className={`mr-1 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 transition-colors duration-100 sm:mr-2 sm:px-1.5 ${
            pathname === "/" ? "text-foreground" : "text-zinc-400 hover:text-foreground"
          }`}
        >
          <MotifMark size={26} />
          {/* The wordmark hides on a phone so the nav fits on one row. */}
          <span className="hidden text-[15px] font-semibold tracking-[0.18em] sm:inline">PRISM</span>
        </Link>

        {ENTRIES.map((entry) =>
          "items" in entry ? (
            <div key={entry.key} className="sm:relative" onPointerEnter={(e) => hoverOpen(e, entry.key)} onPointerLeave={hoverClose}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open === entry.key}
                onClick={(e) => {
                  if (e.timeStamp - hoverOpenedAt.current < 800) return;
                  setOpen((o) => (o === entry.key ? null : entry.key));
                }}
                className={`${itemClass(entry.items.some((t) => pathname.startsWith(t.href)))} inline-flex items-center gap-1`}
              >
                {entry.label}
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={`transition-transform ${open === entry.key ? "rotate-180" : ""}`}>
                  <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
              {open === entry.key && (
                // Desktop: drops under its button. Phone: spans the nav's
                // width, so a menu near the right edge can't run off-screen.
                <div role="menu" className="absolute inset-x-3 top-full z-50 pt-1 sm:inset-x-auto sm:left-0 sm:w-72">
                  {/* pt-1, not a margin: the gap stays inside the hover area. */}
                  <div className="rounded-[var(--radius)] border border-border bg-panel p-1.5 shadow-lg">
                    {entry.items.map((t) => {
                      const active = pathname.startsWith(t.href);
                      return (
                        <Link
                          key={t.href}
                          href={t.href}
                          role="menuitem"
                          onClick={() => setOpen(null)}
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
                </div>
              )}
            </div>
          ) : (
            <Link key={entry.href} href={entry.href} className={itemClass(pathname.startsWith(entry.href))}>
              {entry.label}
            </Link>
          ),
        )}
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
