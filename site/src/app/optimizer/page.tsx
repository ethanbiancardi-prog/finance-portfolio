"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { QuantHubHeader } from "@/components/QuantHubHeader";
import { RISK_FREE_RATE_ANNUAL } from "@/lib/constants";
import { formatPercent, formatRatio } from "@/lib/format";
import { portfolioVariance, sharpeRatio } from "@/lib/portfolioMath";
import {
  Button,
  Card,
  ChartLoading,
  Field,
  PageShell,
  SectionHeader,
  Slider,
  StatCard,
  tableCellClass,
  tableCellStrongClass,
  tableHeadCellClass,
  tableHeadRowClass,
  tableRowClass,
} from "@/components/ui";

const Chart = dynamic(() => import("./Chart"), {
  ssr: false,
  loading: () => <ChartLoading className="h-80" />,
});

type SampledPortfolio = { weights: number[]; return: number; volatility: number; sharpe: number };
type FrontierResponse = {
  symbols: string[];
  meanReturns: number[];
  covMatrix: number[][];
  samples: SampledPortfolio[];
  frontier: SampledPortfolio[];
  maxSharpe: SampledPortfolio;
  minVariance: SampledPortfolio;
  names: Record<string, string>;
};

// The portfolio at a target volatility on the exact frontier the server
// solved (lib/optimizer.ts traceFrontier). The frontier's weights change
// continuously, so blending the two solved points either side of the target
// moves smoothly; return, volatility and Sharpe are then computed exactly
// for that blend.
function portfolioAt(target: number, edge: SampledPortfolio[], r: FrontierResponse): SampledPortfolio {
  let i = 0;
  while (i < edge.length - 2 && edge[i + 1].volatility < target) i++;
  const a = edge[i];
  const b = edge[Math.min(i + 1, edge.length - 1)];
  const t = b.volatility > a.volatility ? Math.min(1, Math.max(0, (target - a.volatility) / (b.volatility - a.volatility))) : 0;
  const weights = a.weights.map((w, k) => w + t * (b.weights[k] - w));
  const ret = weights.reduce((sum, w, k) => sum + w * r.meanReturns[k], 0);
  const volatility = Math.sqrt(portfolioVariance(weights, r.covMatrix));
  return { weights, return: ret, volatility, sharpe: sharpeRatio(ret, volatility, RISK_FREE_RATE_ANNUAL) };
}

export default function Optimizer() {
  const [tickerInput, setTickerInput] = useState("AAPL, MSFT, XOM, JNJ");
  const [result, setResult] = useState<FrontierResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // 0 = lowest-risk portfolio on the frontier, 1 = highest-return one.
  const [riskLevel, setRiskLevel] = useState(0);

  async function buildFrontier(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setRiskLevel(0);

    try {
      const res = await fetch("/api/optimizer/frontier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: tickerInput.split(",") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to build frontier");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build frontier");
    } finally {
      setLoading(false);
    }
  }

  const edge = useMemo(() => result?.frontier ?? [], [result]);
  const volMin = edge[0]?.volatility ?? 0;
  const volMax = edge[edge.length - 1]?.volatility ?? 1;
  const targetVol = volMin + riskLevel * (volMax - volMin);

  // The typed box and the slider drive the same state. While typing, keep
  // the raw text so "1" on the way to "15" isn't clamped away.
  const [volText, setVolText] = useState<string | null>(null);
  function typeVolatility(text: string) {
    setVolText(text);
    const pct = Number(text);
    if (text.trim() === "" || !Number.isFinite(pct) || volMax <= volMin) return;
    setRiskLevel(Math.min(1, Math.max(0, (pct / 100 - volMin) / (volMax - volMin))));
  }

  // Recharts re-runs an internal effect keyed on data-array identity, so a
  // fresh `[result.minVariance]` literal on every render (e.g. while
  // dragging the risk slider below, which re-renders this component on
  // every tick) triggers a render loop. Memoizing on `result` keeps the
  // reference stable across renders that don't actually change it.
  const minVarianceSeries = useMemo(() => (result ? [result.minVariance] : []), [result]);
  const maxSharpeSeries = useMemo(() => (result ? [result.maxSharpe] : []), [result]);

  // Memoized for the same reason as the series above: the chart now plots it.
  const selectedPortfolio = useMemo(
    () => (result && edge.length ? portfolioAt(targetVol, edge, result) : null),
    [result, edge, targetVol],
  );
  const selectedSeries = useMemo(() => (selectedPortfolio ? [selectedPortfolio] : []), [selectedPortfolio]);

  return (
    <>
    <QuantHubHeader />
    <PageShell
      eyebrow="portfolio construction"
      title="Portfolio Optimizer"
      description="Samples thousands of random portfolio weightings across your tickers and plots return vs. volatility; the top-left edge of the cloud approximates the efficient frontier."
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
              term="sharpe"
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
                  {formatPercent(result.minVariance.return)} return, lowest volatility possible
                </span>
              }
            />
          </section>

          <section className="mt-4">
            <SectionHeader
              label="sampled frontier"
              description="Each faint square is one randomly weighted portfolio. The line is the efficient frontier: the best return possible at each level of risk, so nothing can sit above it. Accent square = max Sharpe, solid square = min variance, ring = the risk level picked below."
            />
            <Chart
              samples={result.samples}
              frontier={result.frontier}
              selectedSeries={selectedSeries}
              minVarianceSeries={minVarianceSeries}
              maxSharpeSeries={maxSharpeSeries}
            />
          </section>

          <section className="mt-4">
            <SectionHeader
              label="pick a risk level"
              description="Drag along the efficient frontier, from the lowest-risk mix (0%) to the highest-return one (100%). The weights shift gradually as you go."
            />
            <div className="mt-3">
              <Slider
                label="Risk level"
                value={riskLevel}
                min={0}
                max={1}
                step={0.001}
                onChange={(v) => {
                  setRiskLevel(v);
                  setVolText(null);
                }}
                display={`${Math.round(riskLevel * 100)}%`}
                hint={
                  selectedPortfolio &&
                  `${formatPercent(selectedPortfolio.volatility)} expected volatility · ${formatPercent(selectedPortfolio.return)} expected return (annualized, from the past year)`
                }
              />
              <div className="mt-1 flex justify-between text-[10px] caps text-zinc-600">
                <span>Lowest risk</span>
                <span>Highest return</span>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field
                  label="Exact volatility"
                  suffix={`${(volMin * 100).toFixed(1)}–${(volMax * 100).toFixed(1)}%`}
                  type="number"
                  step="0.1"
                  min={(volMin * 100).toFixed(1)}
                  max={(volMax * 100).toFixed(1)}
                  value={volText ?? (targetVol * 100).toFixed(1)}
                  onChange={(e) => typeVolatility(e.target.value)}
                  onBlur={() => setVolText(null)}
                  className="w-24"
                />
                <p className="pb-1 text-[11px] leading-5 text-zinc-500">
                  Type a volatility in % to jump straight to that portfolio. Values outside the range snap to the nearest end.
                </p>
              </div>
            </div>

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
                    <td className={`${tableCellClass} text-[10px] caps`}>Return / Vol / Sharpe</td>
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
    </>
  );
}
