"use client";

import { useState } from "react";

type Company = { cik: number; ticker: string; title: string };

type Ratio = { label: string; group: string; value: number | null; prior: number | null };

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

function Dashboard({ company, dashboard }: { company: Company; dashboard: Dashboard }) {
  return (
    <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
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

      <table className="mt-5 w-full text-left text-sm">
        <thead>
          <tr className="text-zinc-500">
            <th className="py-2 font-medium">Ratio</th>
            <th className="py-2 font-medium">Category</th>
            <th className="py-2 font-medium">Current</th>
            <th className="py-2 font-medium">Prior Year</th>
          </tr>
        </thead>
        <tbody>
          {dashboard.ratios.map((ratio) => (
            <tr key={ratio.label} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="py-2 text-black dark:text-zinc-50">{ratio.label}</td>
              <td className="py-2 text-zinc-600 dark:text-zinc-400">{ratio.group}</td>
              <td className="py-2 text-zinc-600 dark:text-zinc-400">{ratioValue(ratio.value)}</td>
              <td className="py-2 text-zinc-600 dark:text-zinc-400">{ratioValue(ratio.prior)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-20 sm:py-28">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          10-K Analyzer
        </h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Liquidity, leverage, profitability, and efficiency ratios pulled straight from SEC EDGAR.
        </p>

        <div className="mt-8 flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setTab("search")}
            className={`px-3 py-2 text-sm font-medium ${
              tab === "search"
                ? "border-b-2 border-black text-black dark:border-zinc-50 dark:text-zinc-50"
                : "text-zinc-500"
            }`}
          >
            Search
          </button>
          <button
            onClick={() => setTab("browse")}
            className={`px-3 py-2 text-sm font-medium ${
              tab === "browse"
                ? "border-b-2 border-black text-black dark:border-zinc-50 dark:text-zinc-50"
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
                  className="mt-1 w-32 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
                />
              </div>
              <button
                type="submit"
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-black"
              >
                Analyze
              </button>
            </form>

            {loading && <p className="mt-4 text-sm text-zinc-500">Loading...</p>}
            {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
            {dashboard && company && <Dashboard company={company} dashboard={dashboard} />}
          </section>
        )}

        {tab === "browse" && (
          <section className="mt-6">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => loadCategory(c.key)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    category === c.key
                      ? "bg-black text-white dark:bg-zinc-50 dark:text-black"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
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
                  className="rounded-lg border border-zinc-200 bg-white p-4 text-left hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
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
