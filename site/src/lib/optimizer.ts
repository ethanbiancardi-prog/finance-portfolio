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
  samples: SampledPortfolio[];
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

  return {
    symbols,
    meanReturns,
    samples,
    maxSharpe: findMaxSharpe(samples),
    minVariance: findMinVariance(samples),
  };
}
