"use client";

import { useState } from "react";
import { formatCurrencyCompact, formatPercent, formatRatio } from "@/lib/format";
import {
  Button,
  Callout,
  Card,
  Chip,
  Field,
  PageShell,
  SectionHeader,
  StatCard,
  StatusBadge,
  Tabs,
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
    <div className="mt-6">
      <SectionHeader label={group.toLowerCase()} />
      <div className="mt-2">
        {ratios.map((ratio, i) => (
          <div
            key={ratio.label}
            className={`py-3 ${i === 0 ? "" : "border-t border-zinc-200 dark:border-zinc-800"}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-sm font-medium text-black dark:text-zinc-50">{ratio.label}</p>
              <div className="flex items-baseline gap-3 text-sm tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  {formatRatioValue(ratio.value, ratio.format)}
                  <StatusBadge rating={rateRatio(ratio.label, ratio.value)} />
                </span>
                <span className="text-xs text-zinc-400 dark:text-zinc-600">
                  prior: {formatRatioValue(ratio.prior, ratio.format)}
                </span>
              </div>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{ratio.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard({ company, dashboard }: { company: Company; dashboard: Dashboard }) {
  return (
    <Card className="mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-medium text-black dark:text-zinc-50">
          {company.title} ({company.ticker})
        </h3>
        <span className="text-xs text-zinc-500">FY end {dashboard.periodEnd ?? "N/A"}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
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
    <Card className="mt-6">
      <SectionHeader
        label="red flags"
        description="Checks for revenue up while cash flow is down, rising debt with falling interest coverage, inventory outpacing revenue, heavy reliance on non-GAAP figures, and going-concern language."
      />
      <Button onClick={scan} loading={loading} loadingLabel="Scanning..." className="mt-4">
        Scan for Red Flags
      </Button>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      {flags && (
        <div className="mt-4">
          {flags.length === 0 ? (
            <p className="text-sm text-zinc-500">No red flags detected against the checks above.</p>
          ) : (
            <div className="space-y-3">
              {flags.map((flag, i) => (
                <Callout key={i} title={flag.pattern}>
                  {flag.why}
                </Callout>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-zinc-500">
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
      <div className="mt-6">
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
        <section className="mt-6">
          <form onSubmit={submitSearch} className="flex items-end gap-3">
            <Field
              label="Ticker"
              placeholder="AAPL"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              required
              className="w-32"
            />
            <Button type="submit">Analyze</Button>
          </form>

          {loading && <p className="mt-4 text-sm text-zinc-500">Loading...</p>}
          {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
          {dashboard && company && (
            <>
              <Dashboard company={company} dashboard={dashboard} />
              <RedFlagsPanel key={company.ticker} ticker={company.ticker} />
            </>
          )}
        </section>
      )}

      {tab === "browse" && (
        <section className="mt-6">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Chip key={c.key} active={category === c.key} onClick={() => loadCategory(c.key)}>
                {c.label}
              </Chip>
            ))}
          </div>

          {browseLoading && <p className="mt-4 text-sm text-zinc-500">Loading...</p>}

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                <p className="font-medium text-black dark:text-zinc-50">{c.ticker}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{c.title}</p>
              </Card>
            ))}
            {!browseLoading && companies.length === 0 && (
              <p className="text-sm text-zinc-500">Pick a category to see companies.</p>
            )}
          </div>
        </section>
      )}
    </PageShell>
  );
}
