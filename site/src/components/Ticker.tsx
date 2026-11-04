"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

// A ticker with its company name beside it: "INTC Intel". Used in every
// trade list and journal so a reader doesn't have to know the symbols.
//
// Every <Ticker> on a page shares one name store: symbols asked for within
// the same moment go to /api/company-names in a single request, and each
// name is fetched once per visit. Until a name arrives (or if there isn't
// one) only the ticker shows, so nothing breaks without it.

const names = new Map<string, string | null>(); // null = asked, no name
const queued = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const batch = [...queued];
  queued.clear();
  for (let i = 0; i < batch.length; i += 200) {
    const chunk = batch.slice(i, i + 200);
    fetch(`/api/company-names?symbols=${encodeURIComponent(chunk.join(","))}`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((found: Record<string, string>) => {
        for (const s of chunk) names.set(s, found[s] ?? null);
        listeners.forEach((l) => l());
      });
  }
}

function request(symbol: string) {
  if (names.has(symbol) || queued.has(symbol)) return;
  queued.add(symbol);
  timer ??= setTimeout(flush, 30);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The company name for a ticker, or null while loading / if unknown. */
export function useCompanyName(symbol: string): string | null {
  const s = symbol.toUpperCase();
  return useSyncExternalStore(
    subscribe,
    () => {
      request(s);
      return names.get(s) ?? null;
    },
    () => null,
  );
}

// Funds have no 10-K for the Research page to open, so they stay plain text:
// the index and leveraged ETFs the strategies use, and the old passive core.
const FUNDS = new Set(["SPY", "QQQ", "DIA", "IWM", "VOO", "VTI", "BND", "VEA", "VWO", "VNQ", "VXF", "GLD", "TLT", "TQQQ", "SOXL", "TNA", "UPRO", "SPXL", "TECL", "SQQQ"]);

// Every ticker links to its page on /research (Search tab, ?ticker=), so any
// stock in a portfolio, trade list or log is one click from its research.
// Pass link={false} where it sits inside another clickable element.
export function Ticker({ symbol, className = "text-foreground", link = true }: { symbol: string; className?: string; link?: boolean }) {
  const name = useCompanyName(symbol);
  const s = symbol.toUpperCase();
  const content = (
    <>
      {symbol}
      {name && <span className="ml-1.5 text-zinc-500">{name}</span>}
    </>
  );
  if (!link || FUNDS.has(s)) return <span className={className}>{content}</span>;
  return (
    <Link
      href={`/research?ticker=${encodeURIComponent(s)}`}
      title={`Research ${s}`}
      className={`${className} underline decoration-border underline-offset-2 transition-colors hover:text-accent hover:decoration-accent`}
    >
      {content}
    </Link>
  );
}
