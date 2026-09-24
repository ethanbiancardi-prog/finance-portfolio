import * as pm from "@/lib/portfolioMath";
import { getDailyBars } from "@/lib/marketdata";
import { RISK_FREE_RATE_ANNUAL } from "@/lib/constants";

export const MIN_TICKERS = 2;
export const MAX_TICKERS = 10; // keeps the covariance matrix + weights table readable
export const NUM_FRONTIER_SAMPLES = 2000; // enough for a dense scatter without a heavy payload
export const LOOKBACK_TRADING_DAYS = 252; // ~1yr of daily history for return/covariance estimates
export const MIN_HISTORY_DAYS = 20; // below this, a symbol is too new/illiquid to include

export type SampledPortfolio = { weights: number[]; return: number; volatility: number; sharpe: number };
export type FrontierResult = {
  symbols: string[];
  meanReturns: number[];
  // Annualized. Sent to the page so its risk slider can price blends of
  // frontier portfolios exactly instead of snapping between samples.
  covMatrix: number[][];
  samples: SampledPortfolio[];
  // The exact efficient frontier, lowest volatility first (traceFrontier).
  frontier: SampledPortfolio[];
  maxSharpe: SampledPortfolio;
  minVariance: SampledPortfolio;
};

// A uniformly random point on the simplex (weights >= 0, sum to 1 — no
// shorting, fully invested). Naively normalizing N independent Uniform(0,1)
// draws would NOT be uniform over the simplex — it clusters weights toward
// the center. Drawing from Exponential(1) first via -ln(uniform), then
// normalizing, is the standard fix (equivalent to a Dirichlet(1,...,1) draw).
export function randomSimplexWeights(n: number): number[] {
  const draws = Array.from({ length: n }, () => -Math.log(Math.random()));
  const total = draws.reduce((sum, d) => sum + d, 0);
  return draws.map((d) => d / total);
}

export function sampleFrontier(
  meanReturns: number[],
  covMatrix: number[][],
  numSamples: number = NUM_FRONTIER_SAMPLES,
): SampledPortfolio[] {
  const samples: SampledPortfolio[] = [];
  for (let i = 0; i < numSamples; i++) {
    const weights = randomSimplexWeights(meanReturns.length);
    const ret = pm.portfolioReturn(weights, meanReturns);
    const volatility = Math.sqrt(pm.portfolioVariance(weights, covMatrix));
    samples.push({ weights, return: ret, volatility, sharpe: pm.sharpeRatio(ret, volatility, RISK_FREE_RATE_ANNUAL) });
  }
  return samples;
}

export function findMaxSharpe(samples: SampledPortfolio[]): SampledPortfolio {
  return samples.reduce((best, s) => (s.sharpe > best.sharpe ? s : best));
}

export function findMinVariance(samples: SampledPortfolio[]): SampledPortfolio {
  return samples.reduce((best, s) => (s.volatility < best.volatility ? s : best));
}

// Nearest match by volatility against the existing sample cloud — a risk
// slider doesn't need a new per-target optimization, just a lookup.
export function findClosestByVolatility(samples: SampledPortfolio[], targetVolatility: number): SampledPortfolio {
  return samples.reduce((best, s) =>
    Math.abs(s.volatility - targetVolatility) < Math.abs(best.volatility - targetVolatility) ? s : best,
  );
}

// Euclidean projection onto the simplex {w >= 0, sum w = 1}: the closest
// long-only, fully-invested portfolio to an arbitrary vector (Duchi et al.,
// 2008).
function projectToSimplex(v: number[]): number[] {
  const u = [...v].sort((a, b) => b - a);
  let cumulative = 0;
  let theta = 0;
  for (let i = 0; i < u.length; i++) {
    cumulative += u[i];
    const t = (cumulative - 1) / (i + 1);
    if (u[i] - t > 0) theta = t;
  }
  return v.map((x) => Math.max(0, x - theta));
}

// Minimise  riskAversion * w'Σw - includeReturn * μ'w  over long-only,
// fully-invested portfolios, by projected gradient descent. The problem is
// convex, so this converges to the exact optimum; with at most 10 assets it
// takes milliseconds. `start` warm-starts it from a nearby solution.
function solveMeanVariance(
  mu: number[],
  cov: number[][],
  riskAversion: number,
  includeReturn: number,
  start: number[],
): number[] {
  // Step size from a bound on the gradient's Lipschitz constant
  // (2λ times the largest row sum of |Σ| bounds 2λ times its top eigenvalue).
  const norm = Math.max(...cov.map((row) => row.reduce((s, x) => s + Math.abs(x), 0)));
  const step = 1 / Math.max(2 * riskAversion * norm, 1e-9);
  let w = start;
  for (let iter = 0; iter < 20_000; iter++) {
    const grad = w.map((_, i) => 2 * riskAversion * cov[i].reduce((s, c, j) => s + c * w[j], 0) - includeReturn * mu[i]);
    const next = projectToSimplex(w.map((x, i) => x - step * grad[i]));
    const moved = Math.max(...next.map((x, i) => Math.abs(x - w[i])));
    w = next;
    if (moved < 1e-10) break;
  }
  return w;
}

const toPortfolio = (weights: number[], mu: number[], cov: number[][]): SampledPortfolio => {
  const ret = pm.portfolioReturn(weights, mu);
  const volatility = Math.sqrt(pm.portfolioVariance(weights, cov));
  return { weights, return: ret, volatility, sharpe: pm.sharpeRatio(ret, volatility, RISK_FREE_RATE_ANNUAL) };
};

// The exact long-only efficient frontier, as ~300 portfolios from the
// minimum-variance one up to the single highest-return asset. Each point
// solves the mean-variance problem for one level of risk aversion; stepping
// the risk aversion down smoothly traces the curve, and the weights along it
// change continuously, which is what makes the page's risk slider smooth.
export function traceFrontier(mu: number[], cov: number[][]): SampledPortfolio[] {
  const n = mu.length;
  const equal = new Array(n).fill(1 / n);
  let w = solveMeanVariance(mu, cov, 1, 0, equal); // pure minimum variance
  const points = [toPortfolio(w, mu, cov)];
  const STEPS = 300;
  for (let k = 0; k < STEPS; k++) {
    // Risk aversion from 10^4 down to 10^-3, log-spaced.
    const riskAversion = 10 ** (4 - (7 * k) / (STEPS - 1));
    w = solveMeanVariance(mu, cov, riskAversion, 1, w);
    points.push(toPortfolio(w, mu, cov));
  }
  // The top end: everything in the highest-return asset.
  const best = mu.indexOf(Math.max(...mu));
  points.push(toPortfolio(mu.map((_, i) => (i === best ? 1 : 0)), mu, cov));

  // Keep it strictly increasing in volatility and return (drops duplicates
  // where several risk-aversion levels land on the same corner portfolio).
  const frontier: SampledPortfolio[] = [];
  for (const p of points.sort((a, b) => a.volatility - b.volatility)) {
    const last = frontier[frontier.length - 1];
    if (!last || (p.volatility > last.volatility + 1e-6 && p.return > last.return + 1e-9)) frontier.push(p);
  }
  return frontier;
}

export async function computeEfficientFrontier(symbols: string[]): Promise<FrontierResult> {
  const barsBySymbol = await getDailyBars(symbols, LOOKBACK_TRADING_DAYS);
  const returnsBySymbol = symbols.map((s) => pm.dailyReturns((barsBySymbol.get(s) ?? []).map((b) => b.c)));

  const missing = symbols.filter((_, i) => returnsBySymbol[i].length < MIN_HISTORY_DAYS);
  if (missing.length > 0) {
    throw new Error(`Not enough price history for: ${missing.join(", ")}`);
  }

  const meanReturns = returnsBySymbol.map((r) => pm.annualizeReturn(pm.mean(r)));
  const covMatrix = pm.buildCovarianceMatrix(returnsBySymbol);
  const samples = sampleFrontier(meanReturns, covMatrix);
  const frontier = traceFrontier(meanReturns, covMatrix);

  return {
    symbols,
    meanReturns,
    covMatrix,
    samples,
    frontier,
    // From the exact frontier rather than the random cloud, so these are
    // the true optimum, not the best of 2,000 guesses.
    maxSharpe: findMaxSharpe(frontier),
    minVariance: frontier[0],
  };
}
