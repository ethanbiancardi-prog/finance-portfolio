"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AI_ENABLED } from "@/lib/aiFeatures";
import dynamic from "next/dynamic";
import { Button, PageLoading, PageShell, Tabs, TickerSearch } from "@/components/ui";
import { Dashboard, RedFlagsPanel, type Company, type Dashboard as DashboardData } from "./Fundamentals";
import { NewsPanel } from "./NewsPanel";
import { AnalysisPanel } from "./AnalysisPanel";
import { BusinessSummary } from "./BusinessSummary";
import { PlaybookPanel, type Playbook } from "./PlaybookPanel";
import { StockMeter } from "./StockMeter";
import { SignalsPanel } from "./SignalsPanel";
import { Overview } from "./Overview";
import { SimpleProvider } from "./SimpleMode";
import { SectionForce } from "@/components/ui/Section";

// The Industry Charts tab carries recharts, so it loads on its own.
const IndustryCharts = dynamic(() => import("./IndustryCharts"), { ssr: false, loading: () => <PageLoading /> });

type Tab = "industries" | "search" | "signals";

// useSearchParams needs a Suspense boundary above it for static rendering.
export default function Research() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ResearchPage />
    </Suspense>
  );
}

function ResearchPage() {
  const initialTicker = useSearchParams().get("ticker")?.toUpperCase() ?? null;
  // Industry Charts is the home tab; a ?ticker= link goes straight to Search.
  const [tab, setTab] = useState<Tab>(initialTicker ? "search" : "industries");

  const [ticker, setTicker] = useState("");
  const [company, setCompany] = useState<Company | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Reading controls for a result: plain-English mode and expand/collapse all.
  const [simple, setSimple] = useState(false);
  const [force, setForce] = useState<{ open: boolean; seq: number } | undefined>(undefined);
  const [glance, setGlance] = useState<string | null>(null);
  // Inputs the Bull/Bear Meter picks up from panels as they load.
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [redFlags, setRedFlags] = useState<number | null>(null);


  async function lookup(symbol: string) {
    setLoading(true);
    setError("");
    setDashboard(null);
    setCompany(null);
    setGlance(null);
    setPlaybook(null);
    setRedFlags(null);
    setForce(undefined);

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

  // ?ticker=NVDA (the link back from the DCF builder) — look it up on
  // arrival, deferred a tick so the lookup's state updates don't run
  // synchronously inside the effect.
  useEffect(() => {
    if (!initialTicker) return;
    const id = window.setTimeout(() => {
      setTicker(initialTicker);
      lookup(initialTicker);
    }, 0);
    return () => window.clearTimeout(id);
  }, [initialTicker]);

  async function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    lookup(ticker);
  }

  // From the Industry Charts and Research Signals tabs: open one stock in Search.
  function research(symbol: string) {
    setTab("search");
    setTicker(symbol);
    lookup(symbol);
    window.scrollTo({ top: 0 });
  }

  return (
    <PageShell
      eyebrow="fundamentals, news, ai analysis"
      title="Stock Research"
      description={
        AI_ENABLED
          ? "One ticker, everything on it: what the business does, what's moving it and what you could do about it, fundamentals and ratios from the latest 10-K, an AI red-flag scan, live headlines, and six AI analyst takes."
          : "One ticker, everything on it: the price chart, fundamentals and ratios from the latest 10-K, and live headlines."
      }
    >
      <div className="mt-4">
        <Tabs<Tab>
          tabs={[
            { key: "industries", label: "Industry Charts" },
            { key: "search", label: "Search" },
            { key: "signals", label: "Research Signals" },
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
              Fetching filing...
            </p>
          )}
          {error && <p className="mt-4 text-xs text-bad">{error}</p>}
          {dashboard && company && (
            <SimpleProvider value={simple}>
              <Overview
                company={company}
                glance={glance}
                meter={<StockMeter key={`meter-${company.ticker}`} ticker={company.ticker} dashboard={dashboard} playbook={playbook} redFlags={redFlags} />}
                simple={simple}
                onSimple={setSimple}
                onExpandAll={() => setForce({ open: true, seq: (force?.seq ?? 0) + 1 })}
                onCollapseAll={() => setForce({ open: false, seq: (force?.seq ?? 0) + 1 })}
              />
              <SectionForce.Provider value={force}>
                {/* AI switched off (lib/aiFeatures.ts): skip every panel that calls Claude. */}
                {!AI_ENABLED && (
                  <p className="mt-4 text-xs text-zinc-500">
                    AI features are paused right now. The filing data, ratios, chart and headlines below still work.
                  </p>
                )}
                {AI_ENABLED && (
                  <>
                    <BusinessSummary key={`about-${company.ticker}`} ticker={company.ticker} name={company.title} />
                    <PlaybookPanel
                      key={`playbook-${company.ticker}`}
                      ticker={company.ticker}
                      onLoaded={(summary, data) => {
                        setGlance(summary);
                        setPlaybook(data);
                      }}
                    />
                  </>
                )}
                <Dashboard company={company} dashboard={dashboard} />
                {AI_ENABLED && <RedFlagsPanel key={`flags-${company.ticker}`} ticker={company.ticker} onScanned={setRedFlags} />}
                <NewsPanel key={`news-${company.ticker}`} ticker={company.ticker} />
                {AI_ENABLED && <AnalysisPanel key={`ai-${company.ticker}`} ticker={company.ticker} />}
              </SectionForce.Provider>
            </SimpleProvider>
          )}
        </section>
      )}

      {tab === "signals" && (
        <SimpleProvider value={simple}>
          <SignalsPanel
            simple={simple}
            onSimple={setSimple}
            onResearch={research}
          />
        </SimpleProvider>
      )}

      {tab === "industries" && <IndustryCharts onResearch={research} />}
    </PageShell>
  );
}
