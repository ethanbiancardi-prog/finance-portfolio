"use client";

// The Support Levels card in the Search tab: price floors where this stock
// has stopped falling and bounced before, plus the 50- and 200-day moving
// averages. Data: /api/research/support (math in lib/supportLevels.ts).
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import type { SupportResult } from "@/lib/supportLevels";

type Data = SupportResult & { symbol: string; price: number; asOf: string; historyFrom: string };

const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${Math.abs(n * 100).toFixed(1)}% ${n < 0 ? "below" : "above"}`;
const date = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// More bounces at the same price = buyers keep stepping in there.
function strength(touches: number) {
  if (touches >= 3) return { label: `Strong: held ${touches} times`, color: "var(--status-good)" };
  if (touches === 2) return { label: "Held twice", color: "var(--status-average)" };
  return { label: "Tested once", color: "var(--status-bad)" };
}

export function SupportLevels({ ticker }: { ticker: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Keyed by ticker where it's rendered, so a new ticker mounts it fresh.
    let cancelled = false;
    fetch(`/api/research/support?symbol=${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (failed)
    return (
      <Card className="mt-4" padding="sm">
        <p className="text-[11px] text-zinc-500">
          <span className="text-foreground">Support levels:</span> price history for {ticker} isn&apos;t available right now.
        </p>
      </Card>
    );
  if (!data) return null;

  return (
    <Card as="section" className="mt-4" padding="sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] caps text-zinc-500">Support levels</p>
        <p className="text-[11px] text-zinc-500">
          Price now <span className="tabular-nums text-foreground">{usd(data.price)}</span>
        </p>
      </div>

      {data.levels.length === 0 ? (
        <p className="mt-2 text-sm">
          The price is below every bounce point since {date(data.historyFrom)}, so there&apos;s no support level in that history.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border/60">
          {data.levels.map((l) => {
            const s = strength(l.touches);
            return (
              // Phone: two columns (price | distance, strength | date). Wider: one aligned row.
              <li
                key={l.price}
                className="grid grid-cols-2 items-baseline gap-x-4 gap-y-1 py-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)]"
              >
                <span className="text-xl tabular-nums">
                  {/* A zone of several nearby bounces shows as a range. */}
                  {l.price / l.bottom - 1 > 0.01 ? `${usd(l.bottom)} – ${usd(l.price)}` : usd(l.price)}
                </span>
                <span className="text-right text-xs tabular-nums text-zinc-500 sm:text-left">{pct(l.distancePct)}</span>
                <span className="text-xs" style={{ color: s.color }}>
                  {s.label}
                </span>
                <span className="text-right text-[11px] text-zinc-500">
                  last bounce {date(l.lastDate)}
                  {l.recent && " (recent, not yet confirmed)"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {data.movingAverages.length > 0 && (
        <div className="mt-3 grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-2">
          {data.movingAverages.map((m) => (
            <div key={m.days}>
              <p className="text-[10px] caps text-zinc-500">{m.days}-day average</p>
              <p className="text-sm tabular-nums">
                {usd(m.value)} <span className="text-xs text-zinc-500">{pct(m.distancePct)}</span>
              </p>
              <p className="text-[11px]" style={{ color: m.role === "support" ? "var(--status-good)" : "var(--status-bad)" }}>
                {m.role === "support" ? "Below the price: acting as support" : "Above the price: often acts as resistance (a ceiling)"}
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-5 text-zinc-500">
        <span className="text-foreground">What this is:</span> prices where {ticker} stopped falling and bounced back up in the past
        3 years (the lowest day within 5 trading days on each side). Bounces close together are grouped into one zone, shown as a
        range. More bounces in a zone means buyers kept stepping in there. A pattern from past prices, not a forecast: strong news can push a
        price straight through. Educational, not investment advice. Daily prices from {date(data.historyFrom)}, latest price{" "}
        {date(data.asOf)}.
      </p>
    </Card>
  );
}
