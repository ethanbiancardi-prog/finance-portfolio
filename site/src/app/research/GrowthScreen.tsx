"use client";

// The Growth Stocks tab on /research: every S&P 500 company against a strict
// growth-investing checklist (lib/growthScreen.ts), so the few that pass
// everything, and the near-misses, are easy to find. A research shortlist,
// not a buy list. Clicking a stock opens it in the Search tab.
import { useEffect, useMemo, useState } from "react";
import { Callout, Card, ChartLoading, Chip, SectionHeader, StatCard } from "@/components/ui";
import type { GrowthRow } from "@/lib/growthScreen";

type Screen = {
  rules: { profitGrowth: number; netMargin: number; roe: number; salesGrowth: number; nearHigh: number; marketScore: number; sectorScore: number };
  priceDay: string;
  fundamentals: { companies: number; oldest: string | null; newest: string | null };
  rows: GrowthRow[];
};

type CheckKey = keyof GrowthRow["checks"];

export default function GrowthScreen({ onResearch }: { onResearch: (symbol: string) => void }) {
  const [data, setData] = useState<Screen | null>(null);
  const [error, setError] = useState("");
  const [min, setMin] = useState(6);
  const [sector, setSector] = useState("All");
  const [open, setOpen] = useState<string | null>(null);
  const [strongOnly, setStrongOnly] = useState(false); // Relative Price Score 80+

  useEffect(() => {
    fetch("/api/research/growth")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "The screen couldn't load.");
        setData(body);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const CHECKS: { key: CheckKey; label: string; rule: string }[] = useMemo(() => {
    const r = data?.rules;
    const p = (x: number | undefined) => `${Math.round((x ?? 0) * 100)}%`;
    return [
      { key: "profitable", label: "Profitable", rule: "Made money over the past 12 months" },
      { key: "profitGrowth", label: "Profit growth", rule: `Profits up ${p(r?.profitGrowth)}+ a year on average for 3 years, and up every year` },
      { key: "margin", label: "Margins", rule: `Keeps ${p(r?.netMargin)}+ of sales as profit` },
      { key: "roe", label: "Return on equity", rule: `Earns ${p(r?.roe)}+ a year on shareholders' money (net income ÷ equity)` },
      { key: "sales", label: "Sales speeding up", rule: `Sales up ${p(r?.salesGrowth)}+ and growing faster than a year ago: the footprint a hit new product leaves` },
      { key: "leader", label: "Industry leader", rule: `Relative Price Score ${r?.marketScore ?? 80}+ against the S&P 500 and ${r?.sectorScore ?? 75}+ within its own sector` },
      { key: "chart", label: "Healthy chart", rule: `Above its 50- and 200-day averages and within ${p(r?.nearHigh)} of its 52-week high` },
    ];
  }, [data]);

  if (error) return <p className="mt-4 text-xs text-bad">{error}</p>;
  if (!data) return <ChartLoading className="mt-4 h-96" />;

  const sectors = ["All", ...[...new Set(data.rows.map((r) => r.sector))].sort()];
  const rows = data.rows.filter((r) => r.passed >= min && (sector === "All" || r.sector === sector) && (!strongOnly || (r.score ?? 0) >= 80));
  const count = (n: number) => data.rows.filter((r) => r.passed === n).length;
  const total = CHECKS.length;

  return (
    <>
      <Card as="section" className="mt-4">
        <SectionHeader
          label="growth stocks: the strict checklist"
          description="Every S&P 500 company against the growth-investing rules popularized by William O'Neil and Investor's Business Daily: fast, steady profit growth, high returns on equity, accelerating sales, an industry leader on a healthy chart. Very few big companies pass everything at once; that's the point. It's a shortlist to research, not a list to buy."
        />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard size="lg" label={`Pass all ${total}`} value={count(total)} hint={<span className="text-zinc-500">of {data.rows.length} companies</span>} />
          <StatCard size="lg" label={`Pass ${total - 1} of ${total}`} value={count(total - 1)} hint={<span className="text-zinc-500">near-misses</span>} />
          <StatCard size="lg" label="Profits up 25%+/yr" value={data.rows.filter((r) => r.checks.profitGrowth.pass).length} hint={<span className="text-zinc-500">the hardest check</span>} />
          <StatCard size="lg" label="Prices as of" value={data.priceDay} hint={<span className="text-zinc-500">filings refresh weekly</span>} />
        </div>
      </Card>

      <Card as="section" className="mt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-zinc-500">Show:</span>
          {[total, total - 1, total - 2, 0].map((n) => (
            <Chip key={n} active={min === n} onClick={() => setMin(n)}>
              {n === 0 ? "Every company" : n === total ? `All ${total} checks` : `${n}+ of ${total}`}
            </Chip>
          ))}
          <span className="ml-2" />
          <Chip active={strongOnly} onClick={() => setStrongOnly((v) => !v)} title="Relative Price Score of 80 or more: price beat 80%+ of the S&P 500 over the past year, recent months weighted most">
            Price score 80+
          </Chip>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sectors.map((s) => (
            <Chip key={s} active={sector === s} onClick={() => setSector(s)}>
              {s}
            </Chip>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="py-10 text-center text-xs text-zinc-500">No company passes that many checks{sector !== "All" ? ` in ${sector}` : ""} right now.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {rows.map((r) => (
              <li key={r.symbol} className="py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <button onClick={() => onResearch(r.symbol)} className="w-14 shrink-0 text-left text-xs font-semibold tabular-nums text-accent hover:underline" title={`Research ${r.symbol}`}>
                    {r.symbol}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {r.name} <span className="text-zinc-500">· {r.sector}</span>
                  </span>
                  <span
                    className="w-16 text-right text-[11px] tabular-nums"
                    title={`Relative Price Score: ${r.score ?? "N/A"} vs the S&P 500, ${r.sectorScore ?? "N/A"} within ${r.sector}. 80+ is strong.`}
                    style={{ color: r.score == null ? undefined : r.score >= 80 ? "var(--status-good)" : r.score >= 50 ? "var(--status-average)" : "var(--status-bad)" }}
                  >
                    Score {r.score ?? "–"}
                  </span>
                  <span className="flex gap-1" aria-label={`${r.passed} of ${total} checks passed`}>
                    {CHECKS.map((c) => {
                      const ch = r.checks[c.key];
                      return (
                        <span
                          key={c.key}
                          title={`${c.label}: ${ch.value}`}
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: ch.pass ? "var(--status-good)" : ch.pass === false ? "var(--status-bad)" : "var(--border)" }}
                        />
                      );
                    })}
                  </span>
                  <span className="w-10 text-right text-xs tabular-nums" style={{ color: r.passed === total ? "var(--status-good)" : undefined }}>
                    {r.passed}/{total}
                  </span>
                  <button onClick={() => setOpen(open === r.symbol ? null : r.symbol)} className="text-[11px] text-zinc-500 hover:text-accent" aria-expanded={open === r.symbol}>
                    {open === r.symbol ? "hide" : "details"}
                  </button>
                </div>
                {open === r.symbol && (
                  <ul className="mt-2 space-y-1 rounded-[var(--radius-sm)] border border-border p-3">
                    {CHECKS.map((c) => {
                      const ch = r.checks[c.key];
                      return (
                        <li key={c.key} className="flex gap-2 text-[11px]">
                          <span className="w-4 shrink-0" style={{ color: ch.pass ? "var(--status-good)" : ch.pass === false ? "var(--status-bad)" : undefined }}>
                            {ch.pass ? "✓" : ch.pass === false ? "✗" : "–"}
                          </span>
                          <span className="w-28 shrink-0 text-foreground">{c.label}</span>
                          <span className="min-w-0 flex-1 text-zinc-500">
                            <span className="text-foreground">{ch.value}</span> · {c.rule}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-zinc-500">
          &quot;Score&quot; is the Relative Price Score (1–99): how the stock&apos;s price did over the past year against the rest of the
          S&amp;P 500, with the latest 3 months counting double; 80+ (green) is strong. Dots, in order: {CHECKS.map((c) => c.label).join(" · ")}.
          Green = passes, red = fails, grey = no data. Hover a dot for the number.
        </p>
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Callout label="the checklist">
          <ul className="list-disc space-y-1 pl-4">
            {CHECKS.map((c) => (
              <li key={c.key}>
                <strong className="text-foreground">{c.label}:</strong> {c.rule}.
              </li>
            ))}
            <li>
              Not yet included: <strong className="text-foreground">institutional sponsorship</strong> (whether big funds are buying),
              which needs SEC 13F fund-holdings data.
            </li>
          </ul>
        </Callout>
        <Callout label="why it's a shortlist, not a buy list">
          In a backtest of these rules on the S&amp;P 500 since 2017 (projects/paper-trading/FUNDAMENTALS_BACKTEST.md), only a
          handful of companies passed on a typical day, so a bot that bought only full passes sat mostly in cash and earned less than
          the index. As a starting point for reading 10-Ks it&apos;s far more useful. Numbers come from SEC filings (profit growth uses
          total net income, so share buybacks don&apos;t count) and Alpaca prices. Not affiliated with Investor&apos;s Business Daily, and
          it doesn&apos;t reproduce their ratings. Educational, not investment advice.
        </Callout>
      </div>
    </>
  );
}
