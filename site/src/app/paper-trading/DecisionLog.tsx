"use client";

// The Signal Trader's decision table: one row per 15-minute check (what it
// decided and why; click a row for every holding and candidate behind it),
// grouped by day, each day headed by a summary that becomes the day's final
// summary once the market closes. Reads /api/signal-trader/log (Redis only).
import { Fragment, useEffect, useState } from "react";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { HistoryPoint } from "@/lib/portfolio";
import type { RunReport } from "@/lib/signalTrader";
import type { AlgoStatus } from "@/lib/signalTraderRules";
import { tableCellClass, tableHeadCellClass, tableHeadRowClass, tableRowClass } from "@/components/ui";
import { Collapsible } from "./Collapsible";

const ROWS_PER_DAY = 8; // newest checks shown per day before "show all"

// New York calendar day. Defined here rather than imported from lib/portfolio,
// which would pull its server-side price fetching into the browser bundle.
const nyDate = (iso: string | Date) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const dayLabel = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
const signed = (v: number) => `${v >= 0 ? "+" : ""}${formatPercent(v, { decimals: 2 })}`;
const list = (items: string[]) =>
  items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

// Short names for why a candidate wasn't bought, so a row fits on a line.
function shortReason(reason: string): string {
  if (/^below its/i.test(reason)) return "below its 50/200-day average";
  if (/^not tradable/i.test(reason)) return "not tradable";
  if (/^portfolio full/i.test(reason)) return "portfolio full";
  if (/^already up/i.test(reason)) return "already ran up";
  if (/^sold within/i.test(reason)) return "sold recently";
  if (/^no fresh price/i.test(reason)) return "no live price";
  if (/^not enough price/i.test(reason)) return "too new to judge";
  if (/^not enough cash/i.test(reason)) return "not enough cash";
  if (/^under \$/i.test(reason)) return "price too low";
  return reason.replace(/\.$/, "");
}

function passedReasons(e: RunReport): string {
  const counts = new Map<string, number>();
  for (const s of e.skipped) counts.set(shortReason(s.reason), (counts.get(shortReason(s.reason)) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `${n} ${r}`)
    .join(", ");
}

function decision(e: RunReport): { text: string; acted: boolean } {
  const buys = e.orders.filter((o) => o.side === "buy").map((o) => o.symbol);
  const sells = e.orders.filter((o) => o.side === "sell").map((o) => o.symbol);
  const parts = [sells.length && `Sold ${list(sells)}`, buys.length && `Bought ${list(buys)}`].filter(Boolean) as string[];
  return parts.length ? { text: parts.join(" · "), acted: true } : { text: "Hold, no trades", acted: false };
}

function why(e: RunReport): string {
  if (e.orders.length) return e.orders.map((o) => `${o.symbol}: ${o.reason.replace(/\.$/, "")}`).join(" · ");
  const parts = ["No holding hit a sell rule"];
  parts.push(e.skipped.length ? `passed on ${passedReasons(e)}` : "no stock scored high enough to buy");
  return parts.join("; ");
}

// --- Day summary ---------------------------------------------------------

function marketClosedFor(day: string): boolean {
  const today = nyDate(new Date());
  if (day < today) return true;
  const [h, m] = new Date()
    .toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour12: false })
    .split(":")
    .map(Number);
  return h * 60 + m >= 16 * 60;
}

type AlgoTrade = AlgoStatus["recent"][number];

// The day's trades come from the account's trade record, not the check log,
// so a trade from before the log began (or from a check that failed to log)
// still counts.
function daySummary(day: string, entries: RunReport[], history: HistoryPoint[], trades: AlgoTrade[]): string {
  const orders = trades.filter((t) => nyDate(t.ranAt) === day).reverse(); // oldest first
  const buys = orders.filter((o) => o.side === "buy");
  const sells = orders.filter((o) => o.side === "sell");
  const quiet = entries.filter((e) => e.orders.length === 0).length;
  const parts: string[] = [];

  parts.push(
    orders.length
      ? `${orders.length} trade${orders.length === 1 ? "" : "s"}: ${[
          sells.length && `sold ${list(sells.map((o) => `${o.symbol} (${shortReason(o.reason).toLowerCase()})`))}`,
          buys.length && `bought ${list(buys.map((o) => o.symbol))}`,
        ]
          .filter(Boolean)
          .join("; ")}.`
      : "No trades.",
  );
  const since = time(entries[entries.length - 1].ranAt);
  parts.push(`${entries.length} check${entries.length === 1 ? "" : "s"} logged since ${since}, ${quiet} with nothing to do.`);

  // The day's move, from the account's daily values (the "now" point stands
  // in for today until the close).
  const i = history.findIndex((p) => p.date === day);
  if (i > 0) {
    const acct = history[i].equity / history[i - 1].equity - 1;
    const spy = history[i].spy / history[i - 1].spy - 1;
    parts.push(`Account ${signed(acct)} (${formatCurrency(history[i].equity - history[i - 1].equity)}) vs. S&P 500 ${signed(spy)}.`);
  }

  const last = entries[0];
  if (last?.skipped.length) parts.push(`Held back on new buys: ${passedReasons(last)}.`);
  return parts.join(" ");
}

// --- Table -----------------------------------------------------------------

function Detail({ e }: { e: RunReport }) {
  return (
    <div className="grid gap-3 py-2 text-xs leading-5 text-zinc-400 sm:grid-cols-2">
      <div>
        <p className="text-[10px] caps text-zinc-500">Holdings checked</p>
        <ul className="mt-0.5 space-y-0.5">
          {e.orders
            .filter((o) => o.side === "sell")
            .map((o) => (
              <li key={`s-${o.symbol}`}>
                <span className="text-bad">sold</span> <span className="text-foreground">{o.symbol}</span>: {o.reason}
              </li>
            ))}
          {e.kept.map((k) => (
            <li key={k.symbol}>
              <span className="text-foreground">{k.symbol}</span> kept: {k.reason}
            </li>
          ))}
          {e.kept.length === 0 && !e.orders.some((o) => o.side === "sell") && <li>No holdings.</li>}
        </ul>
      </div>
      <div>
        <p className="text-[10px] caps text-zinc-500">Buy candidates</p>
        <ul className="mt-0.5 space-y-0.5">
          {e.orders
            .filter((o) => o.side === "buy")
            .map((o) => (
              <li key={`b-${o.symbol}`}>
                <span className="text-good">bought</span> {o.qty} <span className="text-foreground">{o.symbol}</span> at{" "}
                {formatCurrency(o.price)}: {o.reason}
              </li>
            ))}
          {e.skipped.map((s) => (
            <li key={s.symbol}>
              <span className="text-foreground">{s.symbol}</span> (score {s.score}) passed: {s.reason}
            </li>
          ))}
          {e.skipped.length === 0 && !e.orders.some((o) => o.side === "buy") && <li>None scored high enough.</li>}
        </ul>
        {e.failed.length > 0 && <p className="mt-1 text-bad">Failed: {e.failed.join("; ")}</p>}
      </div>
    </div>
  );
}

function DayTable({
  day,
  entries,
  history,
  trades,
}: {
  day: string;
  entries: RunReport[];
  history: HistoryPoint[];
  trades: AlgoTrade[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? entries : entries.slice(0, ROWS_PER_DAY);
  const closed = marketClosedFor(day);
  return (
    <>
      <div className="mt-3 rounded-[var(--radius-sm)] border border-border px-3 py-2">
        <p className="text-[10px] caps text-accent">{closed ? "Day summary · market closed" : "So far today"}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-400">{daySummary(day, entries, history, trades)}</p>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className={tableHeadRowClass}>
              <th className={tableHeadCellClass}>Time</th>
              <th className={tableHeadCellClass}>Decision</th>
              <th className={`${tableHeadCellClass} text-right`}>Holdings</th>
              <th className={`${tableHeadCellClass} text-right`}>Candidates</th>
              <th className={`${tableHeadCellClass} pl-4`}>Why</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => {
              const d = decision(e);
              const sold = e.orders.filter((o) => o.side === "sell").length;
              const bought = e.orders.filter((o) => o.side === "buy").length;
              const isOpen = open === e.ranAt;
              return (
                <Fragment key={e.ranAt}>
                  <tr
                    className={`${tableRowClass} cursor-pointer hover:bg-accent/5`}
                    onClick={() => setOpen(isOpen ? null : e.ranAt)}
                    aria-expanded={isOpen}
                  >
                    <td className={`${tableCellClass} whitespace-nowrap`}>
                      <span aria-hidden className={`mr-1.5 inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                      {time(e.ranAt)}
                    </td>
                    <td className={`py-1 text-xs ${d.acted ? "text-accent" : "text-zinc-500"}`}>{d.text}</td>
                    <td className={`${tableCellClass} whitespace-nowrap text-right`}>
                      {e.kept.length} kept{sold ? ` · ${sold} sold` : ""}
                    </td>
                    <td className={`${tableCellClass} whitespace-nowrap text-right`}>
                      {bought ? `${bought} bought · ` : ""}
                      {e.skipped.length} passed
                    </td>
                    <td className={`${tableCellClass} min-w-[240px] pl-4`}>{why(e)}</td>
                  </tr>
                  {isOpen && (
                    <tr className={tableRowClass}>
                      <td colSpan={5} className="pl-5">
                        <Detail e={e} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {entries.length > ROWS_PER_DAY && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-xs text-accent underline decoration-border underline-offset-4 hover:decoration-accent"
        >
          {showAll ? "Show fewer" : `Show all ${entries.length} checks`}
        </button>
      )}
    </>
  );
}

export default function DecisionLog({ history, trades }: { history: HistoryPoint[]; trades: AlgoTrade[] }) {
  const [entries, setEntries] = useState<RunReport[] | null>(null);

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

  // Newest day first; entries arrive newest first already.
  const days = new Map<string, RunReport[]>();
  for (const e of entries ?? []) {
    const d = nyDate(e.ranAt);
    days.set(d, [...(days.get(d) ?? []), e]);
  }

  return (
    <>
      {entries === null && (
        <Collapsible label="decisions" defaultOpen>
          <p className="py-2 text-xs text-zinc-500">Loading...</p>
        </Collapsible>
      )}
      {entries?.length === 0 && (
        <Collapsible label="decisions" defaultOpen>
          <p className="py-2 text-xs text-zinc-500">No checks logged yet. They appear here from the next check during market hours.</p>
        </Collapsible>
      )}
      {[...days].map(([day, list], i) => (
        <Collapsible
          key={day}
          label={i === 0 ? `decisions · ${dayLabel(day)}` : dayLabel(day)}
          description={
            i === 0
              ? "What the algorithm decided at each 15-minute check, newest first. Click a row for every holding and candidate behind the decision."
              : undefined
          }
          meta={`${list.length} checks`}
          defaultOpen={i === 0}
        >
          <DayTable day={day} entries={list} history={history} trades={trades} />
        </Collapsible>
      ))}
    </>
  );
}
