import { RISK_FREE_RATE_ANNUAL } from "@/lib/constants";
import * as pm from "@/lib/portfolioMath";
import type { DailyBar } from "@/lib/marketdata";

export type EquityPoint = { date: string; equity: number }; // date = YYYY-MM-DD

export type RiskMetrics = {
  sharpe: number;
  annualizedVolatility: number;
  maxDrawdown: number;
  beta: number;
  periodDays: number; // sample size — shown in the UI as a noise caveat
};

export function computeRiskMetrics(equityHistory: EquityPoint[], spyBars: DailyBar[]): RiskMetrics {
  const equityCloses = equityHistory.map((p) => p.equity);
  const spyByDate = new Map(spyBars.map((b) => [b.t.slice(0, 10), b.c]));

  // Align on matching dates only — a market holiday one series has a bar
  // for and the other doesn't would otherwise misalign the return pairs.
  const aligned = equityHistory
    .map((p) => ({ equity: p.equity, spy: spyByDate.get(p.date) }))
    .filter((p): p is { equity: number; spy: number } => p.spy != null);

  const portfolioReturns = pm.dailyReturns(equityCloses);
  const alignedPortfolioReturns = pm.dailyReturns(aligned.map((p) => p.equity));
  const spyReturns = pm.dailyReturns(aligned.map((p) => p.spy));

  const annualReturn = pm.annualizeReturn(pm.mean(portfolioReturns));
  const annualVolatility = pm.annualizeVolatility(pm.sampleStdev(portfolioReturns));

  return {
    sharpe: pm.sharpeRatio(annualReturn, annualVolatility, RISK_FREE_RATE_ANNUAL),
    annualizedVolatility: annualVolatility,
    maxDrawdown: pm.maxDrawdown(equityCloses),
    beta: pm.beta(alignedPortfolioReturns, spyReturns),
    periodDays: equityHistory.length,
  };
}
