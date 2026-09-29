"use client";

import { useEffect, useMemo, useState } from "react";
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

// Any weights (e.g. an account's current holdings) priced with the same
// return and covariance estimates as the frontier, so it can be compared
// directly.
function portfolioOf(weights: number[], r: FrontierResponse): SampledPortfolio {
  const ret = weights.reduce((sum, w, k) => sum + w * r.meanReturns[k], 0);
  const volatility = Math.sqrt(portfolioVariance(weights, r.covMatrix));
  return { weights, return: ret, volatility, sharpe: sharpeRatio(ret, volatility, RISK_FREE_RATE_ANNUAL) };
}

// The lowest-volatility frontier portfolio earning at least `target`
// return. Returns rise along the frontier, so walk it by return instead of
// volatility. Null if the target is beyond the frontier's best return.
function frontierAtReturn(target: number, edge: SampledPortfolio[], r: FrontierResponse): SampledPortfolio | null {
  if (target > edge[edge.length - 1].return) return null;
  if (target <= edge[0].return) return edge[0];
  let i = 0;
  while (i < edge.length - 2 && edge[i + 1].return < target) i++;
  const a = edge[i], b = edge[i + 1];
  const t = (target - a.return) / (b.return - a.return);
  return portfolioOf(a.weights.map((w, k) => w + t * (b.weights[k] - w)), r);
}

export default function Optimizer() {
  const [tickerInput, setTickerInput] = useState("AAPL, MSFT, XOM, JNJ");
  // Set when arriving from the dashboard's "Optimize this portfolio": the
  // account's current weight in each ticker, to plot against the frontier.
  const [currentWeights, setCurrentWeights] = useState<Record<string, number> | null>(null);
  const [result, setResult] = useState<FrontierResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // 0 = lowest-risk portfolio on the frontier, 1 = highest-return one.
  const [riskLevel, setRiskLevel] = useState(0);

  async function buildFrontier(e: React.FormEvent) {
    e.preventDefault();
    // A hand-edited ticker list is a new question, not the account any more.
    setCurrentWeights(null);
    await runFrontier(tickerInput);
  }

  async function runFrontier(tickers: string) {
    setLoading(true);
    setError("");
    setResult(null);
    setRiskLevel(0);

    try {
      const res = await fetch("/api/optimizer/frontier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: tickers.split(",") }),
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

  // /optimizer?tickers=TQQQ,SOXL&weights=0.15,0.12 (from the dashboard):
  // fill in the account's holdings and build straight away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tickers = (params.get("tickers") ?? "").split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
    if (tickers.length < 2) return;
    const weights = (params.get("weights") ?? "").split(",").map(Number);
    const list = tickers.join(", ");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off load from the URL on arrival
    setTickerInput(list);
    if (weights.length === tickers.length && weights.every((w) => w >= 0)) {
      setCurrentWeights(Object.fromEntries(tickers.map((t, i) => [t, weights[i]])));
    }
    runFrontier(list);
    // Runs once on arrival, reading the URL; nothing to re-run it for.
  }, []);

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

  // The account's current portfolio on the same scale as the frontier, and
  // the frontier portfolios it's being compared with.
  const current = useMemo(() => {
    if (!result || !currentWeights || !edge.length) return null;
    const raw = result.symbols.map((s) => currentWeights[s] ?? 0);
    const total = raw.reduce((a, b) => a + b, 0);
    if (!total) return null;
    const mine = portfolioOf(raw.map((w) => w / total), result);
    const sameRisk = portfolioAt(Math.min(Math.max(mine.volatility, volMin), volMax), edge, result);
    const sameReturn = frontierAtReturn(mine.return, edge, result);
    return { mine, sameRisk, sameReturn };
  }, [result, currentWeights, edge, volMin, volMax]);
  const currentSeries = useMemo(() => (current ? [current.mine] : []), [current]);
  const levelFor = (vol: number) => Math.min(1, Math.max(0, (vol - volMin) / (volMax - volMin || 1)));

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
          description="2-20 comma-separated tickers, ~1 year of daily price history each."
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

          {current && (
            <Card as="section" className="mt-4">
              <SectionHeader
                label="your portfolio vs the frontier"
                description="Your account's current weights, priced with the same past-year returns and risk as the frontier. The frontier shows what a better mix of the same tickers could have done."
              />
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard
                  label="Your portfolio now"
                  value={`${formatPercent(current.mine.return)} return`}
                  hint={<span className="text-[11px] text-zinc-500">{formatPercent(current.mine.volatility)} volatility · Sharpe {formatRatio(current.mine.sharpe)}</span>}
                />
                <StatCard
                  label="Same risk, on the frontier"
                  value={`${formatPercent(current.sameRisk.return)} return`}
                  hint={
                    <span className="text-[11px] text-zinc-500">
                      {current.sameRisk.return >= current.mine.return ? "+" : ""}
                      {formatPercent(current.sameRisk.return - current.mine.return)} vs yours at {formatPercent(current.sameRisk.volatility)} volatility
                    </span>
                  }
                />
                <StatCard
                  label="Same return, on the frontier"
                  value={current.sameReturn ? `${formatPercent(current.sameReturn.volatility)} volatility` : "Not reachable"}
                  hint={
                    <span className="text-[11px] text-zinc-500">
                      {current.sameReturn
                        ? `${formatPercent(current.mine.volatility - current.sameReturn.volatility)} less risk for the same ${formatPercent(current.mine.return)} return`
                        : "Your return is above anything this set of tickers could combine to"}
                    </span>
                  }
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => { setRiskLevel(levelFor(current.sameRisk.volatility)); setVolText(null); }}>
                  Show the same-risk mix
                </Button>
                {current.sameReturn && (
                  <Button variant="outline" onClick={() => { setRiskLevel(levelFor(current.sameReturn!.volatility)); setVolText(null); }}>
                    Show the same-return mix
                  </Button>
                )}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                Based on the past year only, so it shows which mix would have been most efficient, not a forecast. Educational, not investment advice.
              </p>
            </Card>
          )}

          <section className="mt-4">
            <SectionHeader
              label="sampled frontier"
              description={`Each faint square is one randomly weighted portfolio. The line is the efficient frontier: the best return possible at each level of risk, so nothing can sit above it. Accent square = max Sharpe, solid square = min variance, ring = the risk level picked below${current ? ", red cross = your portfolio now" : ""}.`}
            />
            <Chart
              samples={result.samples}
              frontier={result.frontier}
              selectedSeries={selectedSeries}
              currentSeries={currentSeries}
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
                    {current && <th className={`${tableHeadCellClass} text-right`}>Now</th>}
                    <th className={`${tableHeadCellClass} text-right`}>{current ? "Frontier" : "Weight"}</th>
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
                      {current && <td className={`${tableCellClass} text-right`}>{formatPercent(current.mine.weights[i])}</td>}
                      <td className={`${tableCellStrongClass} text-right`}>{formatPercent(selectedPortfolio.weights[i])}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border">
                    <td className={`${tableCellClass} text-[10px] caps`}>Return / Vol / Sharpe</td>
                    {current && (
                      <td className={`${tableCellClass} text-right`}>
                        {formatPercent(current.mine.return)} / {formatPercent(current.mine.volatility)} / {formatRatio(current.mine.sharpe)}
                      </td>
                    )}
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
