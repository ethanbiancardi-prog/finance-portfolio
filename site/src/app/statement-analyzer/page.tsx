"use client";

import { useState } from "react";

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

const money = (value: number | null) =>
  value == null
    ? "N/A"
    : value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
      });

const percent = (value: number | null) => (value == null ? "N/A" : `${(value * 100).toFixed(1)}%`);

const ratioValue = (value: number | null) => (value == null ? "N/A" : value.toFixed(2));

function formatRatio(value: number | null, format: RatioFormat) {
  if (format === "%") return percent(value);
  if (format === "$") return money(value);
  return ratioValue(value);
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

type Rating = "good" | "average" | "bad";

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

const RATING_LABEL: Record<Rating, string> = { good: "Good", average: "Average", bad: "Bad" };

// Color lives only on the dot, never on the text — a colored number is hard
// to read at small sizes and unreadable for colorblind users without a label.
// Every ratio shows a badge: a rating when one applies, otherwise "N/A"
// (no threshold defined for this ratio, or the underlying data is missing).
function RatioValue({ label, value, format }: { label: string; value: number | null; format: RatioFormat }) {
  const rating = rateRatio(label, value);
  return (
    <span className="inline-flex items-center gap-1.5">
      {formatRatio(value, format)}
      <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
        {rating ? (
          <>
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: `var(--status-${rating})` }}
            />
            {RATING_LABEL[rating]}
          </>
        ) : (
          "N/A"
        )}
      </span>
    </span>
  );
}

function RatioGroup({ group, ratios }: { group: string; ratios: Ratio[] }) {
  if (ratios.length === 0) return null;
  return (
    <div className="mt-6">
      <h4 className="font-mono text-xs uppercase tracking-widest text-accent">
        {"// " + group.toLowerCase()}
      </h4>
      <div className="mt-2">
        {ratios.map((ratio, i) => (
          <div
            key={ratio.label}
            className={`py-3 ${i === 0 ? "" : "border-t border-zinc-200 dark:border-zinc-800"}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-sm font-medium text-black dark:text-zinc-50">{ratio.label}</p>
              <div className="flex items-baseline gap-3 text-sm">
                <RatioValue label={ratio.label} value={ratio.value} format={ratio.format} />
                <span className="text-xs text-zinc-400 dark:text-zinc-600">
                  prior: {formatRatio(ratio.prior, ratio.format)}
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
    <div className="mt-6 rounded-sm border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-medium text-black dark:text-zinc-50">
          {company.title} ({company.ticker})
        </h3>
        <span className="text-xs text-zinc-500">FY end {dashboard.periodEnd ?? "N/A"}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-zinc-500">Revenue</p>
          <p className="mt-1 font-medium text-black dark:text-zinc-50">{money(dashboard.revenue)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Revenue Growth (YoY)</p>
          <p className="mt-1 font-medium text-black dark:text-zinc-50">
            {percent(dashboard.revenueGrowth)}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Net Income</p>
          <p className="mt-1 font-medium text-black dark:text-zinc-50">{money(dashboard.netIncome)}</p>
        </div>
      </div>

      {GROUP_ORDER.map((group) => (
        <RatioGroup
          key={group}
          group={group}
          ratios={dashboard.ratios.filter((r) => r.group === group)}
        />
      ))}
    </div>
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
    <div className="mt-6 rounded-sm border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="font-mono text-xs uppercase tracking-widest text-accent">{"// red flags"}</h3>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Checks for revenue up while cash flow is down, rising debt with falling interest coverage,
        inventory outpacing revenue, heavy reliance on non-GAAP figures, and going-concern language.
      </p>
      <button
        onClick={scan}
        disabled={loading}
        className="mt-4 rounded-sm bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
      >
        {loading ? "Scanning..." : "Scan for Red Flags"}
      </button>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      {flags && (
        <div className="mt-4">
          {flags.length === 0 ? (
            <p className="text-sm text-zinc-500">No red flags detected against the checks above.</p>
          ) : (
            <div className="space-y-3">
              {flags.map((flag, i) => (
                <div key={i} className="rounded-sm border border-accent/40 bg-accent/5 p-4">
                  <p className="text-sm font-medium text-black dark:text-zinc-50">{flag.pattern}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{flag.why}</p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-zinc-500">
            AI-generated — verify against the actual filing before relying on it.
          </p>
        </div>
      )}
    </div>
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
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-14 sm:py-20">
        <div className="border-b border-zinc-200 pb-8 dark:border-zinc-800">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">
            {"// 10-k analyzer"}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            10-K Analyzer
          </h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Liquidity, leverage, profitability, and efficiency ratios pulled straight from SEC EDGAR.
          </p>
        </div>

        <div className="mt-6 flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setTab("search")}
            className={`font-mono text-xs uppercase tracking-wide px-3 py-2 ${
              tab === "search"
                ? "border-b-2 border-accent text-accent"
                : "text-zinc-500"
            }`}
          >
            Search
          </button>
          <button
            onClick={() => setTab("browse")}
            className={`font-mono text-xs uppercase tracking-wide px-3 py-2 ${
              tab === "browse"
                ? "border-b-2 border-accent text-accent"
                : "text-zinc-500"
            }`}
          >
            Browse by Industry
          </button>
        </div>

        {tab === "search" && (
          <section className="mt-6">
            <form onSubmit={submitSearch} className="flex items-end gap-3">
              <div>
                <label className="block text-xs text-zinc-500">Ticker</label>
                <input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  placeholder="AAPL"
                  required
                  className="mt-1 w-32 rounded-sm border border-zinc-200 bg-white px-3 py-2 text-sm text-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                />
              </div>
              <button
                type="submit"
                className="rounded-sm bg-black px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-black"
              >
                Analyze
              </button>
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
                <button
                  key={c.key}
                  onClick={() => loadCategory(c.key)}
                  className={`rounded-sm border px-3 py-1.5 font-mono text-xs uppercase tracking-wide ${
                    category === c.key
                      ? "border-accent text-accent"
                      : "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {browseLoading && <p className="mt-4 text-sm text-zinc-500">Loading...</p>}

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {companies.map((c) => (
                <button
                  key={c.cik}
                  onClick={() => {
                    setTab("search");
                    setTicker(c.ticker);
                    lookup(c.ticker);
                  }}
                  className="rounded-sm border border-zinc-200 bg-white p-4 text-left transition-colors hover:border-accent/50 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <p className="font-medium text-black dark:text-zinc-50">{c.ticker}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{c.title}</p>
                </button>
              ))}
              {!browseLoading && companies.length === 0 && (
                <p className="text-sm text-zinc-500">Pick a category to see companies.</p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
