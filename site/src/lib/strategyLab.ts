// Strategy Lab: five classic trading strategies replayed day by day on real
// prices, all starting with the same $100,000 on the same day. Pure math,
// no fetching, so it can be tested on any price table (lib/strategyLabData.ts
// feeds it real Alpaca history and caches the result).
//
// Rules every strategy follows, so the comparison is fair:
//   - Decisions use closing prices up to day t and are filled at day t+1's
//     close. Deciding and filling on the same close would let a strategy
//     "see" the price it trades at (look-ahead bias).
//   - Long only, no borrowing. Cash earns nothing (a simplification that
//     slightly understates the strategies that spend time in cash).
//   - Every buy and sell pays 0.05% for the spread and slippage.
//   - Prices include dividends, so buy-and-hold gets credit for them.

import * as pm from "./portfolioMath";

export const START_CASH = 100_000;
const COST = 0.0005; // per trade, as a share of the amount traded
const WARMUP = 253; // a year of history before anyone trades (momentum needs 12 months)

export type PriceTable = {
  dates: string[]; // trading days, oldest first
  close: Map<string, number[]>; // aligned to dates; NaN before a stock listed
};

// What a strategy wants to hold after the close on day t: the full set of
// names, plus the share of account value to put into each name it doesn't
// already own. Names it owns and keeps are left alone (no rebalancing churn).
export type Decision = { hold: Set<string>; entryWeight: number } | null; // null = no change

type Strategy = {
  key: StrategyKey;
  name: string;
  family: string;
  idea: string;
  rules: string[];
  decide: (t: number, held: Set<string>, ctx: Ctx) => Decision;
};

export type StrategyKey = "buyhold" | "trend" | "momentum" | "meanrev" | "breakout";

// --- Indicators (each reads only data up to and including day t) ------------

// `first` marks a portfolio's first trading day, so a strategy that only
// acts on a schedule (momentum, monthly) still invests on day one instead of
// sitting in cash until the next first-of-the-month.
export type Ctx = { table: PriceTable; universe: string[]; spy: number[]; first?: boolean };

const at = (series: number[] | undefined, t: number) => (series ? series[t] : NaN);

// Simple moving average of the last n closes ending at t.
function sma(series: number[], t: number, n: number): number {
  if (t + 1 < n) return NaN;
  let sum = 0;
  for (let i = t - n + 1; i <= t; i++) sum += series[i];
  return sum / n; // NaN propagates if any day is missing
}

// RSI (Relative Strength Index), Wilder-style but over a short window: the
// average up-move over the average absolute move, scaled 0-100. Under 10 on
// a 2-day RSI means two sharp down days in a row: "oversold".
function rsi(series: number[], t: number, n: number): number {
  if (t < n) return NaN;
  let up = 0;
  let down = 0;
  for (let i = t - n + 1; i <= t; i++) {
    const change = series[i] - series[i - 1];
    if (change > 0) up += change;
    else down -= change;
  }
  if (up + down === 0) return 50;
  return (100 * up) / (up + down);
}

function highest(series: number[], from: number, to: number): number {
  let h = -Infinity;
  for (let i = from; i <= to; i++) h = Math.max(h, series[i]);
  return h;
}
function lowest(series: number[], from: number, to: number): number {
  let l = Infinity;
  for (let i = from; i <= to; i++) l = Math.min(l, series[i]);
  return l;
}

const newMonth = (dates: string[], t: number) => t === 0 || dates[t].slice(0, 7) !== dates[t - 1].slice(0, 7);

// --- The five strategies -----------------------------------------------------

const MAX_POSITIONS = 10;

export const STRATEGIES: Strategy[] = [
  {
    key: "buyhold",
    name: "Buy and hold S&P 500",
    family: "Passive (the benchmark)",
    idea: "Put everything in SPY on day one and never touch it. Every other strategy has to beat this to be worth the effort.",
    rules: ["Day one: buy SPY with all the cash.", "Never sell."],
    decide: () => ({ hold: new Set(["SPY"]), entryWeight: 1 }),
  },
  {
    key: "trend",
    name: "Trend following",
    family: "Technical: trend",
    idea: "Own the market while it's going up; step aside into cash when its trend breaks, to dodge the worst of crashes.",
    rules: [
      "Hold SPY while it closes above its 200-day average.",
      "Sell everything to cash when it closes below; buy back when it closes above again.",
    ],
    decide: (t, _held, { spy }) => {
      const avg = sma(spy, t, 200);
      if (Number.isNaN(avg)) return null;
      return spy[t] > avg ? { hold: new Set(["SPY"]), entryWeight: 1 } : { hold: new Set(), entryWeight: 0 };
    },
  },
  {
    key: "momentum",
    name: "Momentum",
    family: "Technical: momentum",
    idea: "Stocks that rose most over the past year tend to keep outperforming for a while. One of the best-documented effects in finance research.",
    rules: [
      "First trading day of each month: rank every stock by its return over the last 12 months, skipping the most recent month.",
      "Hold the top 10, about 10% each. Sell any that drop out of the top 10.",
    ],
    decide: (t, _held, { table, universe, first }) => {
      if (!newMonth(table.dates, t) && !first) return null;
      // 12-1 momentum: price 21 trading days ago vs. 252 days ago. Skipping
      // the last month avoids the short-term reversal that muddies it.
      const ranked = universe
        .map((s) => {
          const c = table.close.get(s)!;
          return { s, r: c[t - 21] / c[t - 252] - 1 };
        })
        .filter((x) => Number.isFinite(x.r) && Number.isFinite(at(table.close.get(x.s), t)))
        .sort((a, b) => b.r - a.r)
        .slice(0, MAX_POSITIONS);
      return { hold: new Set(ranked.map((x) => x.s)), entryWeight: 1 / MAX_POSITIONS };
    },
  },
  {
    key: "meanrev",
    name: "Mean reversion",
    family: "Technical: mean reversion",
    idea: "Sharp short-term drops in strong stocks tend to bounce back. Buy the dip, sell the bounce within days.",
    rules: [
      "Buy when a stock's 2-day RSI falls under 10 (two hard down days) while it's still above its 200-day average.",
      "Sell when it closes back above its 5-day average.",
      "Up to 10 positions, about 10% each; the most oversold go first.",
    ],
    decide: (t, held, { table, universe }) => {
      const hold = new Set<string>();
      for (const s of held) {
        const c = table.close.get(s)!;
        if (!(c[t] > sma(c, t, 5))) hold.add(s); // not yet bounced: keep
      }
      const entries = universe
        .filter((s) => !held.has(s))
        .map((s) => {
          const c = table.close.get(s)!;
          return { s, rsi: rsi(c, t, 2), ok: c[t] > sma(c, t, 200) };
        })
        .filter((x) => x.ok && x.rsi < 10)
        .sort((a, b) => a.rsi - b.rsi);
      for (const e of entries) {
        if (hold.size >= MAX_POSITIONS) break;
        hold.add(e.s);
      }
      return { hold, entryWeight: 1 / MAX_POSITIONS };
    },
  },
  {
    key: "breakout",
    name: "Breakout",
    family: "Technical: breakout",
    idea: "When a stock pushes through its highest price in months, a new uptrend may be starting. The rules of the 1980s 'Turtle' traders.",
    rules: [
      "Buy when a stock closes above its highest close of the previous 55 trading days (about 11 weeks).",
      "Sell when it closes below its lowest close of the previous 20 trading days.",
      "Up to 10 positions, about 10% each; the strongest 6-month gainers go first.",
    ],
    decide: (t, held, { table, universe }) => {
      if (t < 126) return null;
      const hold = new Set<string>();
      for (const s of held) {
        const c = table.close.get(s)!;
        if (!(c[t] < lowest(c, t - 20, t - 1))) hold.add(s);
      }
      const entries = universe
        .filter((s) => !held.has(s))
        .map((s) => {
          const c = table.close.get(s)!;
          return { s, breakout: c[t] > highest(c, t - 55, t - 1), strength: c[t] / c[t - 126] - 1 };
        })
        .filter((x) => x.breakout && Number.isFinite(x.strength))
        .sort((a, b) => b.strength - a.strength);
      for (const e of entries) {
        if (hold.size >= MAX_POSITIONS) break;
        hold.add(e.s);
      }
      return { hold, entryWeight: 1 / MAX_POSITIONS };
    },
  },
];

// --- Simulator ---------------------------------------------------------------

type SimResult = { equity: number[]; trades: number; daysInvested: number };

function simulate(strategy: Strategy, ctx: Ctx, from: number): SimResult {
  const { table } = ctx;
  const shares = new Map<string, number>();
  let cash = START_CASH;
  let trades = 0;
  let daysInvested = 0;
  let pending: Decision = null;
  const equity: number[] = [];

  const price = (s: string, t: number) => table.close.get(s)![t];
  const value = (t: number) => {
    let v = cash;
    for (const [s, q] of shares) v += q * price(s, t);
    return v;
  };

  for (let t = from; t < table.dates.length; t++) {
    // 1. Fill yesterday's decision at today's close. Sells first, so their
    // cash is available for the buys.
    if (pending) {
      for (const [s, q] of [...shares]) {
        if (pending.hold.has(s)) continue;
        cash += q * price(s, t) * (1 - COST);
        shares.delete(s);
        trades++;
      }
      const target = value(t) * pending.entryWeight;
      for (const s of pending.hold) {
        if (shares.has(s)) continue;
        const p = price(s, t);
        if (!Number.isFinite(p)) continue; // no price today: skip this entry
        const spend = Math.min(target, cash);
        if (spend < 1) continue;
        shares.set(s, (spend * (1 - COST)) / p);
        cash -= spend;
        trades++;
      }
      pending = null;
    }

    equity.push(value(t));
    if (shares.size > 0) daysInvested++;

    // 2. Decide on today's close, to be filled tomorrow.
    if (t < table.dates.length - 1) pending = strategy.decide(t, new Set(shares.keys()), { ...ctx, first: t === from });
  }
  return { equity, trades, daysInvested };
}

// --- Results -----------------------------------------------------------------

export type Metrics = {
  finalValue: number;
  totalReturn: number;
  cagr: number; // compound annual growth rate
  volatility: number; // annualised
  sharpe: number; // excess over 0%: cash earns nothing in this lab
  maxDrawdown: number;
  bestYear: { year: string; ret: number };
  worstYear: { year: string; ret: number };
  trades: number;
  timeInvested: number; // share of days holding anything
};

export type LabStrategy = Omit<Strategy, "decide"> & { metrics: Metrics; yearly: Record<string, number> };

export type LabResult = {
  generatedAt: string;
  start: string;
  end: string;
  universeSize: number;
  strategies: LabStrategy[];
  // Weekly account values (every 5th trading day plus the last), for the chart.
  curve: ({ date: string } & Record<StrategyKey, number>)[];
};

function yearlyReturns(dates: string[], equity: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  let startValue = START_CASH;
  for (let i = 0; i < equity.length; i++) {
    const year = dates[i].slice(0, 4);
    const last = i === equity.length - 1 || dates[i + 1].slice(0, 4) !== year;
    if (last) {
      out[year] = equity[i] / startValue - 1;
      startValue = equity[i];
    }
  }
  return out;
}

function metrics(dates: string[], sim: SimResult): { metrics: Metrics; yearly: Record<string, number> } {
  const eq = sim.equity;
  const years = eq.length / pm.TRADING_DAYS_PER_YEAR;
  const finalValue = eq[eq.length - 1];
  const returns = pm.dailyReturns(eq);
  const volatility = pm.annualizeVolatility(pm.sampleStdev(returns));
  const yearly = yearlyReturns(dates, eq);
  const entries = Object.entries(yearly);
  const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const worst = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  return {
    yearly,
    metrics: {
      finalValue,
      totalReturn: finalValue / START_CASH - 1,
      cagr: (finalValue / START_CASH) ** (1 / years) - 1,
      volatility,
      sharpe: pm.sharpeRatio(pm.annualizeReturn(pm.mean(returns)), volatility, 0),
      maxDrawdown: pm.maxDrawdown(eq),
      bestYear: { year: best[0], ret: best[1] },
      worstYear: { year: worst[0], ret: worst[1] },
      trades: sim.trades,
      timeInvested: sim.daysInvested / eq.length,
    },
  };
}

export function runLab(table: PriceTable, universe: string[]): LabResult {
  const spy = table.close.get("SPY");
  if (!spy) throw new Error("SPY prices are required");
  const ctx: Ctx = { table, universe, spy };
  const from = WARMUP;
  const dates = table.dates.slice(from);

  const sims = STRATEGIES.map((s) => ({ s, sim: simulate(s, ctx, from) }));
  const curve: LabResult["curve"] = [];
  for (let i = 0; i < dates.length; i++) {
    if (i % 5 !== 0 && i !== dates.length - 1) continue;
    const point = { date: dates[i] } as LabResult["curve"][number];
    for (const { s, sim } of sims) point[s.key] = Math.round(sim.equity[i]);
    curve.push(point);
  }

  return {
    generatedAt: new Date().toISOString(),
    start: dates[0],
    end: dates[dates.length - 1],
    universeSize: universe.length,
    strategies: sims.map(({ s, sim }) => {
      const { decide: _decide, ...info } = s;
      void _decide;
      return { ...info, ...metrics(dates, sim) };
    }),
    curve,
  };
}

// Line up every symbol's bars on SPY's trading days. A day a stock has no
// bar (it hadn't listed yet) stays NaN; a gap after it lists carries the
// last close forward, as a real holder would see it.
export function buildTable(bars: Map<string, { t: string; c: number }[]>): PriceTable {
  const dates = (bars.get("SPY") ?? []).map((b) => b.t.slice(0, 10));
  const index = new Map(dates.map((d, i) => [d, i]));
  const close = new Map<string, number[]>();
  for (const [symbol, list] of bars) {
    const series = new Array<number>(dates.length).fill(NaN);
    for (const b of list) {
      const i = index.get(b.t.slice(0, 10));
      if (i !== undefined) series[i] = b.c;
    }
    for (let i = 1; i < series.length; i++) {
      if (Number.isNaN(series[i]) && !Number.isNaN(series[i - 1])) series[i] = series[i - 1];
    }
    close.set(symbol, series);
  }
  return { dates, close };
}
