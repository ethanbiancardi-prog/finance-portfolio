import * as pm from "@/lib/portfolioMath";
import { getDailyBars } from "@/lib/marketdata";

export const NUM_SIMULATION_PATHS = 10000;
export const PERCENTILE_BANDS = [10, 50, 90] as const; // pessimistic / median / optimistic fan lines
export const STOCK_PROXY_SYMBOL = "SPY";
export const BOND_PROXY_SYMBOL = "AGG";
// ~5 years of daily bars — long enough to smooth over one unusually good or
// bad year when estimating the return/volatility assumptions below.
export const ASSUMPTION_LOOKBACK_TRADING_DAYS = 1260;

export type SimulationInputs = {
  startingBalance: number;
  annualContribution: number;
  stockAllocationPct: number; // 0-1, remainder in bonds
  years: number;
  goal: number;
};

export type YearlyBand = { year: number; p10: number; p50: number; p90: number };
export type SimulationResult = { bands: YearlyBand[]; probabilityOfHittingGoal: number };
export type BlendedAssumptions = { annualReturn: number; annualVolatility: number };

// Box-Muller transform: turns two independent Uniform(0,1) draws into one
// standard-normal draw — the standard way to generate normal random numbers
// without a built-in normal RNG in JS.
function sampleStandardNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Blends real SPY (stock) and AGG (bond) history into one expected
// return/volatility for the chosen allocation, using the same
// portfolioReturn/portfolioVariance functions the optimizer uses — a
// stock/bond blend is exactly a 2-asset portfolio.
export async function getBlendedAssumptions(stockAllocationPct: number): Promise<BlendedAssumptions> {
  const bars = await getDailyBars(
    [STOCK_PROXY_SYMBOL, BOND_PROXY_SYMBOL],
    ASSUMPTION_LOOKBACK_TRADING_DAYS,
  );
  const stockReturns = pm.dailyReturns((bars.get(STOCK_PROXY_SYMBOL) ?? []).map((b) => b.c));
  const bondReturns = pm.dailyReturns((bars.get(BOND_PROXY_SYMBOL) ?? []).map((b) => b.c));

  const meanReturns = [
    pm.annualizeReturn(pm.mean(stockReturns)),
    pm.annualizeReturn(pm.mean(bondReturns)),
  ];
  const covMatrix = pm.buildCovarianceMatrix([stockReturns, bondReturns]);
  const weights = [stockAllocationPct, 1 - stockAllocationPct];

  return {
    annualReturn: pm.portfolioReturn(weights, meanReturns),
    annualVolatility: Math.sqrt(pm.portfolioVariance(weights, covMatrix)),
  };
}

// One possible future: each year, draw a random return from
// Normal(annualReturn, annualVolatility), grow the balance, add that
// year's contribution. Simplification — real returns have fatter tails
// than a normal distribution predicts, so this understates how bad a bad
// year can be — but it's the standard first-pass model real retirement
// calculators use, and it's fast enough to run 10,000 of these per request.
function simulateOnePath(
  inputs: SimulationInputs,
  annualReturn: number,
  annualVolatility: number,
): number[] {
  const balances: number[] = [];
  let balance = inputs.startingBalance;
  for (let year = 1; year <= inputs.years; year++) {
    const drawnReturn = annualReturn + annualVolatility * sampleStandardNormal();
    balance = Math.max(0, balance * (1 + drawnReturn) + inputs.annualContribution);
    balances.push(balance);
  }
  return balances;
}

function percentile(sortedValues: number[], p: number): number {
  const index = Math.floor((p / 100) * (sortedValues.length - 1));
  return sortedValues[index];
}

export function runMonteCarloSimulation(
  inputs: SimulationInputs,
  annualReturn: number,
  annualVolatility: number,
  numPaths: number = NUM_SIMULATION_PATHS,
): SimulationResult {
  const balancesByYear: number[][] = Array.from({ length: inputs.years }, () => []);

  for (let path = 0; path < numPaths; path++) {
    const pathBalances = simulateOnePath(inputs, annualReturn, annualVolatility);
    pathBalances.forEach((balance, i) => balancesByYear[i].push(balance));
  }

  const bands: YearlyBand[] = balancesByYear.map((yearBalances, i) => {
    const sorted = [...yearBalances].sort((a, b) => a - b);
    return {
      year: i + 1,
      p10: percentile(sorted, 10),
      p50: percentile(sorted, 50),
      p90: percentile(sorted, 90),
    };
  });

  const finalBalances = balancesByYear[balancesByYear.length - 1] ?? [];
  const probabilityOfHittingGoal =
    finalBalances.length === 0
      ? 0
      : finalBalances.filter((b) => b >= inputs.goal).length / finalBalances.length;

  return { bands, probabilityOfHittingGoal };
}
