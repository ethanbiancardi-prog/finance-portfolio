"use client";

// "Load from a 10-K": type a ticker, and the DCF's assumptions fill in from
// the company's latest annual report — with the arithmetic for each one
// shown underneath, so the model becomes a way to learn what each input
// means for a real business rather than a form of made-up numbers.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Callout, Card, SectionHeader, TickerSearch } from "@/components/ui";
import type { PrefillSource } from "@/lib/dcfPrefill";

export type LoadedFiling = {
  company: { ticker: string; title: string };
  fiscalYearEnd: string;
  priceAsOf: string | null;
  sources: PrefillSource[];
  missing: string[];
};

type PrefillResponse = LoadedFiling & {
  form: Record<string, string>;
  currentPrice: string;
  error?: string;
};

export function FilingLoader({
  initialTicker,
  onLoaded,
}: {
  initialTicker: string | null;
  onLoaded: (values: Record<string, string>, filing: LoadedFiling) => void;
}) {
  const [ticker, setTicker] = useState(initialTicker ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(symbol: string) {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dcf/prefill?ticker=${encodeURIComponent(sym)}`);
      const data: PrefillResponse = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load that filing");
      // Only overwrite fields the filing actually supplied; anything missing
      // keeps whatever is in the form (and is listed as missing below).
      const values: Record<string, string> = {};
      for (const [k, v] of Object.entries(data.form)) if (v !== "") values[k] = v;
      if (data.currentPrice) values.currentPrice = data.currentPrice;
      onLoaded(values, {
        company: data.company,
        fiscalYearEnd: data.fiscalYearEnd,
        priceAsOf: data.priceAsOf,
        sources: data.sources,
        missing: data.missing,
      });
      setTicker(sym);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load that filing");
    } finally {
      setLoading(false);
    }
  }

  // Arriving from the research page with ?ticker= loads straight away.
  // Deferred a tick so the loader's state updates don't run synchronously
  // inside the effect.
  useEffect(() => {
    if (!initialTicker) return;
    const id = window.setTimeout(() => load(initialTicker), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per initial ticker
  }, [initialTicker]);

  return (
    <Card as="section" className="mt-4">
      <SectionHeader
        label="load from a 10-K"
        description="Fill the assumptions from a real company's latest annual report. Every number below then shows how it was computed from the filing."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(ticker);
        }}
        className="mt-3 flex flex-wrap items-end gap-3"
      >
        <TickerSearch
          label="Ticker or company"
          value={ticker}
          onChange={setTicker}
          onSelect={load}
          endpoint="/api/statement-analyzer/search"
          wrapperClassName="w-64 max-w-full"
        />
        <Button type="submit" loading={loading} loadingLabel="Reading filing...">
          Load
        </Button>
      </form>
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
    </Card>
  );
}

const FIELD_ORDER = ["revenue", "growthRate", "ebitMargin", "taxRate", "daPct", "capexPct", "nwcPct", "sharesOutstanding", "netDebt"];

const MISSING_LABEL: Record<string, string> = {
  growthRate: "Revenue growth",
  ebitMargin: "EBIT margin",
  taxRate: "Tax rate",
  daPct: "D&A",
  capexPct: "Capex",
  nwcPct: "Net working capital",
  sharesOutstanding: "Shares outstanding",
  netDebt: "Net debt",
};

// The explanation panel: one row per assumption, the arithmetic, and any
// caveat. WACC and terminal growth aren't in any filing, so they're called
// out as the reader's own judgement with a pointer on where to start.
export function FilingSources({ filing, wacc, terminalGrowth }: { filing: LoadedFiling; wacc: string; terminalGrowth: string }) {
  const bySource = new Map(filing.sources.map((s) => [s.field, s]));
  return (
    <Card as="section" className="mt-4">
      <SectionHeader
        label={`where these numbers come from`}
        description={`${filing.company.title} (${filing.company.ticker}), 10-K for the fiscal year ending ${filing.fiscalYearEnd}. Figures in $ millions.`}
      />
      <dl className="mt-3 divide-y divide-border/60">
        {FIELD_ORDER.map((field) => {
          const s = bySource.get(field);
          if (!s) return null;
          return (
            <div key={field} className="grid grid-cols-1 gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[11rem_1fr]">
              <dt className="text-xs text-foreground">
                {s.label}
                <span className="ml-2 tabular-nums text-accent">{s.value}</span>
              </dt>
              <dd className="text-[11px] leading-5 text-zinc-500">
                {s.how}
                {s.note && <span className="mt-0.5 block text-average">{s.note}</span>}
              </dd>
            </div>
          );
        })}
        <div className="grid grid-cols-1 gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[11rem_1fr]">
          <dt className="text-xs text-foreground">
            WACC
            <span className="ml-2 tabular-nums text-accent">{wacc}%</span>
          </dt>
          <dd className="text-[11px] leading-5 text-zinc-500">
            Not in the filing — this is your assumption (left as it was). The weighted average cost of capital is the return investors demand
            for the company&apos;s risk: roughly 7-9% for a steady large-cap, 10-12% for something riskier. Nudge it and watch the sensitivity
            table — it&apos;s usually the input the valuation is most sensitive to.
          </dd>
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[11rem_1fr]">
          <dt className="text-xs text-foreground">
            Terminal growth
            <span className="ml-2 tabular-nums text-accent">{terminalGrowth}%</span>
          </dt>
          <dd className="text-[11px] leading-5 text-zinc-500">
            Also your assumption. The growth rate assumed forever after year 5 — it can&apos;t sensibly exceed long-run GDP growth (2-3%),
            because a company growing faster than the economy forever would eventually be the economy.
          </dd>
        </div>
      </dl>
      {filing.missing.length > 0 && (
        <Callout className="mt-3" label="not found in this filing">
          {filing.missing.map((m) => MISSING_LABEL[m] ?? m).join(", ")} — kept the value already in the form. Some filers tag these lines
          differently or not at all.
        </Callout>
      )}
      <p className="mt-3 text-[11px] text-zinc-500">
        <Link href={`/research?ticker=${filing.company.ticker}`} className="text-accent underline decoration-border underline-offset-4 hover:decoration-accent">
          See the full ratio dashboard for {filing.company.ticker} →
        </Link>
      </p>
    </Card>
  );
}
