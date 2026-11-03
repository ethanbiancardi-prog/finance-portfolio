// The test bench shared by every ML model (train.ts: boosted trees,
// train-cnn.ts: the chart-reading network), so each is scored by exactly
// the same code on exactly the same rows:
//   - loadPanel: the cached data, turned into one row per stock per week
//   - walkForwardFolds / kFoldFolds: which rows each test trains and tests on
//   - runTest: trains each model per fold, scores the blind rows, and
//     measures IC and top-10 portfolios on the ~94 core stocks
//   - testSection: those results as Markdown tables for the report

import { readFileSync } from "node:fs";
import type { Bars, MacroKey, MacroSeries } from "../../src/lib/ml/data";
import { buildPanel, FEATURE_KEYS, groupBy, HORIZON, percentileRanks, type PanelRow } from "../../src/lib/ml/features";
import type { FundamentalSnapshot } from "../../src/lib/ml/fundamentals";
import { labUniverse } from "../../src/lib/strategyLabData";

export const SAMPLE_EVERY = 5; // one row per stock per week
export const FIRST_TEST_YEAR = 2019;
export const FOLDS = 5;
export const TOP_N = 10; // stocks the robot would hold
export const COST = 0.001; // 0.1% of each dollar traded, for spreads and slippage
export const CORE = new Set(labUniverse());
export const col = Object.fromEntries(FEATURE_KEYS.map((k, i) => [k, i])) as Record<(typeof FEATURE_KEYS)[number], number>;

export type Score = (r: PanelRow) => number;
export type Fold = { label: string; test: number[]; trainOk: (r: PanelRow) => boolean };
// Trains on the given rows; resolves to a function that scores any row.
export type Trainer = (trainRows: PanelRow[], fold: Fold) => Promise<Score>;

// --- statistics, spelled out -----------------------------------------------

export const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
export const sd = (a: number[]) => Math.sqrt(a.reduce((s, v) => s + (v - mean(a)) ** 2, 0) / (a.length - 1));
function pearson(a: number[], b: number[]) {
  const ma = mean(a);
  const mb = mean(b);
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : NaN;
}
// Rank correlation: do higher scores go with higher returns, in order?
// +1 = perfectly, 0 = no relation, −1 = backwards.
export function spearman(a: number[], b: number[]) {
  const ok = a.map((v, i) => Number.isFinite(v) && Number.isFinite(b[i]));
  const x = a.filter((_, i) => ok[i]);
  const y = b.filter((_, i) => ok[i]);
  if (x.length < 10 || new Set(x).size < 2) return NaN;
  return pearson(percentileRanks(x), percentileRanks(y));
}

// The IC ("information coefficient"): the rank correlation between a score
// and the next month's returns across stocks on one day, averaged over
// days. In stock picking an IC of 0.02–0.05 that holds up year after year
// is good; 0.10 is suspicious. The t-stat says how far from luck it is
// (above ~2 is unlikely to be luck). Weekly rows with month-long returns
// overlap 4-to-1, so only every 4th day counts as independent.
export function icStats(byDay: Map<number, PanelRow[]>, score: Score) {
  const daily: { year: string; ic: number }[] = [];
  for (const rows of byDay.values()) {
    const ic = spearman(rows.map(score), rows.map((r) => r.fwd));
    if (Number.isFinite(ic)) daily.push({ year: rows[0].date.slice(0, 4), ic });
  }
  const ics = daily.map((d) => d.ic);
  const years = [...new Set(daily.map((d) => d.year))];
  const yearly = years.map((y) => mean(daily.filter((d) => d.year === y).map((d) => d.ic)));
  const ic = mean(ics);
  return {
    ic,
    t: (ic / sd(ics)) * Math.sqrt(ics.length / (HORIZON / SAMPLE_EVERY)),
    sameSignYears: yearly.filter((v) => Math.sign(v) === Math.sign(ic)).length,
    years: years.length,
    yearly: Object.fromEntries(years.map((y, k) => [y, yearly[k]])),
  };
}

// --- data -------------------------------------------------------------------

export function loadPanel(universe: string) {
  if (universe !== "core" && universe !== "sp500") throw new Error(`Unknown universe "${universe}"`);
  const read = (f: string) => JSON.parse(readFileSync(`.ml-cache/${universe}/${f}`, "utf8"));
  const bars = new Map<string, Bars>(Object.entries(read("bars.json")));
  const rawCloses = new Map<string, Map<string, number>>(
    Object.entries(read("raw-closes.json") as Record<string, Record<string, number>>).map(([s, m]) => [s, new Map(Object.entries(m))]),
  );
  const fundamentals = new Map<string, FundamentalSnapshot[]>(Object.entries(read("fundamentals.json")));
  const macro = read("macro.json") as Record<MacroKey, MacroSeries>;
  const spy = bars.get("SPY")!;
  const symbols = [...bars.keys()].filter((s) => s !== "SPY");

  const days: number[] = [];
  for (let d = 252; d < spy.t.length; d += SAMPLE_EVERY) days.push(d);
  console.log(`Building features for ${symbols.length} stocks…`);
  const labelled = buildPanel({ bars, rawCloses, fundamentals, macro }, symbols, days).filter((r) => Number.isFinite(r.fwd));
  const byDay = groupBy(labelled, (r) => r.day);
  const sortedDays = [...byDay.keys()].sort((a, b) => a - b);
  const firstDate = labelled.reduce((m, r) => (r.date < m ? r.date : m), "9999");
  const lastDate = labelled.reduce((m, r) => (r.date > m ? r.date : m), "");
  console.log(`${labelled.length} rows, ${byDay.size} weeks, ${firstDate} to ${lastDate}`);
  return { bars, spy, symbols, labelled, byDay, sortedDays, firstDate, lastDate };
}
export type Panel = ReturnType<typeof loadPanel>;

// --- folds ------------------------------------------------------------------

// Walk-forward: train on everything before each year, with a 20-day gap so
// no training label reaches into the test year.
export function walkForwardFolds(p: Panel): Fold[] {
  const years = [...new Set(p.labelled.map((r) => Number(r.date.slice(0, 4))))].filter((y) => y >= FIRST_TEST_YEAR);
  return years.map((year) => {
    const test = p.sortedDays.filter((d) => Number(p.spy.t[d].slice(0, 4)) === year);
    return { label: String(year), test, trainOk: (r) => r.day + HORIZON < test[0] };
  });
}

// Purged k-fold: k equal blocks of weeks; drop training rows within 20
// trading days of the test block on either side.
export function kFoldFolds(p: Panel, k = FOLDS): Fold[] {
  const blockSize = Math.ceil(p.sortedDays.length / k);
  return Array.from({ length: k }, (_, j) => {
    const test = p.sortedDays.slice(j * blockSize, (j + 1) * blockSize);
    const [from, to] = [test[0], test[test.length - 1]];
    return {
      label: `${j + 1} (${p.spy.t[from].slice(0, 7)} to ${p.spy.t[to].slice(0, 7)})`,
      test,
      trainOk: (r) => r.day + HORIZON < from || r.day > to + HORIZON,
    };
  });
}

// --- yardsticks -------------------------------------------------------------

// Ranked among the core stocks only, as the live robots would: the current
// Signal Trader's two price drivers (trend 0–2 pts plus momentum by fifth
// 0–2 pts, momentum breaking ties), and plain 12-month momentum.
export function yardsticks(p: Panel): Record<string, Score> {
  const coreMomRank = new Map<PanelRow, number>();
  for (const rows of p.byDay.values()) {
    const core = rows.filter((r) => CORE.has(r.symbol));
    percentileRanks(core.map((r) => r.x[col.mom12_1])).forEach((v, k) => coreMomRank.set(core[k], v));
  }
  return {
    "Signal Trader price rules": (r) => {
      const m = coreMomRank.get(r) ?? NaN;
      return (r.x[col.distSma200] > 0 ? 1 : 0) + (r.x[col.sma50vs200] > 0 ? 1 : 0) + (m >= 0.8 ? 2 : m >= 0.6 ? 1 : 0) + m / 100;
    },
    "Plain 12-month momentum": (r) => r.x[col.mom12_1],
  };
}

// --- the test ---------------------------------------------------------------

// Trains every model on every fold (folds run concurrently, so trainers
// that use worker threads overlap), then scores the blind rows. `blends`
// adds combinations: the average of the named models' daily ranks.
export async function runTest(
  p: Panel,
  name: string,
  folds: Fold[],
  models: Record<string, Trainer>,
  fixed: Record<string, Score>,
  blends: Record<string, string[]> = {},
) {
  const scores = Object.fromEntries(Object.keys(models).map((m) => [m, new Map<PanelRow, number>()]));
  await Promise.all(
    folds.map(async (f) => {
      const trainRows = p.labelled.filter(f.trainOk);
      for (const [m, trainer] of Object.entries(models)) {
        const t0 = Date.now();
        const score = await trainer(trainRows, f);
        for (const d of f.test) for (const r of p.byDay.get(d)!) scores[m].set(r, score(r));
        console.log(`  ${name} ${f.label} ${m}: ${trainRows.length} rows, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
    }),
  );
  const contenders: Record<string, Score> = {
    ...Object.fromEntries(Object.keys(models).map((m) => [m, (r: PanelRow) => scores[m].get(r)!] as const)),
    ...fixed,
  };
  for (const [blend, parts] of Object.entries(blends)) {
    const rank = new Map<PanelRow, number>();
    for (const f of folds)
      for (const d of f.test) {
        const rows = p.byDay.get(d)!;
        const ranks = parts.map((m) => percentileRanks(rows.map(contenders[m])));
        rows.forEach((r, k) => rank.set(r, mean(ranks.map((rk) => rk[k]))));
      }
    contenders[blend] = (r) => rank.get(r)!;
  }

  const spyFwd = (d: number) => p.spy.c[d + HORIZON] / p.spy.c[d] - 1;
  const perYear = 252 / HORIZON;
  // Every 20 trading days, hold the top 10 core stocks by the score.
  const portfolio = (testDays: number[], score: Score | null) => {
    const rebalance = testDays.filter((_, k) => k % (HORIZON / SAMPLE_EVERY) === 0);
    let held = new Set<string>();
    return rebalance.map((d) => {
      if (!score) return spyFwd(d);
      const rows = p.byDay.get(d)!.filter((r) => CORE.has(r.symbol) && Number.isFinite(score(r)));
      const top = rows.sort((a, b) => score(b) - score(a)).slice(0, TOP_N);
      const turnover = top.filter((r) => !held.has(r.symbol)).length / TOP_N;
      held = new Set(top.map((r) => r.symbol));
      return mean(top.map((r) => r.fwd + spyFwd(d))) - turnover * 2 * COST;
    });
  };
  const summarise = (rets: number[], spyRets: number[]) => {
    let value = 1;
    let peak = 1;
    let maxDd = 0;
    for (const r of rets) {
      value *= 1 + r;
      peak = Math.max(peak, value);
      maxDd = Math.min(maxDd, value / peak - 1);
    }
    return {
      cagr: value ** (perYear / rets.length) - 1,
      vol: sd(rets) * Math.sqrt(perYear),
      sharpe: (mean(rets) / sd(rets)) * Math.sqrt(perYear),
      maxDd,
      beatSpy: rets.filter((r, k) => r > spyRets[k]).length / rets.length,
    };
  };
  const coreDays = (days: number[]) => new Map(days.map((d) => [d, p.byDay.get(d)!.filter((r) => CORE.has(r.symbol))] as const));
  const allDays = (days: number[]) => new Map(days.map((d) => [d, p.byDay.get(d)!] as const));

  const perFold = folds.map((f) => {
    const spyRets = portfolio(f.test, null);
    return {
      label: f.label,
      spy: summarise(spyRets, spyRets).cagr,
      models: Object.fromEntries(
        Object.entries(contenders).map(([m, s]) => [m, { ic: icStats(coreDays(f.test), s).ic, cagr: summarise(portfolio(f.test, s), spyRets).cagr }]),
      ),
    };
  });
  const testDays = folds.flatMap((f) => f.test).sort((a, b) => a - b);
  const spyRets = portfolio(testDays, null);
  const equalWeight = testDays
    .filter((_, k) => k % (HORIZON / SAMPLE_EVERY) === 0)
    .map((d) => mean(p.byDay.get(d)!.filter((r) => CORE.has(r.symbol)).map((r) => r.fwd + spyFwd(d))));
  return {
    scores,
    ic: Object.fromEntries(Object.entries(contenders).map(([m, s]) => [m, icStats(coreDays(testDays), s)])),
    icAll: Object.fromEntries(Object.keys(models).map((m) => [m, icStats(allDays(testDays), contenders[m])])),
    perFold,
    portfolios: {
      ...Object.fromEntries(Object.entries(contenders).map(([m, s]) => [`Top ${TOP_N}: ${m}`, summarise(portfolio(testDays, s), spyRets)])),
      "All core stocks, equal weight": summarise(equalWeight, spyRets),
      SPY: summarise(spyRets, spyRets),
    },
  };
}
export type TestResult = Awaited<ReturnType<typeof runTest>>;

// --- report -----------------------------------------------------------------

export const pct = (v: number, dp = 1) => `${(v * 100).toFixed(dp)}%`;
export const f3 = (v: number) => (v >= 0 ? " " : "") + v.toFixed(3);

// `perFoldModels`: which models get a column in the per-fold table.
export function testSection(title: string, res: TestResult, foldName: string, perFoldModels: string[]): string[] {
  return [
    `## ${title}`,
    "",
    `Scored on the ${CORE.size} core stocks. IC across every stock tested: ` +
      Object.entries(res.icAll).map(([m, s]) => `${m} ${f3(s.ic)} (t ${s.t.toFixed(1)})`).join(", ") + ".",
    "",
    "| Score | IC | t-stat | Years right sign |",
    "|---|---:|---:|---:|",
    ...Object.entries(res.ic).map(([k, s]) => `| ${k} | ${f3(s.ic)} | ${s.t.toFixed(1)} | ${s.sameSignYears}/${s.years} |`),
    "",
    `Top 10 return per year in each ${foldName.toLowerCase()} (IC in brackets):`,
    "",
    `| ${foldName} | ${perFoldModels.join(" | ")} | SPY |`,
    `|---|${perFoldModels.map(() => "---:").join("|")}|---:|`,
    ...res.perFold.map(
      (f) => `| ${f.label} | ${perFoldModels.map((m) => `${pct(f.models[m].cagr)} (${f3(f.models[m].ic)})`).join(" | ")} | ${pct(f.spy)} |`,
    ),
    "",
    `Portfolios, rebalanced every ${HORIZON} trading days, after ${pct(COST, 1)} trading costs:`,
    "",
    "| Portfolio | Return / yr | Volatility | Sharpe | Worst drop | Months beating SPY |",
    "|---|---:|---:|---:|---:|---:|",
    ...Object.entries(res.portfolios).map(
      ([k, s]) => `| ${k} | ${pct(s.cagr)} | ${pct(s.vol)} | ${s.sharpe.toFixed(2)} | ${pct(s.maxDd)} | ${pct(s.beatSpy, 0)} |`,
    ),
    "",
  ];
}

export const DISCLAIMER =
  "Educational research, not investment advice. The stock lists are today's (today's S&P 500, today's household " +
  "names), so no company that collapsed or was delisted is in them, and every backtest here flatters reality; " +
  "compare the rows with each other, not with what you'd have earned.";
