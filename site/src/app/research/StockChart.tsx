"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { formatPercent } from "@/lib/format";
import { ChartLoading } from "@/components/ui";
import type { PricePoint } from "./PriceChart";

const PriceChart = dynamic(() => import("./PriceChart"), {
  ssr: false,
  loading: () => <ChartLoading className="h-48 sm:h-56" />,
});

const RANGES = ["1D", "5D", "1M", "6M", "1Y", "5Y"] as const;
type Range = (typeof RANGES)[number];

const RANGE_WORDS: Record<Range, string> = {
  "1D": "today",
  "5D": "past 5 days",
  "1M": "past month",
  "6M": "past 6 months",
  "1Y": "past year",
  "5Y": "past 5 years",
};

type ChartData = { range: Range; points: PricePoint[]; baseline: number; marketOpen: boolean };

const LIVE_RANGES = new Set<Range>(["1D", "5D"]);
const LIVE_MS = 30_000;

// Price chart for the researched ticker. Keyed by ticker where it's
// rendered, so a new search starts fresh.
export function StockChart({ ticker }: { ticker: string }) {
  const [range, setRange] = useState<Range>("1Y");
  const [data, setData] = useState<ChartData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped every 30s while live, which re-runs the fetch below.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/research/chart?symbol=${encodeURIComponent(ticker)}&range=${range}&tick=${tick}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Couldn't load the chart");
        return body as ChartData;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, range, tick]);

  // Live only for 1D and 5D while the market is open, and only while the tab
  // is visible, so a forgotten background tab doesn't keep polling.
  const live = !!data && data.range === range && data.marketOpen && LIVE_RANGES.has(range);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (!document.hidden) setTick((t) => t + 1);
    }, LIVE_MS);
    return () => clearInterval(id);
  }, [live]);

  // Only trust data for the range currently selected; the previous range's
  // line stays out of view while the next one loads.
  const current = data?.range === range ? data : null;
  const last = current?.points[current.points.length - 1]?.c;
  const change = current && last != null ? last - current.baseline : null;
  const up = (change ?? 0) >= 0;

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="tablist" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={r === range}
              onClick={() => {
                setRange(r);
                setError(null);
              }}
              className={`rounded-[var(--radius-sm)] px-2 py-0.5 text-[11px] caps transition-colors ${
                r === range ? "bg-accent/15 text-accent" : "text-zinc-500 hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        {change != null && current && (
          <span className={`text-xs tabular-nums ${up ? "text-good" : "text-bad"}`}>
            {up ? "+" : "-"}${Math.abs(change).toFixed(2)} ({up ? "+" : ""}
            {formatPercent(change / current.baseline, { decimals: 2 })})
            <span className="ml-1.5 text-[10px] caps text-zinc-500">{RANGE_WORDS[range]}</span>
            {live && (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] caps text-zinc-500" title="Updates every 30 seconds while the market is open">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--status-good)]" />
                Live
              </span>
            )}
          </span>
        )}
      </div>

      <div className="mt-2">
        {error ? (
          <p className="py-10 text-center text-xs text-zinc-500">{error}</p>
        ) : current ? (
          <PriceChart points={current.points} range={range} baseline={current.baseline} up={up} />
        ) : (
          <ChartLoading className="h-48 sm:h-56" />
        )}
      </div>
    </div>
  );
}
