// Shared portfolio math used by the paper-trading risk metrics, the
// portfolio optimizer, and the Monte Carlo simulator, so every feature on
// the site computes return/risk the same way instead of three slightly
// different reimplementations.

export const TRADING_DAYS_PER_YEAR = 252; // standard US market convention

// Day-over-day % change: r_t = price_t / price_{t-1} - 1
export function dailyReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(prices[i] / prices[i - 1] - 1);
  }
  return returns;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Sample standard deviation (n-1 denominator) — same convention rotation.ts
// already uses for its momentum-score volatility.
export function sampleStdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// Sample covariance between two equal-length return series (n-1 denominator).
export function sampleCovariance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return 0;
  const meanA = mean(a);
  const meanB = mean(b);
  const sum = a.reduce((s, v, i) => s + (v - meanA) * (b[i] - meanB), 0);
  return sum / (a.length - 1);
}

// Daily -> annualized. Assumes returns are i.i.d. day to day — a standard
// simplification, not literally true (returns have some autocorrelation),
// but the conventional first-pass approach.
export function annualizeReturn(dailyMeanReturn: number): number {
  return dailyMeanReturn * TRADING_DAYS_PER_YEAR;
}

export function annualizeVolatility(dailyStdev: number): number {
  return dailyStdev * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

// Sharpe = (annualized return - risk-free rate) / annualized volatility.
// Return earned per unit of risk taken, above what a risk-free asset would
// pay. Guards against divide-by-zero for a flat (halted/illiquid) series.
export function sharpeRatio(
  annualReturn: number,
  annualVolatility: number,
  riskFreeRate: number,
): number {
  if (annualVolatility === 0) return 0;
  return (annualReturn - riskFreeRate) / annualVolatility;
}

// Largest peak-to-trough decline, as a negative decimal (-0.18 = -18%).
// One pass: track the running peak, keep the worst drop from it seen so far.
export function maxDrawdown(values: number[]): number {
  if (values.length === 0) return 0;
  let peak = values[0];
  let worst = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const drawdown = peak === 0 ? 0 : v / peak - 1;
    if (drawdown < worst) worst = drawdown;
  }
  return worst;
}

// Beta = Cov(portfolio, benchmark) / Var(benchmark) — how much the
// portfolio tends to move per 1% move in the benchmark. 1.0 = moves with
// the market, >1 = more volatile than the market, <1 = less.
export function beta(portfolioReturns: number[], benchmarkReturns: number[]): number {
  const benchmarkVariance = sampleStdev(benchmarkReturns) ** 2;
  if (benchmarkVariance === 0) return 0;
  return sampleCovariance(portfolioReturns, benchmarkReturns) / benchmarkVariance;
}

// E[Rp] = sum(w_i * E[R_i])
export function portfolioReturn(weights: number[], meanReturns: number[]): number {
  return weights.reduce((sum, w, i) => sum + w * meanReturns[i], 0);
}

// Var(Rp) = w^T * Cov * w — the reason diversification works: two volatile
// but uncorrelated (or negatively correlated) assets can combine into a
// less-volatile portfolio than either held alone.
export function portfolioVariance(weights: number[], covMatrix: number[][]): number {
  let variance = 0;
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      variance += weights[i] * weights[j] * covMatrix[i][j];
    }
  }
  return variance;
}

// Builds an annualized covariance matrix from N daily-return series
// (covariance scales linearly with time under the same i.i.d. assumption
// used to annualize variance/volatility above).
export function buildCovarianceMatrix(returnsBySymbol: number[][]): number[][] {
  const n = returnsBySymbol.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      matrix[i][j] = sampleCovariance(returnsBySymbol[i], returnsBySymbol[j]) * TRADING_DAYS_PER_YEAR;
    }
  }
  return matrix;
}

// Joins two date-keyed series on matching dates only (handles a holiday one
// series has bars for and the other doesn't).
export function alignByDate<A extends { date: string }, B extends { date: string }>(
  a: A[],
  b: B[],
): { date: string; a: A; b: B }[] {
  const bByDate = new Map(b.map((item) => [item.date, item]));
  const aligned: { date: string; a: A; b: B }[] = [];
  for (const itemA of a) {
    const itemB = bByDate.get(itemA.date);
    if (itemB) aligned.push({ date: itemA.date, a: itemA, b: itemB });
  }
  return aligned;
}
