"use client";

// The Signal Trader's "thought process": one entry per 15-minute check,
// summarised in a sentence, with the full reasoning (every holding it kept
// and why, every candidate it passed over and why) one click away. Reads
// /api/signal-trader/log, which only ever reads Redis.
import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";
import type { RunReport } from "@/lib/signalTrader";
import { Card, SectionHeader } from "@/components/ui";

const SHOWN = 6; // newest checks shown before "show all"

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const list = (items: string[]) =>
  items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

// Group the reasons candidates were passed over ("below its averages" x5,
// "portfolio full" x2), ignoring the numbers inside them.
function reasonCounts(e: RunReport): string {
  const counts = new Map<string, number>();
  for (const s of e.skipped) {
    const r = s.reason.replace(/\.$/, "").toLowerCase();
    const key = /^already up/.test(r) ? "already ran up since Congress bought" : /^sold within/.test(r) ? "sold recently" : r;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `${n} ${r}`)
    .join(", ");
}

// The one-line version of a check, in plain English.
function summarise(e: RunReport): { headline: string; detail: string } {
  const sells = e.orders.filter((o) => o.side === "sell");
  const buys = e.orders.filter((o) => o.side === "buy");
  const holdings = e.kept.length + sells.length;
  const parts: string[] = [];
  parts.push(
    sells.length
      ? `Checked ${holdings} holdings: sold ${list(sells.map((o) => o.symbol))}.`
      : `Checked ${holdings} holdings: none hit a sell rule.`,
  );
  if (buys.length) parts.push(`Bought ${list(buys.map((o) => o.symbol))}.`);
  if (e.skipped.length) parts.push(`Passed on ${e.skipped.length} buy candidate${e.skipped.length === 1 ? "" : "s"} (${reasonCounts(e)}).`);
  else if (!buys.length) parts.push("No stock scored high enough to buy.");
  if (e.failed.length) parts.push(`${e.failed.length} order${e.failed.length === 1 ? "" : "s"} failed.`);
  const headline = e.orders.length
    ? [buys.length && `bought ${buys.length}`, sells.length && `sold ${sells.length}`].filter(Boolean).join(", ")
    : "no trades";
  return { headline, detail: parts.join(" ") };
}

function Entry({ e, open }: { e: RunReport; open: boolean }) {
  const { headline, detail } = summarise(e);
  return (
    <details open={open} className="group border-b border-border py-2 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-baseline gap-3 text-xs [&::-webkit-details-marker]:hidden">
        <span className="w-3 shrink-0 text-zinc-500 transition-transform group-open:rotate-90">›</span>
        <span className="w-16 shrink-0 tabular-nums text-zinc-500">{time(e.ranAt)}</span>
        <span className={`caps text-[10px] ${e.orders.length ? "text-accent" : "text-zinc-500"}`}>{headline}</span>
        <span className="hidden min-w-0 flex-1 truncate text-zinc-400 sm:block">{detail}</span>
      </summary>
      <div className="mt-2 space-y-2 pl-6 text-xs leading-5 text-zinc-400">
        <p>{detail}</p>
        {e.orders.length > 0 && (
          <div>
            <p className="text-[10px] caps text-zinc-500">Trades</p>
            <ul className="mt-0.5 space-y-0.5">
              {e.orders.map((o) => (
                <li key={`${o.side}-${o.symbol}`}>
                  <span className={o.side === "buy" ? "text-good" : "text-bad"}>{o.side}</span> {o.qty} {o.symbol} at{" "}
                  {formatCurrency(o.price)}: {o.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        {e.kept.length > 0 && (
          <div>
            <p className="text-[10px] caps text-zinc-500">Holdings kept</p>
            <ul className="mt-0.5 space-y-0.5">
              {e.kept.map((k) => (
                <li key={k.symbol}>
                  <span className="text-foreground">{k.symbol}</span>: {k.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        {e.skipped.length > 0 && (
          <div>
            <p className="text-[10px] caps text-zinc-500">Strongest candidates it didn&apos;t buy</p>
            <ul className="mt-0.5 space-y-0.5">
              {e.skipped.map((s) => (
                <li key={s.symbol}>
                  <span className="text-foreground">{s.symbol}</span> (score {s.score}): {s.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        {e.failed.length > 0 && <p className="text-bad">Failed: {e.failed.join("; ")}</p>}
      </div>
    </details>
  );
}

export default function ThoughtLog() {
  const [entries, setEntries] = useState<RunReport[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch("/api/signal-trader/log")
        .then((res) => res.json())
        .then((body) => setEntries(body.entries ?? []))
        .catch(() => setEntries([]));
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  const shown = showAll ? (entries ?? []) : (entries ?? []).slice(0, SHOWN);
  return (
    <Card as="section" className="mt-4">
      <SectionHeader
        label="thought process"
        description="Every 15-minute check while the market is open, newest first. Click a check to see every holding it kept and every stock it passed on, with the reason for each."
      />
      <div className="mt-2">
        {entries === null && <p className="py-2 text-xs text-zinc-500">Loading...</p>}
        {entries?.length === 0 && (
          <p className="py-2 text-xs text-zinc-500">No checks logged yet. They appear here from the next check during market hours.</p>
        )}
        {shown.map((e, i) => {
          const newDay = i === 0 || day(e.ranAt) !== day(shown[i - 1].ranAt);
          return (
            <div key={e.ranAt}>
              {newDay && <p className="mt-2 text-[10px] caps text-zinc-500">{day(e.ranAt)}</p>}
              <Entry e={e} open={i === 0} />
            </div>
          );
        })}
      </div>
      {entries && entries.length > SHOWN && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-xs text-accent underline decoration-border underline-offset-4 hover:decoration-accent"
        >
          {showAll ? "Show fewer" : `Show all ${entries.length} checks`}
        </button>
      )}
    </Card>
  );
}
