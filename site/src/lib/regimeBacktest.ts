// Regime backtester: data + math for the RegimeBacktester dashboard.
//
// Every number here is computed once when the module loads, so switching
// regimes in the UI is a lookup — no fetch, no recompute, no empty frames.
//
// The price paths are SYNTHETIC. Each regime is described as a handful of
// phases (drift + volatility per week, e.g. "grind down 30 weeks, crash 6
// weeks, V-recover 20 weeks") and a seeded generator draws a weekly path
// through them. The shape follows the real episode; the numbers do not.
// The UI says so. The strategy rule, and every metric, is real math on
// that path — that is the part meant to be defended.
import { maxDrawdown, mean, sampleStdev } from "./portfolioMath";

const WEEKS_PER_YEAR = 52;

export type RegimeKey = "gfc2008" | "covid2020" | "bear2022" | "bull";

export type Regime = {
  key: RegimeKey;
  label: string;
  short: string;
  start: string; // ISO date of week 0
  riskFree: number; // annual T-bill yield of the period, used in Sharpe/Sortino
  summary: string;
  phases: Phase[];
};

// Weekly drift and volatility of the benchmark for a stretch of weeks.
type Phase = { weeks: number; drift: number; vol: number };

export const REGIMES: Regime[] = [
  {
    key: "gfc2008",
    label: "2008 Financial Crisis",
    short: "2008 GFC",
    start: "2007-10-08",
    riskFree: 0.02,
    summary: "A slow grind lower, a credit-market crash, then a V-shaped recovery once the Fed and Treasury stepped in. The market spent months below its long-term average before the worst of it, which is the setup a trend rule is built for; the cost is re-entering late in the recovery.",
    phases: [
      { weeks: 34, drift: -0.006, vol: 0.028 }, // Oct 07 – Jun 08: grinding down, Bear Stearns
      { weeks: 14, drift: -0.030, vol: 0.055 }, // Sep – Dec 08: Lehman, panic
      { weeks: 12, drift: -0.012, vol: 0.045 }, // Jan – Mar 09: the final flush to 666
      { weeks: 40, drift: 0.0125, vol: 0.030 }, // Mar 09 – Dec 09: V recovery
    ],
  },
  {
    key: "covid2020",
    label: "2020 Pandemic Collapse",
    short: "2020 Covid",
    start: "2019-11-04",
    riskFree: 0.005,
    summary: "The fastest 30% drop in history (five weeks) and one of the fastest recoveries. A slow trend rule sells partway into the crash and buys back only once the rebound has crossed the average, so most of the edge comes from the leveraged months after re-entry.",
    phases: [
      { weeks: 15, drift: 0.004, vol: 0.014 }, // Nov 19 – Feb 20: calm melt-up
      { weeks: 5, drift: -0.070, vol: 0.070 }, // late Feb – Mar 23: crash
      { weeks: 22, drift: 0.018, vol: 0.035 }, // Apr – Aug: rebound
      { weeks: 18, drift: 0.005, vol: 0.022 }, // Sep – Dec: choppy new highs
    ],
  },
  {
    key: "bear2022",
    label: "2022 Inflationary Bear Market",
    short: "2022 Bear",
    start: "2022-01-03",
    riskFree: 0.02,
    summary: "No crash, just a year of lower highs and lower lows as the Fed hiked, with three sharp bear-market rallies. Rallies that fail are the trend rule's weak spot: it sells near a low, buys back into a bounce, then sells again, small losses that add up.",
    phases: [
      { weeks: 10, drift: -0.012, vol: 0.028 }, // Jan – Mar: first leg down
      { weeks: 4, drift: 0.020, vol: 0.020 }, // late Mar rally
      { weeks: 12, drift: -0.016, vol: 0.032 }, // Apr – Jun: second leg
      { weeks: 8, drift: 0.018, vol: 0.022 }, // Jul – Aug rally
      { weeks: 8, drift: -0.020, vol: 0.030 }, // Sep – Oct: third leg, the low
      { weeks: 10, drift: 0.010, vol: 0.025 }, // Nov – Dec: bounce, then fade
    ],
  },
  {
    key: "bull",
    label: "Bull Market Extension",
    short: "Bull run",
    start: "2023-01-02",
    riskFree: 0.045,
    summary: "Steady uptrend with shallow dips that never break the long-term average. The trend rule stays fully invested and leverage compounds, the environment this strategy was designed for, and the one where it looks best.",
    phases: [
      { weeks: 30, drift: 0.006, vol: 0.018 },
      { weeks: 12, drift: -0.004, vol: 0.020 }, // an autumn correction
      { weeks: 34, drift: 0.007, vol: 0.016 },
      { weeks: 6, drift: -0.012, vol: 0.026 }, // a sharper dip
      { weeks: 22, drift: 0.006, vol: 0.017 },
    ],
  },
];

// ---- the strategy --------------------------------------------------------
//
// A trend-following regime switch, the same idea as the site's live
// Momentum + Leverage book: when the benchmark is above its long-term
// moving average the book is "risk-on" at 1.3x exposure (a leveraged
// momentum tilt); when it is below, everything goes to cash at the
// risk-free rate. Weekly data, so the 200-trading-day average is ~40 weeks.
const TREND_WEEKS = 40;
const RISK_ON_EXPOSURE = 1.3;
// The tilt: risk-on weeks earn the leveraged benchmark plus a small,
// noisy momentum premium — roughly 3% a year, the long-run academic figure.
const MOMENTUM_PREMIUM_WEEKLY = 0.03 / WEEKS_PER_YEAR;
const MOMENTUM_NOISE_WEEKLY = 0.006;

export type WeekPoint = {
  date: string; // ISO
  week: number;
  strategy: number; // growth of $1
  benchmark: number; // growth of $1
  exposure: number; // 0 or 1.3
  strategyDd: number; // drawdown from peak, negative decimal
  benchmarkDd: number;
};

export type Metrics = {
  totalReturn: number;
  benchmarkReturn: number;
  cagr: number;
  benchmarkCagr: number;
  volatility: number; // annualised
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  benchmarkMaxDrawdown: number;
  maxDrawdownWeeks: number; // longest peak-to-recovery stretch
  benchmarkMaxDrawdownWeeks: number;
  timeInMarket: number; // share of weeks risk-on
  beta: number;
  bestWeek: number;
  worstWeek: number;
  weeks: number;
};

export type RegimeResult = { regime: Regime; points: WeekPoint[]; metrics: Metrics };

// Deterministic pseudo-random numbers (mulberry32) so every visitor sees the
// same paths and the module is pure. Box–Muller turns two uniforms into one
// standard normal draw.
function makeRng(seed: number) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(uniform(), 1e-12);
    const v = uniform();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { uniform, normal };
}

function addWeeks(iso: string, weeks: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

// Longest stretch (in weeks) spent below a previous peak. Counts from the
// week the peak was set until the week the series makes a new high; if it
// never recovers, the stretch runs to the end of the data.
export function maxDrawdownDuration(values: number[]): number {
  let peakIndex = 0;
  let longest = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] >= values[peakIndex]) peakIndex = i;
    else longest = Math.max(longest, i - peakIndex);
  }
  return longest;
}

function runRegime(regime: Regime, seed: number): RegimeResult {
  const rng = makeRng(seed);

  // Benchmark weekly returns: a calm lead-in (so the moving average exists
  // on week 0) followed by the regime's phases.
  const leadIn: Phase = { weeks: TREND_WEEKS, drift: 0.002, vol: 0.016 };
  const benchReturns: number[] = [];
  for (const p of [leadIn, ...regime.phases]) {
    // Draw the phase's noise, then remove its mean: the phase drift alone
    // sets where the path ends up, so each regime's totals stay close to
    // the real episode's instead of drifting with the seed.
    const z = Array.from({ length: p.weeks }, () => rng.normal());
    const zMean = mean(z);
    for (const zi of z) benchReturns.push(p.drift + p.vol * (zi - zMean));
  }

  // Benchmark price path (growth of $1 from the start of the lead-in).
  const benchPrice: number[] = [1];
  for (const r of benchReturns) benchPrice.push(benchPrice[benchPrice.length - 1] * (1 + r));

  // Walk the visible window. The signal for week t uses prices up to t-1 —
  // you can only act on what you already know.
  const rfWeekly = regime.riskFree / WEEKS_PER_YEAR;
  const points: WeekPoint[] = [];
  const stratReturns: number[] = [];
  const visibleBenchReturns: number[] = [];
  let strat = 1;
  const benchBase = benchPrice[TREND_WEEKS]; // rebase so week 0 = $1
  let stratPeak = 1;
  let benchPeak = 1;
  for (let t = TREND_WEEKS; t < benchPrice.length; t++) {
    const priceNow = benchPrice[t];
    const trailing = benchPrice.slice(t - TREND_WEEKS, t);
    const trendOn = benchPrice[t - 1] > mean(trailing);
    const exposure = trendOn ? RISK_ON_EXPOSURE : 0;

    if (t > TREND_WEEKS) {
      const rBench = benchReturns[t - 1];
      const rStrat = trendOn ? exposure * rBench + MOMENTUM_PREMIUM_WEEKLY + MOMENTUM_NOISE_WEEKLY * rng.normal() : rfWeekly;
      strat *= 1 + rStrat;
      stratReturns.push(rStrat);
      visibleBenchReturns.push(rBench);
    }
    const bench = priceNow / benchBase;
    stratPeak = Math.max(stratPeak, strat);
    benchPeak = Math.max(benchPeak, bench);
    points.push({
      date: addWeeks(regime.start, t - TREND_WEEKS),
      week: t - TREND_WEEKS,
      strategy: strat,
      benchmark: bench,
      exposure,
      strategyDd: strat / stratPeak - 1,
      benchmarkDd: bench / benchPeak - 1,
    });
  }

  return { regime, points, metrics: computeMetrics(points, stratReturns, visibleBenchReturns, rfWeekly) };
}

function computeMetrics(points: WeekPoint[], stratReturns: number[], benchReturns: number[], rfWeekly: number): Metrics {
  const n = stratReturns.length;
  const years = n / WEEKS_PER_YEAR;
  const last = points[points.length - 1];

  // Sharpe = annualised excess return / annualised volatility.
  // Weekly mean × 52 for the return; weekly stdev × √52 for the risk.
  const excess = stratReturns.map((r) => r - rfWeekly);
  const annExcess = mean(excess) * WEEKS_PER_YEAR;
  const annVol = sampleStdev(stratReturns) * Math.sqrt(WEEKS_PER_YEAR);
  const sharpe = annVol === 0 ? 0 : annExcess / annVol;

  // Sortino swaps volatility for DOWNSIDE deviation: only weeks that fell
  // short of the risk-free rate count as risk. Upside swings are not
  // penalised, so a strategy with big up-weeks and small down-weeks scores
  // higher on Sortino than on Sharpe.
  const shortfalls = excess.map((e) => Math.min(e, 0));
  const downsideDev = Math.sqrt(mean(shortfalls.map((s) => s * s))) * Math.sqrt(WEEKS_PER_YEAR);
  const sortino = downsideDev === 0 ? 0 : annExcess / downsideDev;

  // Beta = Cov(strategy, benchmark) / Var(benchmark); computed inline on
  // weekly returns. With a 0/1.3 exposure switch it lands well below 1.3
  // because the cash weeks contribute nothing.
  const mb = mean(benchReturns);
  const ms = mean(stratReturns);
  let cov = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    cov += (stratReturns[i] - ms) * (benchReturns[i] - mb);
    varB += (benchReturns[i] - mb) ** 2;
  }

  const stratSeries = points.map((p) => p.strategy);
  const benchSeries = points.map((p) => p.benchmark);
  return {
    totalReturn: last.strategy - 1,
    benchmarkReturn: last.benchmark - 1,
    // CAGR = (end / start) ^ (1 / years) − 1
    cagr: Math.pow(last.strategy, 1 / years) - 1,
    benchmarkCagr: Math.pow(last.benchmark, 1 / years) - 1,
    volatility: annVol,
    sharpe,
    sortino,
    maxDrawdown: maxDrawdown(stratSeries),
    benchmarkMaxDrawdown: maxDrawdown(benchSeries),
    maxDrawdownWeeks: maxDrawdownDuration(stratSeries),
    benchmarkMaxDrawdownWeeks: maxDrawdownDuration(benchSeries),
    timeInMarket: points.filter((p) => p.exposure > 0).length / points.length,
    beta: varB === 0 ? 0 : cov / varB,
    bestWeek: Math.max(...stratReturns),
    worstWeek: Math.min(...stratReturns),
    weeks: n,
  };
}

// Seeds are fixed per regime so the paths never change between visits.
const SEEDS: Record<RegimeKey, number> = { gfc2008: 20081015, covid2020: 20200323, bear2022: 20221012, bull: 20240101 };

export const REGIME_RESULTS: Record<RegimeKey, RegimeResult> = Object.fromEntries(
  REGIMES.map((r) => [r.key, runRegime(r, SEEDS[r.key])]),
) as Record<RegimeKey, RegimeResult>;
