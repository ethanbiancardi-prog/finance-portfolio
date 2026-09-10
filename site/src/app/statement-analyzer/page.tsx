"use client";

import { useState } from "react";
import { formatCurrencyCompact, formatPercent, formatRatio } from "@/lib/format";
import {
  Button,
  Callout,
  Card,
  Chip,
  PageShell,
  SectionHeader,
  StatCard,
  StatusBadge,
  Tabs,
  TickerSearch,
  type Rating,
} from "@/components/ui";

type Company = { cik: number; ticker: string; title: string };

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

type Dashboard = {
  periodEnd: string | null;
  priorPeriodEnd: string | null;
  revenue: number | null;
  revenuePrior: number | null;
  revenueGrowth: number | null;
  netIncome: number | null;
  ratios: Ratio[];
};

const CATEGORIES = [
  { key: "tech", label: "Tech" },
  { key: "biotech", label: "Biotech" },
  { key: "healthcare", label: "Healthcare" },
  { key: "consumer", label: "Consumer" },
  { key: "energy", label: "Energy" },
  { key: "sustainability", label: "Sustainability" },
];

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
            <th className="py-1 text-[10px] font-normal uppercase tracking-[0.14em] text-zinc-500">Ratio</th>
            <th className="py-1 text-right text-[10px] font-normal uppercase tracking-[0.14em] text-zinc-500">Current</th>
            <th className="py-1 pl-4 text-right text-[10px] font-normal uppercase tracking-[0.14em] text-zinc-500">Prior</th>
            <th className="py-1 pl-5 text-[10px] font-normal uppercase tracking-[0.14em] text-zinc-500">Flag</th>
          </tr>
        </thead>
        <tbody>
          {ratios.map((ratio) => {
            const rating = rateRatio(ratio.label, ratio.value);
            return (
              <tr key={ratio.label} className="border-b border-border/50 align-top last:border-b-0 hover:bg-accent/[0.06]">
                <td className="py-1.5 pr-3">
                  <p className="text-xs text-foreground">{ratio.label}</p>
                  <p className="mt-0.5 max-w-md text-[10px] leading-4 text-zinc-600">{ratio.description}</p>
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

function Dashboard({ company, dashboard }: { company: Company; dashboard: Dashboard }) {
  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm text-foreground">
          <span className="text-accent">{company.ticker}</span>
          <span className="ml-2 text-zinc-500">{company.title}</span>
        </h3>
        <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
          FY end {dashboard.periodEnd ?? "N/A"}
        </span>
      </div>

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
    </Card>
  );
}

type RedFlag = { pattern: string; why: string };

function RedFlagsPanel({ ticker }: { ticker: string }) {
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

  return (
    <Card className="mt-4">
      <SectionHeader
        label="red flags"
        description="Checks for revenue up while cash flow is down, rising debt with falling interest coverage, inventory outpacing revenue, heavy reliance on non-GAAP figures, and going-concern language."
      />
      <Button onClick={scan} loading={loading} loadingLabel="Scanning..." className="mt-3">
        Scan for Red Flags
      </Button>

      {error && <p className="mt-3 text-xs text-bad">{error}</p>}

      {flags && (
        <div className="mt-4">
          {flags.length === 0 ? (
            <p className="text-xs text-good">-- no red flags detected against the checks above</p>
          ) : (
            <div className="space-y-2">
              {flags.map((flag, i) => (
                <Callout key={i} title={flag.pattern}>
                  {flag.why}
                </Callout>
              ))}
            </div>
          )}
          <p className="mt-3 text-[10px] uppercase tracking-[0.1em] text-zinc-600">
            AI-generated — verify against the actual filing before relying on it.
          </p>
        </div>
      )}
    </Card>
  );
}

export default function StatementAnalyzer() {
  const [tab, setTab] = useState<"search" | "browse">("search");

  const [ticker, setTicker] = useState("");
  const [company, setCompany] = useState<Company | null>(null);
  const [dashboard, setDashboardData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [category, setCategory] = useState(CATEGORIES[0].key);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  async function lookup(symbol: string) {
    setLoading(true);
    setError("");
    setDashboardData(null);

    const res = await fetch(`/api/statement-analyzer/lookup?ticker=${symbol}`);
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Lookup failed");
      setLoading(false);
      return;
    }

    setCompany(data.company);
    setDashboardData(data.dashboard);
    setLoading(false);
  }

  async function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    lookup(ticker);
  }

  async function loadCategory(key: string) {
    setCategory(key);
    setBrowseLoading(true);
    setCompanies([]);

    const res = await fetch(`/api/statement-analyzer/industry?category=${key}`);
    const data = await res.json();
    setCompanies(data.companies ?? []);
    setBrowseLoading(false);
  }

  return (
    <PageShell
      eyebrow="10-k analyzer"
      title="10-K Analyzer"
      description="Liquidity, leverage, profitability, and efficiency ratios pulled straight from SEC EDGAR."
    >
      <div className="mt-4">
        <Tabs
          tabs={[
            { key: "search", label: "Search" },
            { key: "browse", label: "Browse by Industry" },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === "search" && (
        <section className="mt-4">
          <form onSubmit={submitSearch} className="flex items-end gap-3">
            <TickerSearch
              label="Ticker or company"
              value={ticker}
              onChange={setTicker}
              onSelect={lookup}
              endpoint="/api/statement-analyzer/search"
              required
              wrapperClassName="w-64 max-w-full"
            />
            <Button type="submit">Analyze</Button>
          </form>

          {loading && <p className="mt-4 text-xs text-zinc-500"><span className="cursor-blink">▌</span> fetching filing</p>}
          {error && <p className="mt-4 text-xs text-bad">{error}</p>}
          {dashboard && company && (
            <>
              <Dashboard company={company} dashboard={dashboard} />
              <RedFlagsPanel key={company.ticker} ticker={company.ticker} />
            </>
          )}
        </section>
      )}

      {tab === "browse" && (
        <section className="mt-4">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <Chip key={c.key} active={category === c.key} onClick={() => loadCategory(c.key)}>
                {c.label}
              </Chip>
            ))}
          </div>

          {browseLoading && <p className="mt-4 text-xs text-zinc-500"><span className="cursor-blink">▌</span> loading</p>}

          <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {companies.map((c) => (
              <Card
                key={c.cik}
                as="button"
                padding="sm"
                interactive
                onClick={() => {
                  setTab("search");
                  setTicker(c.ticker);
                  lookup(c.ticker);
                }}
              >
                <p className="text-xs text-accent">{c.ticker}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{c.title}</p>
              </Card>
            ))}
            {!browseLoading && companies.length === 0 && (
              <p className="text-xs text-zinc-500">-- pick a category to see companies</p>
            )}
          </div>
        </section>
      )}
    </PageShell>
  );
}
