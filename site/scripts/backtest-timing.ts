// Backtest of the Signal Trader's timing rules (lib/signalTrader.ts,
// lib/signalTraderRules.ts) on daily prices since 2017, to test fixes for
// "it buys after a run-up, then the 8% stop-loss sells it on the dip".
//
// Price-only: insider buying and 10-K stories have no saved history, so a
// stock's score here is trend (0-2) + momentum (0-2), computed exactly as
// lib/signals/chart.ts does. Buying needs 4 (both maxed), holding needs 2,
// same as the live entryScore/holdScore.
//
// Timing: scores and exits are decided on each day's close and traded at
// the next day's open (the live trader scores on completed days and buys on
// the morning run). Stops are checked against each day's low, filled at the
// stop price, or at the open if the stock gapped below it.
//
// Uses the bars cached by scripts/ml/fetch-data.ts (.ml-cache/core).
// Usage, from site/:
//   npx tsx scripts/backtest-timing.ts          timing fixes  -> TIMING_BACKTEST.md
//   npx tsx scripts/backtest-timing.ts --rules  sector cap, market filter,
//                                               jumpiness sizing -> RULES_BACKTEST.md

import { readFileSync, writeFileSync } from "node:fs";
import { SECTORS } from "../src/lib/sectors";

type Bars = { t: string[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] };
const all: Record<string, Bars> = JSON.parse(readFileSync(".ml-cache/core/bars.json", "utf8"));
const spy = all.SPY;
const symbols = Object.keys(all).filter((s) => s !== "SPY");

const YEAR = 252, MONTH = 21;
const COST = 0.0005; // 0.05% per trade, for spread and slippage
const START = "2017-03-01"; // first day with a full year of history for most stocks

type Variant = {
  name: string;
  stopLoss: number | ((atrPct: number) => number); // below cost; Infinity = off
  trailingStop: number;
  maxStretch?: number; // skip buys more than this far above the 50-day average
  confirmDays?: number; // score must qualify this many closes in a row
  sectorCap?: number; // at most this many holdings from one sector
  marketFilter?: boolean; // no new buys while SPY is below its 200-day average
  volSizing?: boolean; // size each buy so every position carries similar risk
};
const RULES_MODE = process.argv.includes("--rules");
const TIMING_VARIANTS: Variant[] = [
  { name: "Current rules (8% stop, 15% trailing)", stopLoss: 0.08, trailingStop: 0.15 },
  { name: "Fix 1: skip stocks >15% above 50-day avg", stopLoss: 0.08, trailingStop: 0.15, maxStretch: 0.15 },
  { name: "Fix 2a: 12% stop-loss", stopLoss: 0.12, trailingStop: 0.15 },
  // Average true range: the stock's typical daily move. 2.5 days of it, kept
  // between 6% and 20%, so jumpy stocks get a wider stop than calm ones.
  { name: "Fix 2b: stop sized to each stock's jumpiness", stopLoss: (a) => Math.min(0.2, Math.max(0.06, 2.5 * a)), trailingStop: 0.15 },
  { name: "Fix 1 + 2a together", stopLoss: 0.12, trailingStop: 0.15, maxStretch: 0.15 },
  { name: "Fix 3: score must hold 2 days before buying", stopLoss: 0.08, trailingStop: 0.15, confirmDays: 2 },
  { name: "No stops at all (trend and signal exits only)", stopLoss: Infinity, trailingStop: Infinity },
];
const BASE = { stopLoss: 0.08, trailingStop: 0.15 };
const RULE_VARIANTS: Variant[] = [
  { name: "Current rules", ...BASE },
  { name: "Sector cap: max 3 per sector", ...BASE, sectorCap: 3 },
  { name: "Market filter: no buys while SPY < 200-day avg", ...BASE, marketFilter: true },
  { name: "Jumpiness sizing: calm stocks get more money", ...BASE, volSizing: true },
  { name: "All three together", ...BASE, sectorCap: 3, marketFilter: true, volSizing: true },
];
const VARIANTS = RULES_MODE ? RULE_VARIANTS : TIMING_VARIANTS;

// Each stock's sector: the first list it appears in, Sustainability last
// (it overlaps the others).
const sectorOf = new Map<string, string>();
for (const [key, sec] of Object.entries(SECTORS).sort(([a], [b]) => (a === "sustainability" ? 1 : 0) - (b === "sustainability" ? 1 : 0)))
  for (const t of sec.tickers) if (!sectorOf.has(t)) sectorOf.set(t, key);

// --- Per-stock indicators, aligned to SPY's trading days -------------------
const days = spy.t;
const idx = new Map(symbols.map((s) => [s, new Map(all[s].t.map((t, i) => [t, i]))]));
const sma = (c: number[], i: number, n: number) => {
  if (i + 1 < n) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += c[k];
  return s / n;
};
const atrPct = (b: Bars, i: number, n = 14) => {
  if (i < n) return 0.02;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += Math.max(b.h[k], b.c[k - 1]) - Math.min(b.l[k], b.c[k - 1]);
  return s / n / b.c[i];
};

type Snap = { score: number; close: number; sma50: number | null; sma200: number | null; atr: number };
// Scores on every day's close, the same way lib/signals/chart.ts does.
const snaps: Map<string, Snap>[] = days.map((d) => {
  const rets: { s: string; r: number }[] = [];
  const base = new Map<string, Snap>();
  for (const s of symbols) {
    const i = idx.get(s)!.get(d);
    if (i === undefined) continue;
    const c = all[s].c;
    const s50 = sma(c, i, 50), s200 = sma(c, i, 200);
    let trend = 0;
    if (s200 !== null && c[i] > s200) trend++;
    if (s50 !== null && s200 !== null && s50 > s200 && c[i] > s50 && c[i] > s200) trend++;
    base.set(s, { score: trend, close: c[i], sma50: s50, sma200: s200, atr: atrPct(all[s], i) });
    if (i > YEAR) rets.push({ s, r: c[i - MONTH] / c[i - YEAR] - 1 });
  }
  rets.sort((a, b) => b.r - a.r);
  rets.forEach(({ s, r }, k) => {
    if (r <= 0) return;
    const pctile = 1 - k / rets.length;
    if (pctile > 0.8) base.get(s)!.score += 2;
    else if (pctile > 0.6) base.get(s)!.score += 1;
  });
  return base;
});

// --- Simulation --------------------------------------------------------------
type Pos = { qty: number; cost: number; peak: number; stop: number; opened: number };
type Exit = { kind: string; ret: number };

function run(v: Variant) {
  let cash = 100_000;
  const pos = new Map<string, Pos>();
  const lastSold = new Map<string, number>(); // symbol -> day index
  const equity: number[] = [];
  const exits: Exit[] = [];
  let buys = 0;
  let pendingSells: { s: string; kind: string }[] = [];
  let pendingBuys: string[] = [];
  const first = days.findIndex((d) => d >= START);
  const open = (s: string, i: number) => all[s].o[idx.get(s)!.get(days[i])!];
  const bar = (s: string, i: number) => idx.get(s)!.get(days[i]);

  const sell = (s: string, price: number, kind: string) => {
    const p = pos.get(s)!;
    cash += p.qty * price * (1 - COST);
    exits.push({ kind, ret: price / p.cost - 1 });
    pos.delete(s);
    lastSold.set(s, cur);
  };
  let cur = 0;

  for (let i = first; i < days.length; i++) {
    cur = i;
    // 1. Morning: yesterday's decisions, at today's open.
    for (const { s, kind } of pendingSells) if (pos.has(s) && bar(s, i) !== undefined) sell(s, open(s, i), kind);
    let eq = cash;
    for (const [s, p] of pos) eq += p.qty * (snaps[i - 1].get(s)?.close ?? p.cost);
    for (const s of pendingBuys) {
      if (pos.size >= 10 || bar(s, i) === undefined) continue;
      const px = open(s, i);
      // Jumpiness sizing: 9% for a stock with a typical day's move (2%),
      // scaled down for jumpier ones and up for calmer ones, kept to 4-15%.
      const weight = v.volSizing ? Math.min(0.15, Math.max(0.04, 0.09 * (0.02 / snaps[i - 1].get(s)!.atr))) : 0.09;
      const qty = Math.floor(Math.min(eq * weight, cash) / (px * (1 + COST)));
      if (qty < 1) continue;
      cash -= qty * px * (1 + COST);
      const sl = typeof v.stopLoss === "function" ? v.stopLoss(snaps[i - 1].get(s)!.atr) : v.stopLoss;
      pos.set(s, { qty, cost: px, peak: px, stop: sl, opened: i });
      buys++;
    }
    pendingSells = [];
    pendingBuys = [];

    // 2. During the day: stops, against the day's low (not on the day bought,
    //    matching an open fill followed by 15-minute checks only roughly).
    for (const [s, p] of [...pos]) {
      const b = bar(s, i);
      if (b === undefined) continue;
      const B = all[s];
      const stopPx = p.cost * (1 - p.stop);
      const trailPx = p.peak * (1 - v.trailingStop);
      const level = Math.max(Number.isFinite(stopPx) ? stopPx : -1, Number.isFinite(trailPx) ? trailPx : -1);
      if (level > 0 && B.l[b] <= level) sell(s, Math.min(B.o[b], level), stopPx >= trailPx ? "stop-loss" : "trailing stop");
    }

    // 3. Close: update highs, decide exits and entries for tomorrow.
    const snap = snaps[i];
    for (const [s, p] of pos) {
      const m = snap.get(s);
      if (!m) continue;
      p.peak = Math.max(p.peak, m.close);
      if (m.sma200 !== null && m.close < m.sma200) pendingSells.push({ s, kind: "trend broke" });
      else if (m.score < 2) pendingSells.push({ s, kind: "signal faded" });
    }
    const qualifies = (k: number, s: string) => {
      const m = snaps[k]?.get(s);
      if (!m || m.score < 4 || m.sma50 === null || m.sma200 === null) return false;
      if (m.close < m.sma50 || m.close < m.sma200 || m.close < 5) return false;
      if (v.maxStretch !== undefined && m.close > m.sma50 * (1 + v.maxStretch)) return false;
      return true;
    };
    const slots = 10 - pos.size + pendingSells.length;
    const si = spy.t.indexOf(days[i]);
    const spy200 = sma(spy.c, si, 200);
    const marketDown = v.marketFilter && spy200 !== null && spy.c[si] < spy200;
    pendingBuys = marketDown ? [] : symbols
      .filter((s) => !pos.has(s))
      .filter((s) => !lastSold.has(s) || i - lastSold.get(s)! > 10) // 14 calendar days ≈ 10 trading days
      .filter((s) => Array.from({ length: v.confirmDays ?? 1 }, (_, k) => qualifies(i - k, s)).every(Boolean))
      .sort((a, b) => snap.get(b)!.close / snap.get(b)!.sma200! - snap.get(a)!.close / snap.get(a)!.sma200!)
      .filter(
        (() => {
          if (!v.sectorCap) return () => true;
          const leaving = new Set(pendingSells.map((p) => p.s));
          const count = new Map<string, number>();
          for (const s of pos.keys()) if (!leaving.has(s)) count.set(sectorOf.get(s) ?? "other", (count.get(sectorOf.get(s) ?? "other") ?? 0) + 1);
          return (s: string) => {
            const k = sectorOf.get(s) ?? "other";
            if ((count.get(k) ?? 0) >= v.sectorCap!) return false;
            count.set(k, (count.get(k) ?? 0) + 1);
            return true;
          };
        })(),
      )
      .slice(0, Math.max(0, slots));

    let e = cash;
    for (const [s, p] of pos) e += p.qty * (snap.get(s)?.close ?? p.cost);
    equity.push(e);
  }
  return { equity, exits, buys, first };
}

// --- Stats -------------------------------------------------------------------
function stats(eq: number[]) {
  const years = eq.length / 252;
  const cagr = (eq[eq.length - 1] / eq[0]) ** (1 / years) - 1;
  const r = eq.slice(1).map((x, k) => x / eq[k] - 1);
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length);
  let peak = eq[0], dd = 0;
  for (const x of eq) { peak = Math.max(peak, x); dd = Math.min(dd, x / peak - 1); }
  return { cagr, vol: sd * Math.sqrt(252), sharpe: (m / sd) * Math.sqrt(252), dd };
}
const pct = (x: number, d = 1) => `${x >= 0 ? "" : "−"}${Math.abs(x * 100).toFixed(d)}%`;

// --- Export for the /quant/rule-tester page ------------------------------
// Every combination of the page's four switches (36), each as a weekly
// growth-of-$100K curve plus its stats, next to SPY.
// Usage: npx tsx scripts/backtest-timing.ts --export  -> public/data/rule-tester.json
if (process.argv.includes("--export")) {
  const SPLIT = "2022-01-01";
  const start = days.findIndex((d) => d >= START);
  const span = days.slice(start);
  const split = span.findIndex((d) => d >= SPLIT);
  const weekly = span.map((_, k) => k).filter((k) => k % 5 === 0 || k === span.length - 1);
  const scale = (eq: number[]) => eq.map((x) => (x / eq[0]) * 100_000);
  const years = [...new Set(span.map((d) => d.slice(0, 4)))];
  const summary = (eq: number[]) => {
    const s = stats(eq);
    const half = (e: number[]) => {
      const h = stats(e);
      return { cagr: +h.cagr.toFixed(4), sharpe: +h.sharpe.toFixed(2), maxDrawdown: +h.dd.toFixed(4) };
    };
    const yearly = Object.fromEntries(
      years.map((y) => {
        const ks = span.map((d, k) => [d, k] as const).filter(([d]) => d.startsWith(y)).map(([, k]) => k);
        const from = ks[0] === 0 ? eq[0] : eq[ks[0] - 1];
        return [y, +(eq[ks[ks.length - 1]] / from - 1).toFixed(4)];
      }),
    );
    return {
      finalValue: Math.round(eq[eq.length - 1]),
      cagr: +s.cagr.toFixed(4),
      sharpe: +s.sharpe.toFixed(2),
      maxDrawdown: +s.dd.toFixed(4),
      firstHalf: half(eq.slice(0, split)),
      secondHalf: half(eq.slice(split - 1)),
      yearly,
      curve: weekly.map((k) => Math.round(eq[k])),
    };
  };
  const combos = [];
  for (const sectorCap of [0, 2, 3])
    for (const stopLoss of [8, 12, 0])
      for (const trailing of [true, false])
        for (const marketFilter of [true, false]) {
          const eq = scale(
            run({
              name: "",
              sectorCap: sectorCap || undefined,
              stopLoss: stopLoss ? stopLoss / 100 : Infinity,
              trailingStop: trailing ? 0.15 : Infinity,
              marketFilter,
            }).equity,
          );
          combos.push({ sectorCap, stopLoss, trailing, marketFilter, ...summary(eq) });
        }
  const out = {
    generated: new Date().toISOString().slice(0, 10),
    start: span[0],
    end: span[span.length - 1],
    split: SPLIT,
    stocks: symbols.length,
    dates: weekly.map((k) => span[k]),
    spy: summary(scale(span.map((_, k) => spy.c[start + k]))),
    combos,
  };
  writeFileSync("public/data/rule-tester.json", JSON.stringify(out));
  console.log(`Wrote public/data/rule-tester.json: ${combos.length} combinations, ${weekly.length} weeks`);
  process.exit(0);
}

// --- Grid: every combination, picked on 2017-2021, checked on 2022 on ----
// Usage: npx tsx scripts/backtest-timing.ts --grid  -> COMBO_BACKTEST.md
if (process.argv.includes("--grid")) {
  const SPLIT = "2022-01-01";
  const combos: Variant[] = [];
  for (const sectorCap of [undefined, 2, 3, 4])
    for (const stopLoss of [0.08, 0.12, Infinity])
      for (const trailingStop of [0.15, 0.2, Infinity])
        for (const marketFilter of [false, true])
          for (const volSizing of [false, true])
            for (const maxStretch of [undefined, 0.15])
              for (const confirmDays of [1, 2]) {
                const parts = [
                  sectorCap ? `cap ${sectorCap}/sector` : "",
                  stopLoss === Infinity ? "no stop" : `stop ${stopLoss * 100}%`,
                  trailingStop === Infinity ? "no trail" : `trail ${trailingStop * 100}%`,
                  marketFilter ? "mkt filter" : "",
                  volSizing ? "jumpy sizing" : "",
                  maxStretch ? "skip run-ups" : "",
                  confirmDays === 2 ? "confirm 2d" : "",
                ].filter(Boolean);
                combos.push({ name: parts.join(", "), stopLoss, trailingStop, sectorCap, marketFilter, volSizing, maxStretch, confirmDays });
              }
  const start = days.findIndex((d) => d >= START);
  const split = days.slice(start).findIndex((d) => d >= SPLIT);
  const halves = (eq: number[]) => ({ train: stats(eq.slice(0, split)), test: stats(eq.slice(split - 1)) });
  const t0 = Date.now();
  const rows = combos.map((v, k) => {
    if (k % 50 === 0) console.log(`${k}/${combos.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    return { v, ...halves(run(v).equity) };
  });
  type Row = (typeof rows)[number];
  const isCurrent = (v: Variant) =>
    !v.sectorCap && v.stopLoss === 0.08 && v.trailingStop === 0.15 && !v.marketFilter && !v.volSizing && !v.maxStretch && v.confirmDays === 1;
  const current = rows.find((r) => isCurrent(r.v))!;
  const spyS = halves(days.slice(start).map((_, k) => spy.c[start + k]));
  const byTrain = [...rows].sort((a, b) => b.train.sharpe - a.train.sharpe);
  const testRank = new Map([...rows].sort((a, b) => b.test.sharpe - a.test.sharpe).map((r, k) => [r, k + 1]));
  const line = (label: string, s: { train: ReturnType<typeof stats>; test: ReturnType<typeof stats> }, rank: string) =>
    `| ${label} | ${pct(s.train.cagr)} | ${s.train.sharpe.toFixed(2)} | ${pct(s.train.dd)} | ${pct(s.test.cagr)} | ${s.test.sharpe.toFixed(2)} | ${pct(s.test.dd)} | ${rank} |`;
  const row = (r: Row, label = r.v.name) => line(label, r, `${testRank.get(r)} of ${rows.length}`);
  // Each setting's average effect: mean Sharpe of every combination using it.
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const effect = (rule: string, pick: (v: Variant) => string) => {
    const groups = new Map<string, Row[]>();
    for (const r of rows) groups.set(pick(r.v), [...(groups.get(pick(r.v)) ?? []), r]);
    return [...groups].map(
      ([k, rs]) => `| ${rule} | ${k} | ${mean(rs.map((r) => r.train.sharpe)).toFixed(2)} | ${mean(rs.map((r) => r.test.sharpe)).toFixed(2)} |`,
    );
  };
  const out = [
    "# Signal Trader rule combinations: backtest",
    "",
    `Generated ${new Date().toISOString().slice(0, 10)} by \`site/scripts/backtest-timing.ts --grid\`. ${rows.length} combinations of 7 rules, ` +
      `${symbols.length} sector-list stocks. **Picked on ${days[start]} to 2021-12, then checked on 2022-01 to ${days[days.length - 1]}** ` +
      "(years the picking never saw). Price-only (trend + momentum score), today's stock lists, 0.05% cost per trade. " +
      "Educational, not investment advice.",
    "",
    "Sharpe = return per unit of risk (higher is better). A combination that tops the first period but not the second got lucky.",
    "",
    "## Top 15 combinations by 2017–2021 Sharpe, and how they did afterwards",
    "",
    "| Rules | 2017–21 / yr | Sharpe | Worst drop | 2022–26 / yr | Sharpe | Worst drop | Rank in 2022–26 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...byTrain.slice(0, 15).map((r) => row(r)),
    row(current, "**Current rules**"),
    line("SPY", spyS, "–"),
    "",
    "## Top 5 by 2022–2026 Sharpe (hindsight, for reference)",
    "",
    "| Rules | 2017–21 / yr | Sharpe | Worst drop | 2022–26 / yr | Sharpe | Worst drop | Rank in 2022–26 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...[...rows].sort((a, b) => b.test.sharpe - a.test.sharpe).slice(0, 5).map((r) => row(r)),
    "",
    "## Each setting on its own, averaged over every combination that uses it",
    "",
    "| Rule | Setting | Avg Sharpe 2017–21 | Avg Sharpe 2022–26 |",
    "|---|---|---:|---:|",
    ...effect("Sector cap", (v) => (v.sectorCap ? `${v.sectorCap} per sector` : "none")),
    ...effect("Stop-loss", (v) => (v.stopLoss === Infinity ? "none" : `${(v.stopLoss as number) * 100}%`)),
    ...effect("Trailing stop", (v) => (v.trailingStop === Infinity ? "none" : `${v.trailingStop * 100}%`)),
    ...effect("Market filter", (v) => (v.marketFilter ? "on" : "off")),
    ...effect("Jumpiness sizing", (v) => (v.volSizing ? "on" : "off")),
    ...effect("Skip run-ups", (v) => (v.maxStretch ? "on" : "off")),
    ...effect("Confirm 2 days", (v) => (v.confirmDays === 2 ? "on" : "off")),
    "",
  ];
  writeFileSync("../projects/paper-trading/COMBO_BACKTEST.md", out.join("\n"));
  console.log(out.join("\n"));
  process.exit(0);
}

const results = VARIANTS.map((v) => ({ v, ...run(v) }));
const first = results[0].first;
const spyEq = days.slice(first).map((d, k) => spy.c[first + k]);
const years = [...new Set(days.slice(first).map((d) => d.slice(0, 4)))];
const yearRet = (eq: number[], y: string) => {
  const ks = days.slice(first).map((d, k) => [d, k] as const).filter(([d]) => d.startsWith(y)).map(([, k]) => k);
  const start = ks[0] === 0 ? eq[0] : eq[ks[0] - 1];
  return eq[ks[ks.length - 1]] / start - 1;
};

const lines = [
  RULES_MODE ? "# Signal Trader rule additions: backtest" : "# Signal Trader timing fixes: backtest",
  "",
  `Generated ${new Date().toISOString().slice(0, 10)} by \`site/scripts/backtest-timing.ts\`. ${symbols.length} sector-list stocks, ` +
    `${days[first]} to ${days[days.length - 1]}, $100K, up to 10 positions at 9% each, 0.05% cost per trade.` +
    (RULES_MODE ? " All versions keep the current 8% stop-loss and 15% trailing stop." : ""),
  "",
  "**Price-only version of the Signal Trader.** Insider buying and 10-K stories have no saved history, so a stock's score " +
    "here is trend + momentum only (buy at 4, sell under 2). Today's stock lists, so no stock that collapsed is in them: " +
    "compare the rows with each other, not with what you'd have earned. Educational, not investment advice.",
  "",
  "| Rules | Return / yr | Volatility | Sharpe | Worst drop | Buys / yr | Stop-loss sells | Avg loss on those |",
  "|---|---:|---:|---:|---:|---:|---:|---:|",
  ...results.map(({ v, equity, exits, buys }) => {
    const s = stats(equity);
    const stops = exits.filter((e) => e.kind === "stop-loss");
    const avg = stops.length ? stops.reduce((a, e) => a + e.ret, 0) / stops.length : 0;
    return `| ${v.name} | ${pct(s.cagr)} | ${pct(s.vol)} | ${s.sharpe.toFixed(2)} | ${pct(s.dd)} | ${(buys / (equity.length / 252)).toFixed(0)} | ${stops.length} | ${stops.length ? pct(avg) : "–"} |`;
  }),
  (() => {
    const s = stats(spyEq);
    return `| SPY (buy and hold) | ${pct(s.cagr)} | ${pct(s.vol)} | ${s.sharpe.toFixed(2)} | ${pct(s.dd)} | – | – | – |`;
  })(),
  "",
  "## Year by year",
  "",
  `| Year | ${results.map((_, k) => (k === 0 ? "Current" : !RULES_MODE && k === results.length - 1 ? "No stops" : `#${k}`)).join(" | ")} | SPY |`,
  `|---|${results.map(() => "---:").join("|")}|---:|`,
  ...years.map((y) => `| ${y} | ${results.map((r) => pct(yearRet(r.equity, y), 0)).join(" | ")} | ${pct(yearRet(spyEq, y), 0)} |`),
  "",
  "Columns: " + results.slice(1, RULES_MODE ? undefined : -1).map((r, k) => `#${k + 1} ${r.v.name}`).join("; ") + ".",
  "",
  "## How each version's sells happened",
  "",
  "| Rules | Stop-loss | Trailing stop | Trend broke | Signal faded | Winning sells |",
  "|---|---:|---:|---:|---:|---:|",
  ...results.map(({ v, exits }) => {
    const n = (k: string) => exits.filter((e) => e.kind === k).length;
    return `| ${v.name} | ${n("stop-loss")} | ${n("trailing stop")} | ${n("trend broke")} | ${n("signal faded")} | ${pct(exits.filter((e) => e.ret > 0).length / exits.length, 0)} |`;
  }),
  "",
];
writeFileSync(`../projects/paper-trading/${RULES_MODE ? "RULES" : "TIMING"}_BACKTEST.md`, lines.join("\n"));
console.log(lines.join("\n"));
