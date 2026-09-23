"use client";

// 10-K fundamentals: ratio dashboard + AI red-flag scan. Extracted from the
// old /statement-analyzer page so the research tab can compose it with news
// and the persona panel.
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrencyCompact, formatPercent, formatRatio } from "@/lib/format";
import {
  Button,
  Callout,
  Section,
  SectionHeader,
  StatCard,
  StatusBadge,
  type Rating,
} from "@/components/ui";
import { JargonText, SimpleText } from "./SimpleMode";

export type Company = { cik: number; ticker: string; title: string };

type RatioFormat = "x" | "%" | "$";

type Ratio = {
  label: string;
  group: string;
  description: string;
  format: RatioFormat;
  value: number | null;
  prior: number | null;
};

// Groups render in this order regardless of the order the API returns them in.
const GROUP_ORDER = ["Liquidity", "Leverage", "Profitability", "Efficiency", "Cash Flow"];

export type Dashboard = {
  periodEnd: string | null;
  priorPeriodEnd: string | null;
  revenue: number | null;
  revenuePrior: number | null;
  revenueGrowth: number | null;
  netIncome: number | null;
  ratios: Ratio[];
};

function formatRatioValue(value: number | null, format: RatioFormat) {
  if (format === "%") return formatPercent(value);
  if (format === "$") return formatCurrencyCompact(value);
  return formatRatio(value);
}

// Rough, industry-agnostic gut-check thresholds — a capital-intensive company
// (utilities, manufacturing) will always look "bad" on asset turnover even
// when healthy for its sector. Useful for a quick scan, not a substitute for
// comparing against peers in the same industry. A ratio with no entry here
// (or a null value) shows "N/A" instead of a rating.
const RATING_THRESHOLDS: Record<string, { direction: "higher-is-better" | "lower-is-better"; good: number; bad: number }> = {
  "Current Ratio": { direction: "higher-is-better", good: 1.5, bad: 1.0 },
  "Quick Ratio": { direction: "higher-is-better", good: 1.0, bad: 0.5 },
  "Cash Ratio": { direction: "higher-is-better", good: 0.5, bad: 0.2 },
  "Debt-to-Equity": { direction: "lower-is-better", good: 1.0, bad: 2.0 },
  "Debt-to-Assets": { direction: "lower-is-better", good: 0.4, bad: 0.6 },
  // Below 1.5x is the classic lender red flag for debt-service risk.
  "Interest Coverage": { direction: "higher-is-better", good: 3.0, bad: 1.5 },
  "Gross Margin": { direction: "higher-is-better", good: 0.4, bad: 0.2 },
  "Operating Margin": { direction: "higher-is-better", good: 0.15, bad: 0.05 },
  "Net Margin": { direction: "higher-is-better", good: 0.15, bad: 0.05 },
  // ~15% ROE is the classic long-run "good business" bar.
  ROE: { direction: "higher-is-better", good: 0.15, bad: 0.05 },
  ROA: { direction: "higher-is-better", good: 0.05, bad: 0.02 },
  // ~10% is a common rough stand-in for a company's cost of capital — ROIC
  // above it means the business is creating value, not just growing.
  ROIC: { direction: "higher-is-better", good: 0.1, bad: 0.05 },
  "Asset Turnover": { direction: "higher-is-better", good: 1.0, bad: 0.5 },
  "Inventory Turnover": { direction: "higher-is-better", good: 6.0, bad: 2.0 },
  "Receivables Turnover": { direction: "higher-is-better", good: 8.0, bad: 4.0 },
  // Free cash flow's sign matters more than its size (which scales with
  // company size) — positive means the business generates more cash than it
  // reinvests, negative means it's burning cash.
  "Free Cash Flow": { direction: "higher-is-better", good: 0, bad: 0 },
  "Operating Cash Flow Margin": { direction: "higher-is-better", good: 0.15, bad: 0.05 },
};

function rateRatio(label: string, value: number | null): Rating | null {
  if (value == null) return null;
  const t = RATING_THRESHOLDS[label];
  if (!t) return null;

  if (t.direction === "higher-is-better") {
    if (value >= t.good) return "good";
    if (value < t.bad) return "bad";
    return "average";
  }
  if (value <= t.good) return "good";
  if (value > t.bad) return "bad";
  return "average";
}

function RatioGroup({ group, ratios }: { group: string; ratios: Ratio[] }) {
  if (ratios.length === 0) return null;
  return (
    <div className="mt-5">
      <SectionHeader label={group.toLowerCase()} />
      <table className="mt-2 w-full text-left">
        <thead>
          <tr className="border-b border-border">
            <th className="py-1 text-[10px] font-normal caps text-zinc-500">Ratio</th>
            <th className="py-1 text-right text-[10px] font-normal caps text-zinc-500">Current</th>
            <th className="py-1 pl-4 text-right text-[10px] font-normal caps text-zinc-500">Prior</th>
            <th className="py-1 pl-5 text-[10px] font-normal caps text-zinc-500">Flag</th>
          </tr>
        </thead>
        <tbody>
          {ratios.map((ratio) => {
            const rating = rateRatio(ratio.label, ratio.value);
            return (
              <tr key={ratio.label} className="border-b border-border/50 align-top last:border-b-0 hover:bg-accent/[0.06]">
                <td className="py-1.5 pr-3">
                  <p className="text-xs text-foreground">{ratio.label}</p>
                  <p className="mt-0.5 max-w-md text-[10px] leading-4 text-zinc-600"><JargonText text={ratio.description} /></p>
                </td>
                <td
                  className="py-1.5 text-right text-xs tabular-nums"
                  style={rating ? { color: `var(--status-${rating})` } : undefined}
                >
                  {formatRatioValue(ratio.value, ratio.format)}
                </td>
                <td className="py-1.5 pl-4 text-right text-xs tabular-nums text-zinc-500">
                  {formatRatioValue(ratio.prior, ratio.format)}
                </td>
                <td className="py-1.5 pl-5 text-xs">
                  <StatusBadge rating={rating} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Quote = { price: number; change: number | null; changePercent: number | null; asOf: string };

// Latest trade next to the annual numbers, with its timestamp, so it's
// obvious which figures are live and which are from the last 10-K. Keyed by
// ticker where it's rendered, so a new ticker remounts it with fresh state.
export function QuoteBadge({ ticker }: { ticker: string }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/research/quote?symbol=${encodeURIComponent(ticker)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("quote failed"))))
      .then((q) => {
        if (!cancelled) setQuote(q);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (failed) return null;
  if (!quote) return <span className="text-xs text-zinc-600">...</span>;

  const up = (quote.change ?? 0) >= 0;
  const asOf = new Date(quote.asOf).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return (
    <span className="text-xs tabular-nums">
      <span className="text-foreground">${quote.price.toFixed(2)}</span>
      {quote.changePercent != null && (
        <span className={`ml-2 ${up ? "text-good" : "text-bad"}`}>
          {up ? "+" : ""}
          {formatPercent(quote.changePercent)}
        </span>
      )}
      <span className="ml-2 text-[10px] caps text-zinc-500">as of {asOf}</span>
    </span>
  );
}

export function Dashboard({ company, dashboard }: { company: Company; dashboard: Dashboard }) {
  // Header line: the three headline numbers and how the 17 ratios score.
  const ratings = dashboard.ratios.map((r) => rateRatio(r.label, r.value)).filter((r): r is Rating => r !== null);
  const count = (k: Rating) => ratings.filter((r) => r === k).length;
  const summary = `Revenue ${formatCurrencyCompact(dashboard.revenue)}${dashboard.revenueGrowth != null ? ` (${dashboard.revenueGrowth >= 0 ? "+" : ""}${formatPercent(dashboard.revenueGrowth)} YoY)` : ""} · Net income ${formatCurrencyCompact(dashboard.netIncome)} · Ratios: ${count("good")} good, ${count("average")} average, ${count("bad")} weak`;

  return (
    <Section id="fundamentals" label="Fundamentals from the 10-K" status="ready" summary={summary}>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] caps text-zinc-500">
        <span>Annual figures from the 10-K for the fiscal year ending {dashboard.periodEnd ?? "N/A"}</span>
        <Link
          href={`/dcf-builder?ticker=${company.ticker}`}
          className="text-accent underline decoration-border underline-offset-4 hover:decoration-accent"
        >
          Build a DCF from this filing →
        </Link>
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-3">
        <StatCard label="Revenue" value={formatCurrencyCompact(dashboard.revenue)} />
        <StatCard label="Revenue Growth (YoY)" value={formatPercent(dashboard.revenueGrowth)} />
        <StatCard label="Net Income" value={formatCurrencyCompact(dashboard.netIncome)} />
      </div>

      {GROUP_ORDER.map((group) => (
        <RatioGroup
          key={group}
          group={group}
          ratios={dashboard.ratios.filter((r) => r.group === group)}
        />
      ))}
    </Section>
  );
}

type RedFlag = { pattern: string; why: string };

export function RedFlagsPanel({ ticker }: { ticker: string }) {
  const [flags, setFlags] = useState<RedFlag[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function scan() {
    setLoading(true);
    setError("");
    setFlags(null);

    const res = await fetch("/api/statement-analyzer/red-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker }),
    });

    if (!res.ok) {
      setError("Red-flag scan failed.");
      setLoading(false);
      return;
    }

    const data = await res.json();
    setFlags(data.flags ?? []);
    setLoading(false);
  }

  const summary = flags
    ? flags.length === 0
      ? "No red flags against the five accounting checks"
      : `${flags.length} red ${flags.length === 1 ? "flag" : "flags"}: ${flags.map((f) => f.pattern).join("; ")}`
    : loading
      ? undefined
      : "Not scanned yet, open to run five accounting checks against the 10-K";

  return (
    <Section id="red-flags" label="Red-flag scan" status={loading ? "loading" : flags ? "ready" : "idle"} summary={summary}>
      <p className="text-[11px] leading-5 text-zinc-500">
        Checks for revenue up while cash flow is down, rising debt with falling interest coverage, inventory outpacing revenue, heavy reliance on
        non-GAAP figures, and going-concern language.
      </p>
      <Button onClick={scan} loading={loading} loadingLabel="Scanning..." className="mt-3">
        Scan for Red Flags
      </Button>

      {error && <p className="mt-3 text-xs text-bad">{error}</p>}

      {flags && (
        <div className="mt-4">
          {flags.length === 0 ? (
            <p className="text-xs text-good">No red flags detected against the checks above</p>
          ) : (
            <div className="space-y-2">
              {flags.map((flag, i) => (
                <Callout key={i} title={flag.pattern}>
                  <SimpleText text={flag.why} context={`Accounting red flag: ${flag.pattern}`} />
                </Callout>
              ))}
            </div>
          )}
          <p className="mt-3 text-[10px] caps text-zinc-600">
            AI-generated, verify against the actual filing before relying on it.
          </p>
        </div>
      )}
    </Section>
  );
}

