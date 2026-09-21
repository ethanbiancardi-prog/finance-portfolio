"use client";

// Regime backtester dashboard: how a trend-following, leveraged momentum
// book behaves across four very different markets. All series and metrics
// are precomputed in lib/regimeBacktest.ts, so switching regimes is instant.
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, StatCard, chartAxisProps, chartGridProps, chartTooltipStyle } from "@/components/ui";
import { REGIMES, REGIME_RESULTS, type Metrics, type RegimeKey, type WeekPoint } from "@/lib/regimeBacktest";

// Chart palette: neon emerald for the strategy, muted slate for the
// benchmark, rose for drawdowns. Chosen for contrast on dark panels; the
// rest of the component uses the site's theme tokens.
const STRATEGY = { from: "#34d399", to: "#059669" };
const BENCHMARK = { from: "#94a3b8", to: "#475569" };
const DRAWDOWN = "#fb7185";

// ---- number formatting ----------------------------------------------------
const pct = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${(Math.abs(v) * 100).toFixed(digits)}%`;
const pctPlain = (v: number, digits = 1) => `${(Math.abs(v) * 100).toFixed(digits)}%`;
const ratio = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
const multiple = (v: number) => `${v.toFixed(2)}x`;
const weeks = (n: number) => (n >= 52 ? `${(n / 52).toFixed(1)} yrs` : `${n} wks`);
const monthYear = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fullDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const signClass = (v: number) => (v > 0 ? "text-good" : v < 0 ? "text-bad" : "text-foreground");

export function RegimeBacktester() {
  const [regime, setRegime] = useState<RegimeKey>("gfc2008");
  const { regime: meta, points, metrics: m } = REGIME_RESULTS[regime];

  return (
    <div className="mt-4">
      {/* Regime selector */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="inline-flex max-w-full overflow-x-auto rounded-[var(--radius)] border border-border bg-panel p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Market regime">
          {REGIMES.map((r) => {
            const active = r.key === regime;
            return (
              <button
                key={r.key}
                role="tab"
                aria-selected={active}
                onClick={() => setRegime(r.key)}
                className={`shrink-0 rounded-[var(--radius-sm)] px-3 py-1.5 text-[11px] caps transition-colors duration-150 ease-out ${
                  active ? "bg-accent/10 text-accent shadow-[inset_0_0_0_1px_var(--accent)]" : "text-zinc-500 hover:text-foreground"
                }`}
              >
                <span className="sm:hidden">{r.short}</span>
                <span className="hidden sm:inline">{r.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] caps text-zinc-500">
          {fullDate(points[0].date)} – {fullDate(points[points.length - 1].date)} · weekly · rf {pctPlain(meta.riskFree)}
        </p>
      </div>

      <p className="mt-3 max-w-3xl text-xs leading-5 text-zinc-400">{meta.summary}</p>

      {/* Headline figures */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard card label="Strategy" value={<span className={signClass(m.totalReturn)}>{pct(m.totalReturn)}</span>} hint={<span className="text-zinc-500">{multiple(1 + m.totalReturn)} on $1</span>} />
        <StatCard card label="Benchmark" value={<span className={signClass(m.benchmarkReturn)}>{pct(m.benchmarkReturn)}</span>} hint={<span className="text-zinc-500">{multiple(1 + m.benchmarkReturn)} on $1</span>} />
        <StatCard
          card
          label="Excess return"
          value={<span className={signClass(m.totalReturn - m.benchmarkReturn)}>{pct(m.totalReturn - m.benchmarkReturn)}</span>}
          hint={<span className="text-zinc-500">strategy minus benchmark</span>}
        />
        <StatCard card label="CAGR" value={<span className={signClass(m.cagr)}>{pct(m.cagr)}</span>} hint={<span className="text-zinc-500">bench {pct(m.benchmarkCagr)}</span>} />
        <StatCard card label="Max drawdown" term="drawdown" value={<span className="text-bad">{pct(m.maxDrawdown)}</span>} hint={<span className="text-zinc-500">bench {pct(m.benchmarkMaxDrawdown)}</span>} />
        <StatCard card label="Volatility" term="volatility" value={pctPlain(m.volatility)} hint={<span className="text-zinc-500">annualised</span>} />
      </div>

      {/* Charts + quant sidebar */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <EquityChart points={points} />
          <DrawdownChart points={points} />
        </div>
        <QuantSidebar m={m} />
      </div>

      <p className="mt-3 text-[10px] leading-4 text-zinc-600">
        Synthetic data. Each regime is a scripted sequence of weekly drift and volatility shaped after the real episode; the paths are drawn once with a
        fixed seed and are not actual index returns. The strategy rule (risk-on at 1.3x when the benchmark is above its 40-week average, otherwise cash at
        the risk-free rate) and every figure above are computed from those paths. Educational, not investment advice.
      </p>
    </div>
  );
}

// ---- charts ---------------------------------------------------------------

function EquityChart({ points }: { points: WeekPoint[] }) {
  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] caps text-zinc-500">Growth of $1</p>
        <Legend />
      </div>
      <div className="mt-2 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="rb-strategy" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={STRATEGY.to} />
                <stop offset="100%" stopColor={STRATEGY.from} />
              </linearGradient>
              <linearGradient id="rb-benchmark" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={BENCHMARK.to} />
                <stop offset="100%" stopColor={BENCHMARK.from} />
              </linearGradient>
            </defs>
            <CartesianGrid {...chartGridProps} vertical={false} />
            <XAxis dataKey="date" {...chartAxisProps} tickFormatter={monthYear} minTickGap={40} />
            {/* Left axis: equity multiple. Right axis: the strategy's exposure, so you can see when it was in cash. */}
            <YAxis yAxisId="equity" {...chartAxisProps} width={44} domain={["auto", "auto"]} tickFormatter={(v: number) => `${v.toFixed(2)}x`} />
            <YAxis yAxisId="exposure" orientation="right" {...chartAxisProps} width={36} domain={[0, 1.3]} ticks={[0, 1.3]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
            <Tooltip cursor={{ stroke: "var(--border)" }} contentStyle={chartTooltipStyle} content={<EquityTooltip />} />
            <Line yAxisId="exposure" type="stepAfter" dataKey="exposure" stroke={STRATEGY.from} strokeOpacity={0.25} strokeWidth={1} dot={false} isAnimationActive={false} name="Exposure" />
            <Line yAxisId="equity" type="monotone" dataKey="benchmark" stroke="url(#rb-benchmark)" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Benchmark" />
            <Line
              yAxisId="equity"
              type="monotone"
              dataKey="strategy"
              stroke="url(#rb-strategy)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              name="Strategy"
              style={{ filter: `drop-shadow(0 0 6px ${STRATEGY.from}66)` }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function DrawdownChart({ points }: { points: WeekPoint[] }) {
  return (
    <Card padding="sm">
      <p className="text-[10px] caps text-zinc-500">Drawdown from peak</p>
      <div className="mt-2 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="rb-dd-strategy" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={DRAWDOWN} stopOpacity={0.05} />
                <stop offset="100%" stopColor={DRAWDOWN} stopOpacity={0.45} />
              </linearGradient>
              <linearGradient id="rb-dd-benchmark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BENCHMARK.from} stopOpacity={0.02} />
                <stop offset="100%" stopColor={BENCHMARK.from} stopOpacity={0.25} />
              </linearGradient>
            </defs>
            <CartesianGrid {...chartGridProps} vertical={false} />
            <XAxis dataKey="date" {...chartAxisProps} tickFormatter={monthYear} minTickGap={40} />
            <YAxis {...chartAxisProps} width={44} domain={["auto", 0]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
            <Tooltip cursor={{ stroke: "var(--border)" }} contentStyle={chartTooltipStyle} content={<DrawdownTooltip />} />
            <Area type="monotone" dataKey="benchmarkDd" stroke={BENCHMARK.from} strokeWidth={1} fill="url(#rb-dd-benchmark)" isAnimationActive={false} name="Benchmark" />
            <Area type="monotone" dataKey="strategyDd" stroke={DRAWDOWN} strokeWidth={1.5} fill="url(#rb-dd-strategy)" isAnimationActive={false} name="Strategy" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Legend() {
  return (
    <span className="flex flex-wrap items-center gap-3 text-[10px] caps text-zinc-500">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full" style={{ background: `linear-gradient(to right, ${STRATEGY.to}, ${STRATEGY.from})` }} />
        Strategy
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full" style={{ background: `linear-gradient(to right, ${BENCHMARK.to}, ${BENCHMARK.from})` }} />
        Benchmark
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full" style={{ background: STRATEGY.from, opacity: 0.3 }} />
        Exposure (right)
      </span>
    </span>
  );
}

type TooltipProps = { active?: boolean; payload?: { payload: WeekPoint }[] };

function EquityTooltip({ active, payload }: TooltipProps) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div style={chartTooltipStyle} className="tabular-nums">
      <p className="text-zinc-500">{fullDate(p.date)}</p>
      <p style={{ color: STRATEGY.from }}>Strategy {multiple(p.strategy)}</p>
      <p style={{ color: BENCHMARK.from }}>Benchmark {multiple(p.benchmark)}</p>
      <p className="text-zinc-500">{p.exposure > 0 ? `Risk-on · ${Math.round(p.exposure * 100)}% exposure` : "Cash"}</p>
    </div>
  );
}

function DrawdownTooltip({ active, payload }: TooltipProps) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div style={chartTooltipStyle} className="tabular-nums">
      <p className="text-zinc-500">{fullDate(p.date)}</p>
      <p style={{ color: DRAWDOWN }}>Strategy {pct(p.strategyDd)}</p>
      <p style={{ color: BENCHMARK.from }}>Benchmark {pct(p.benchmarkDd)}</p>
    </div>
  );
}

// ---- quant framework sidebar ----------------------------------------------

function QuantSidebar({ m }: { m: Metrics }) {
  return (
    <Card padding="sm" className="lg:sticky lg:top-24 lg:self-start">
      <p className="text-[10px] caps text-zinc-500">Quant framework</p>
      <dl className="mt-3 space-y-4">
        <Metric
          label="Sharpe ratio"
          value={<span className={signClass(m.sharpe)}>{ratio(m.sharpe)}</span>}
          formula="(return − rf) ÷ volatility, annualised"
          note="Excess return earned per unit of total risk. Above 1 is good; above 2 is rare over a full cycle."
        />
        <Metric
          label="Sortino ratio"
          value={<span className={signClass(m.sortino)}>{ratio(m.sortino)}</span>}
          formula="(return − rf) ÷ downside deviation"
          note="Same idea as Sharpe but only weeks below the risk-free rate count as risk, so upside swings aren't penalised. A gap above Sharpe means the volatility was mostly on the upside."
        />
        <Metric
          label="Max drawdown duration"
          value={weeks(m.maxDrawdownWeeks)}
          formula="longest stretch below a prior peak"
          note={`How long you'd have waited to get back to even at the worst point. Benchmark: ${weeks(m.benchmarkMaxDrawdownWeeks)}.`}
        />
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-[11px]">
        <Small label="Time in market" value={pctPlain(m.timeInMarket, 0)} />
        <Small label="Beta vs benchmark" value={ratio(m.beta)} />
        <Small label="Best week" value={<span className="text-good">{pct(m.bestWeek)}</span>} />
        <Small label="Worst week" value={<span className="text-bad">{pct(m.worstWeek)}</span>} />
      </div>
    </Card>
  );
}

function Metric({ label, value, formula, note }: { label: string; value: React.ReactNode; formula: string; note: string }) {
  return (
    <div>
      <dt className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] caps text-zinc-500">{label}</span>
        <span className="text-lg tabular-nums tracking-tight text-foreground">{value}</span>
      </dt>
      <dd className="mt-1">
        <p className="font-mono text-[10px] text-zinc-500">{formula}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-zinc-400">{note}</p>
      </dd>
    </div>
  );
}

function Small({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] caps text-zinc-500">{label}</p>
      <p className="tabular-nums text-foreground">{value}</p>
    </div>
  );
}
