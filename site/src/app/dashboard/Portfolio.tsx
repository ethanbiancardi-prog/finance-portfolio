"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { formatCurrency, formatPercent } from "@/lib/format";
import { Card, ChartLoading, SectionHeader, StatCard } from "@/components/ui";
import type { PortfolioSummary } from "@/lib/portfolio";

const PortfolioChart = dynamic(() => import("./PortfolioChart"), {
  ssr: false,
  loading: () => <ChartLoading className="h-56" />,
});

// Signed percentage change against the starting cash, coloured good/bad.
function Change({ value, base }: { value: number; base: number }) {
  const pct = (value - base) / base;
  return (
    <span style={{ color: `var(--status-${pct >= 0 ? "good" : "bad"})` }}>
      {pct >= 0 ? "+" : ""}
      {formatPercent(pct, { decimals: 2 })}
    </span>
  );
}

export default function Portfolio() {
  const [data, setData] = useState<PortfolioSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/portfolio");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not load your portfolio.");
        return;
      }
      setError(null);
      setData(body);
    }
    load();
    // Prices move while the market is open; match the paper-trading page.
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  const opened = data && new Date(data.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <section className="mt-4" id="portfolio">
      <SectionHeader
        label="your paper portfolio"
        description={
          data
            ? `Every account starts with ${formatCurrency(data.startingCash)} of simulated cash. Opened ${opened}. Compared against putting the same amount into SPY that day.`
            : "Every account starts with $100,000 of simulated cash."
        }
      />

      {error && (
        <Card className="mt-3" padding="sm">
          <p className="text-xs text-bad">{error}</p>
        </Card>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard card label="Starting cash" value={data ? formatCurrency(data.startingCash) : "..."} />
        <StatCard
          card
          label="Account value"
          term="equity"
          value={data ? formatCurrency(data.equity) : "..."}
          hint={data && <Change value={data.equity} base={data.startingCash} />}
        />
        <StatCard card label="Cash" value={data ? formatCurrency(data.cash) : "..."} />
        <StatCard
          card
          label="Same $ in SPY"
          value={data ? formatCurrency(data.spyEquity) : "..."}
          hint={data && <Change value={data.spyEquity} base={data.startingCash} />}
        />
      </div>

      {data && <PortfolioChart history={data.history} />}

      {data && data.positions.length === 0 && (
        <p className="mt-2 text-[11px] leading-5 text-zinc-500">
          No trades yet, so your line stays flat at your starting cash while SPY moves. Trading
          from this page is coming next.
        </p>
      )}
    </section>
  );
}
