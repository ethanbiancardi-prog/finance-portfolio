"use client";

import { useEffect, useState } from "react";
import { scoreStock, type MeterMarketInputs, type MeterReading } from "@/lib/stockMeter";
import { StatusDot, type Rating } from "@/components/ui";
import { rateRatio, type Dashboard } from "./Fundamentals";
import type { Playbook } from "./PlaybookPanel";

// Which way one reading leans. The dead zone around zero keeps a reading
// that's barely positive from being called bullish.
function lean(score: number | null): { rating: Rating | null; label: string } {
  if (score === null) return { rating: null, label: "" };
  if (score > 0.2) return { rating: "good", label: "Bullish" };
  if (score < -0.2) return { rating: "bad", label: "Bearish" };
  return { rating: "average", label: "Neutral" };
}

// Bull/Bear Meter for the searched stock. Combines what the research page
// already gathered (ratios, playbook, red-flag scan) with free price and
// Congress-trade inputs from /api/research/meter. Recomputes whenever any of
// them arrives. Formulas: lib/stockMeter.ts.
export function StockMeter({
  ticker,
  dashboard,
  playbook,
  redFlags,
}: {
  ticker: string;
  dashboard: Dashboard;
  playbook: Playbook | null;
  redFlags: number | null;
}) {
  const [market, setMarket] = useState<MeterMarketInputs | null>(null);
  const [marketFailed, setMarketFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/research/meter?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((m: MeterMarketInputs) => !cancelled && setMarket(m))
      .catch(() => !cancelled && setMarketFailed(true));
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const ratings = dashboard.ratios.map((r) => rateRatio(r.label, r.value)).filter((r): r is Rating => r !== null);
  const catalysts = playbook?.catalysts ?? null;
  const { score, label, readings } = scoreStock({
    // A failed fetch counts as "not available" rather than loading forever.
    market: market ?? (marketFailed ? { ticker, trendGap: null, momentum: null, priceAsOf: null, congress: null } : null),
    ratios: { good: ratings.filter((r) => r === "good").length, bad: ratings.filter((r) => r === "bad").length, rated: ratings.length },
    revenueGrowth: dashboard.revenueGrowth,
    periodEnd: dashboard.periodEnd,
    health: playbook?.financialHealth.verdict ?? null,
    catalysts: catalysts && {
      positive: catalysts.filter((c) => c.direction === "positive").length,
      negative: catalysts.filter((c) => c.direction === "negative").length,
      mixed: catalysts.filter((c) => c.direction === "mixed").length,
    },
    playbookAsOf: playbook?.generatedAt.slice(0, 10) ?? null,
    redFlags,
  });
  const used = readings.filter((r) => r.score !== null).length;
  const loading = readings.some((r) => r.pending);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[10px] caps text-zinc-500">Bull / bear meter</span>
        <span className="text-2xl tabular-nums tracking-tight text-foreground">{score ?? "–"}</span>
        <span className="text-xs text-foreground">{label}</span>
        <span className="text-[10px] text-zinc-500">
          from {used} of {readings.length} readings{loading ? " · updating as the page loads" : ""}
        </span>
      </div>

      {/* Diverging track: bearish red on the left, neutral gray in the middle,
          bullish green on the right. The number and label carry the meaning,
          so color is never the only cue. */}
      <div
        className="relative mt-2 h-2 rounded-full"
        style={{ background: "linear-gradient(to right, var(--status-bad), var(--border) 50%, var(--status-good))" }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score ?? 50}
        aria-label={`Bull/bear meter for ${ticker}`}
      >
        {score !== null && (
          <span
            className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-[var(--panel)] transition-[left] duration-700 ease-out"
            style={{ left: `${score}%` }}
            title={`${score} out of 100`}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] caps text-zinc-500">
        <span>Bearish</span>
        <span>Neutral</span>
        <span>Bullish</span>
      </div>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mt-2 text-[11px] text-zinc-500 underline decoration-border underline-offset-4 hover:text-foreground"
      >
        {open ? "Hide how it's scored" : "How it's scored"}
      </button>

      {open && (
        <div className="mt-2">
          <ul className="divide-y divide-border">
            {readings.map((r) => (
              <ReadingRow key={r.key} reading={r} />
            ))}
          </ul>
          <p className="mt-2 text-[10px] leading-4 text-zinc-500">
            Each reading is scored from -1 (bearish) to +1 (bullish); the meter is 50 + 50 × the average of the ones available. It sums up
            what this page found, it doesn&apos;t predict the price and isn&apos;t advice.
          </p>
        </div>
      )}
    </div>
  );
}

function ReadingRow({ reading: r }: { reading: MeterReading }) {
  const { rating, label } = lean(r.score);
  return (
    <li className="flex items-start justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="text-xs text-foreground">{r.label}</span>
        <span className="block text-[10px] leading-4 text-zinc-500">{r.why}</span>
        <span className="block text-[10px] leading-4 text-zinc-600">{r.source}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-xs tabular-nums text-foreground">{r.value}</span>
        {rating && (
          <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
            <StatusDot rating={rating} />
            {label}
          </span>
        )}
      </span>
    </li>
  );
}
