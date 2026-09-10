"use client";

import { useState } from "react";
import { Button, Card, Chip, PageShell, Tabs, TickerSearch } from "@/components/ui";
import { Dashboard, RedFlagsPanel, type Company, type Dashboard as DashboardData } from "./Fundamentals";
import { NewsPanel } from "./NewsPanel";
import { AnalysisPanel } from "./AnalysisPanel";

const CATEGORIES = [
  { key: "tech", label: "Tech" },
  { key: "biotech", label: "Biotech" },
  { key: "healthcare", label: "Healthcare" },
  { key: "consumer", label: "Consumer" },
  { key: "energy", label: "Energy" },
  { key: "sustainability", label: "Sustainability" },
];

export default function Research() {
  const [tab, setTab] = useState<"search" | "browse">("search");

  const [ticker, setTicker] = useState("");
  const [company, setCompany] = useState<Company | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [category, setCategory] = useState(CATEGORIES[0].key);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  async function lookup(symbol: string) {
    setLoading(true);
    setError("");
    setDashboard(null);
    setCompany(null);

    const res = await fetch(`/api/statement-analyzer/lookup?ticker=${encodeURIComponent(symbol)}`);
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Lookup failed");
      setLoading(false);
      return;
    }

    setCompany(data.company);
    setDashboard(data.dashboard);
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
      eyebrow="research"
      title="Stock Research"
      description="One ticker, everything on it: fundamentals and ratios from the latest 10-K, an AI red-flag scan, live headlines, and six AI analyst takes."
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
            <Button type="submit">Research</Button>
          </form>

          {loading && (
            <p className="mt-4 text-xs text-zinc-500">
              <span className="cursor-blink">▌</span> fetching filing
            </p>
          )}
          {error && <p className="mt-4 text-xs text-bad">{error}</p>}
          {dashboard && company && (
            <>
              <Dashboard company={company} dashboard={dashboard} />
              <RedFlagsPanel key={`flags-${company.ticker}`} ticker={company.ticker} />
              <NewsPanel key={`news-${company.ticker}`} ticker={company.ticker} />
              <AnalysisPanel key={`ai-${company.ticker}`} ticker={company.ticker} />
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

          {browseLoading && (
            <p className="mt-4 text-xs text-zinc-500">
              <span className="cursor-blink">▌</span> loading
            </p>
          )}

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
