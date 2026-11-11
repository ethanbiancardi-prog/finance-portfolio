"use client";

// The Relative Price Score card in the Search tab: how this stock's price
// performance over the past year (weighted towards recent months) ranks
// against ~1,700 US stocks and against its own sector, 1-99. 80+ is strong.
// Data: /api/research/relative (lib/growthScreen.ts).
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

type Score = { inList: boolean; score?: number | null; sectorScore?: number | null; sector?: string; priceDay: string };

const color = (s: number | null | undefined) =>
  s == null ? undefined : s >= 80 ? "var(--status-good)" : s >= 50 ? "var(--status-average)" : "var(--status-bad)";

function Gauge({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] caps text-zinc-500">{label}</p>
        <p className="text-xl tabular-nums" style={{ color: color(value) }}>
          {value ?? "N/A"}
        </p>
      </div>
      <div className="relative mt-1 h-1.5 rounded-full bg-border/60">
        {value != null && <div className="h-1.5 rounded-full" style={{ width: `${value}%`, background: color(value) }} />}
        {/* The 80 line: the books' bar for a strong stock. */}
        <span className="absolute -top-0.5 h-2.5 w-px bg-foreground/60" style={{ left: "80%" }} aria-hidden />
      </div>
    </div>
  );
}

export function RelativeScore({ ticker }: { ticker: string }) {
  const [data, setData] = useState<Score | null>(null);

  useEffect(() => {
    // Keyed by ticker where it's rendered, so a new ticker mounts it fresh.
    let cancelled = false;
    fetch(`/api/research/relative?symbol=${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setData(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (!data) return null;
  if (!data.inList)
    return (
      <Card className="mt-4" padding="sm">
        <p className="text-[11px] text-zinc-500">
          <span className="text-foreground">Relative Price Score:</span> calculated for US stocks worth about $2B or more, and {ticker} isn&apos;t on that list.
        </p>
      </Card>
    );

  const s = data.score;
  const verdict =
    s == null ? "Not enough price history yet." : s >= 80 ? "Strong: beating most of the market." : s >= 50 ? "Middle of the pack." : "Weak: lagging most of the market.";
  return (
    <Card as="section" className="mt-4" padding="sm">
      <p className="text-[11px] caps text-zinc-500">Relative Price Score</p>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <Gauge label="vs the market" value={data.score} />
        <Gauge label={`vs ${data.sector ?? "its sector"}`} value={data.sectorScore} />
      </div>
      <p className="mt-2 text-[11px] leading-5 text-zinc-500">
        <span className="text-foreground">{verdict}</span> A score of {s ?? "N"} means its price did better than about {s ?? "N"}% of
        the ~1,700 biggest US stocks over the past year, with the latest 3 months counting double. Growth-investing books treat 80+ (the line on
        each bar) as a sign of a market leader. A measure of past price strength, not a forecast. Prices as of {data.priceDay}.
      </p>
    </Card>
  );
}
