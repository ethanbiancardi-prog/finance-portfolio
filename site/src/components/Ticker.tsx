"use client";

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

export function Ticker({ symbol, className = "text-foreground" }: { symbol: string; className?: string }) {
  const name = useCompanyName(symbol);
  return (
    <span className={className}>
      {symbol}
      {name && <span className="ml-1.5 text-zinc-500">{name}</span>}
    </span>
  );
}
