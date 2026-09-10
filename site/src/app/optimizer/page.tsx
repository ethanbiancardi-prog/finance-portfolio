"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { formatPercent, formatRatio } from "@/lib/format";
import {
  Button,
  Card,
  Field,
  PageShell,
  SectionHeader,
  StatCard,
  tableCellClass,
  tableCellStrongClass,
  tableHeadCellClass,
  tableHeadRowClass,
  tableRowClass,
} from "@/components/ui";

const Chart = dynamic(() => import("./Chart"), {
  ssr: false,
  loading: () => <div className="mt-4 h-80 animate-pulse bg-border" />,
});

type SampledPortfolio = { weights: number[]; return: number; volatility: number; sharpe: number };
type FrontierResponse = {
  symbols: string[];
  meanReturns: number[];
  samples: SampledPortfolio[];
  maxSharpe: SampledPortfolio;
  minVariance: SampledPortfolio;
  names: Record<string, string>;
};

// Nearest match by volatility against the sample cloud — a tiny lookup, not
// worth importing the full server-side lib/optimizer.ts (which pulls in
// Alpaca fetch code) into the client bundle just for this.
function findClosestByVolatility(samples: SampledPortfolio[], target: number): SampledPortfolio {
  return samples.reduce((best, s) =>
    Math.abs(s.volatility - target) < Math.abs(best.volatility - target) ? s : best,
  );
}

export default function Optimizer() {
  const [tickerInput, setTickerInput] = useState("AAPL, MSFT, XOM, JNJ");
  const [result, setResult] = useState<FrontierResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [targetVolatility, setTargetVolatility] = useState<number | null>(null);

  async function buildFrontier(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setTargetVolatility(null);

    try {
      const res = await fetch("/api/optimizer/frontier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: tickerInput.split(",") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to build frontier");
      setResult(data);
      setTargetVolatility(data.minVariance.volatility);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build frontier");
    } finally {
      setLoading(false);
    }
  }

  const volatilityBounds = useMemo(() => {
    if (!result) return { min: 0, max: 1 };
    const vols = result.samples.map((s) => s.volatility);
    return { min: Math.min(...vols), max: Math.max(...vols) };
  }, [result]);

  // Recharts re-runs an internal effect keyed on data-array identity, so a
  // fresh `[result.minVariance]` literal on every render (e.g. while
  // dragging the risk slider below, which re-renders this component on
  // every tick) triggers a render loop. Memoizing on `result` keeps the
  // reference stable across renders that don't actually change it.
  const minVarianceSeries = useMemo(() => (result ? [result.minVariance] : []), [result]);
  const maxSharpeSeries = useMemo(() => (result ? [result.maxSharpe] : []), [result]);

  const selectedPortfolio =
    result && targetVolatility != null
      ? findClosestByVolatility(result.samples, targetVolatility)
      : null;

  return (
    <PageShell
      eyebrow="portfolio optimizer"
      title="Portfolio Optimizer"
      description="Samples thousands of random portfolio weightings across your tickers and plots return vs. volatility — the top-left edge of the cloud approximates the efficient frontier."
    >
      <Card as="section" className="mt-4">
        <SectionHeader
          label="tickers"
          description="2-10 comma-separated tickers, ~1 year of daily price history each."
        />
        <form onSubmit={buildFrontier} className="mt-3 flex flex-wrap items-end gap-3">
          <Field
            label="Tickers"
            placeholder="AAPL, MSFT, XOM, JNJ"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            required
            wrapperClassName="min-w-64 flex-1"
          />
          <Button type="submit" loading={loading} loadingLabel="Building...">
            Build Frontier
          </Button>
        </form>
      </Card>

      {error && <p className="mt-4 text-xs text-bad">{error}</p>}

      {result && (
        <>
          <section className="mt-4 grid grid-cols-2 gap-3">
            <StatCard
              card
              size="lg"
              label="Max Sharpe"
              value={formatRatio(result.maxSharpe.sharpe)}
              hint={
                <span className="text-[11px] text-zinc-500">
                  {formatPercent(result.maxSharpe.return)} return,{" "}
                  {formatPercent(result.maxSharpe.volatility)} volatility
                </span>
              }
            />
            <StatCard
              card
              size="lg"
              label="Min Variance"
              value={formatPercent(result.minVariance.volatility)}
              hint={
                <span className="text-[11px] text-zinc-500">
                  {formatPercent(result.minVariance.return)} return, lowest volatility sampled
                </span>
              }
            />
          </section>

          <section className="mt-4">
            <SectionHeader
              label="sampled frontier"
              description="Each square is one randomly-weighted portfolio. Accent = max Sharpe, white = min variance."
            />
            <Chart
              samples={result.samples}
              minVarianceSeries={minVarianceSeries}
              maxSharpeSeries={maxSharpeSeries}
            />
          </section>

          <section className="mt-4">
            <SectionHeader
              label="pick a risk level"
              description="Drag to see the sampled portfolio closest to that volatility."
            />
            <input
              type="range"
              min={volatilityBounds.min}
              max={volatilityBounds.max}
              step={(volatilityBounds.max - volatilityBounds.min) / 200}
              value={targetVolatility ?? volatilityBounds.min}
              onChange={(e) => setTargetVolatility(Number(e.target.value))}
              className="mt-3 w-full accent-accent"
            />

            {selectedPortfolio && (
              <table className="mt-3 w-full text-left">
                <thead>
                  <tr className={tableHeadRowClass}>
                    <th className={tableHeadCellClass}>Ticker</th>
                    <th className={`${tableHeadCellClass} text-right`}>Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {result.symbols.map((symbol, i) => (
                    <tr key={symbol} className={tableRowClass}>
                      <td className="py-1">
                        <span className="text-xs text-foreground">{symbol}</span>
                        {result.names[symbol] && (
                          <span className="block text-[10px] text-zinc-600">{result.names[symbol]}</span>
                        )}
                      </td>
                      <td className={`${tableCellStrongClass} text-right`}>{formatPercent(selectedPortfolio.weights[i])}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border">
                    <td className={`${tableCellClass} text-[10px] uppercase tracking-[0.1em]`}>Return / Vol / Sharpe</td>
                    <td className={`${tableCellStrongClass} text-right`}>
                      {formatPercent(selectedPortfolio.return)} / {formatPercent(selectedPortfolio.volatility)} /{" "}
                      {formatRatio(selectedPortfolio.sharpe)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </PageShell>
  );
}
