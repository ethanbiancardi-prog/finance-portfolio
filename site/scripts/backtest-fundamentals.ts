// Backtest: should the Signal Trader put FUNDAMENTALS first? Ethan's rules
// (Nov 2026, from reading about fundamental vs technical analysis): only buy
// profitable companies with strong margins and a high return on equity whose
// profits have grown ~30%+ a year for three years, use the chart (days to
// weeks) only for timing, and cut any loss at 8%.
//
// Every version shares the live bot's mechanics (lib/signalTrader.ts): decide
// on each day's close, trade at the next day's open; 8% stop-loss checked
// against each day's low (filled at the stop, or the open if it gapped
// below); sell when the close falls under the 200-day average; 10 positions
// at 9% of the account; at most 2 per sector; no re-buying within 14 days.
//
// Fundamentals are point-in-time: a filing's numbers are used only from the
// day after it was filed (lib/ml/fundamentals.ts "known" dates), so the test
// never peeks at numbers investors didn't have yet.
//
// Data: .ml-cache/sp500 (scripts/ml/fetch-data.ts + fetch-fundamentals.ts),
// today's S&P 500. BIG CAVEAT: today's index is full of companies that got
// in BECAUSE they grew fast, which flatters a growth strategy more than most.
// The "every stock, equal weight" row uses the same list, so compare against
// it, not just SPY.
//
// Usage, from site/:  npx tsx scripts/backtest-fundamentals.ts   -> projects/paper-trading/FUNDAMENTALS_BACKTEST.md

import { readFileSync, writeFileSync } from "node:fs";
import sp500 from "../src/lib/ml/sp500.json";
import type { FundamentalSnapshot } from "../src/lib/ml/fundamentals";

type Bars = { t: string[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] };
const bars: Record<string, Bars> = JSON.parse(readFileSync(".ml-cache/sp500/bars.json", "utf8"));
const fund: Record<string, FundamentalSnapshot[]> = JSON.parse(readFileSync(".ml-cache/sp500/fundamentals.json", "utf8"));
const sectorOf = new Map(sp500.stocks.map((s) => [s.symbol, s.sector]));

const START = "2017-03-01";
const SPLIT = "2022-01-01"; // 2017-21 vs 2022-26
const COST = 0.0005;
const RULES = { stop: 0.08, maxPositions: 10, weight: 0.09, perSector: 2, cooldownDays: 14 };
const YEAR = 252, MONTH = 21;

const spy = bars.SPY;
const calendar = spy.t.filter((d) => d >= START);
const symbols = Object.keys(bars).filter((s) => s !== "SPY" && bars[s].t.length > YEAR + MONTH);

// --- Per-stock daily indicators, by date --------------------------------------
type Day = { o: number; h: number; l: number; c: number; sma50: number | null; sma200: number | null; ret12_1: number | null; ret1m: number | null };
const days = new Map<string, Map<string, Day>>();
for (const s of symbols) {
  const b = bars[s];
  const m = new Map<string, Day>();
  let s50 = 0, s200 = 0;
  for (let i = 0; i < b.t.length; i++) {
    s50 += b.c[i] - (i >= 50 ? b.c[i - 50] : 0);
    s200 += b.c[i] - (i >= 200 ? b.c[i - 200] : 0);
    m.set(b.t[i], {
      o: b.o[i], h: b.h[i], l: b.l[i], c: b.c[i],
      sma50: i >= 49 ? s50 / 50 : null,
      sma200: i >= 199 ? s200 / 200 : null,
      ret12_1: i >= YEAR ? b.c[i - MONTH] / b.c[i - YEAR] - 1 : null,
      ret1m: i >= MONTH ? b.c[i] / b.c[i - MONTH] - 1 : null,
    });
  }
  days.set(s, m);
}

// --- Point-in-time fundamentals ---------------------------------------------------
type Fund = {
  profitable: boolean;
  netMargin: number | null;
  roe: number | null;
  growth3y: number | null;
  grewEveryYear: boolean;
  // "New product" stand-in: a hit product shows up as sales growth speeding
  // up. Sales growth now (trailing year vs the year before), and the same
  // measure a year ago.
  salesGrowth: number | null;
  salesGrowthYearAgo: number | null;
};
const DAY_MS = 86_400_000;
// The latest snapshot filed strictly before `date` (numbers public the day after filing).
function snapAt(list: FundamentalSnapshot[], date: string): FundamentalSnapshot | null {
  let lo = 0, hi = list.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].known < date) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans >= 0 ? list[ans] : null;
}
const yearsBack = (date: string, y: number) => new Date(new Date(date).getTime() - y * 365.25 * DAY_MS).toISOString().slice(0, 10);
const fundCache = new Map<string, Fund | null>();
function fundamentals(sym: string, date: string): Fund | null {
  const list = fund[sym];
  if (!list?.length) return null;
  const now = snapAt(list, date);
  if (!now || now.niTtm == null) return null;
  const key = `${sym}|${now.known}`; // only changes when a new filing lands
  if (fundCache.has(key)) return fundCache.get(key)!;
  // Trailing-12-month profit now and 1, 2, 3 years earlier.
  const ni = [0, 1, 2, 3].map((y) => (y === 0 ? now : snapAt(list, yearsBack(date, y)))?.niTtm ?? null);
  const allPositive = ni.every((x) => x != null && x > 0);
  const growth3y = allPositive ? (ni[0]! / ni[3]!) ** (1 / 3) - 1 : null; // average yearly growth (CAGR)
  const grewEveryYear = allPositive && ni[0]! > ni[1]! && ni[1]! > ni[2]! && ni[2]! > ni[3]!;
  const f: Fund = {
    profitable: now.niTtm > 0,
    netMargin: now.netMargin,
    roe: now.equity && now.equity > 0 ? now.niTtm / now.equity : null,
    growth3y,
    grewEveryYear,
    salesGrowth: now.revGrowth,
    salesGrowthYearAgo: snapAt(list, yearsBack(date, 1))?.revGrowth ?? null,
  };
  fundCache.set(key, f);
  return f;
}

// --- Versions -------------------------------------------------------------------
type Cand = { sym: string; rank: number };
type Version = {
  name: string;
  short: string;
  // Can this stock be bought at today's close? Returns its ranking value (higher = better) or null.
  // `leader`: in the market's top fifth over 12 months AND the top quarter of its own sector.
  pick: (sym: string, d: Day, date: string, momentumScore: number, leader: boolean) => number | null;
  fundExit?: (f: Fund | null) => boolean; // sell when a new filing breaks the rule
};
const trendScore = (d: Day) => (d.sma200 && d.c > d.sma200 ? 1 : 0) + (d.sma50 && d.sma200 && d.sma50 > d.sma200 ? 1 : 0);
const shortTermUp = (d: Day) => !!d.sma50 && d.c > d.sma50 && (d.ret1m ?? 0) > 0;
// Fundamental points for the blends: 3-year profit growth (≥30%/yr every
// year +2, ≥15%/yr +1), profitable with ROE ≥17% +1, losing money −2.
const fundPoints = (f: Fund | null) => {
  if (!f) return 0;
  if (!f.profitable) return -2;
  const g = f.growth3y ?? -1;
  return (g >= 0.3 && f.grewEveryYear ? 2 : g >= 0.15 ? 1 : 0) + ((f.roe ?? 0) >= 0.17 ? 1 : 0);
};
const quality = (f: Fund | null) => !!f && f.profitable && (f.netMargin ?? 0) >= 0.1 && (f.roe ?? 0) >= 0.17;
const growth = (min: number) => (f: Fund | null) =>
  !!f && f.profitable && (f.roe ?? 0) >= 0.17 && (f.growth3y ?? -1) >= min && f.grewEveryYear;

const VERSIONS: Version[] = [
  {
    name: "A. Current bot: price only (trend + momentum score 4)",
    short: "Current bot",
    pick: (_s, d, _date, mom) => (trendScore(d) + mom >= 4 ? mom * 10 + (d.sma200 ? d.c / d.sma200 : 0) : null),
  },
  {
    name: "B. Quality first: profitable, net margin ≥10%, ROE ≥17%, then the chart",
    short: "Quality first",
    pick: (s, d, date, mom) => (quality(fundamentals(s, date)) && trendScore(d) === 2 ? mom * 10 + (d.ret12_1 ?? 0) : null),
    fundExit: (f) => !quality(f),
  },
  {
    name: "C. Growth first: ROE ≥17%, profits up ≥30%/yr for 3 years (every year), short-term uptrend",
    short: "Growth ≥30%",
    pick: (s, d, date) => {
      const f = fundamentals(s, date);
      return growth(0.3)(f) && shortTermUp(d) ? f!.growth3y! : null;
    },
    fundExit: (f) => !f || !f.profitable,
  },
  {
    name: "D. Growth first, 20% bar: same as C with profits up ≥20%/yr",
    short: "Growth ≥20%",
    pick: (s, d, date) => {
      const f = fundamentals(s, date);
      return growth(0.2)(f) && shortTermUp(d) ? f!.growth3y! : null;
    },
    fundExit: (f) => !f || !f.profitable,
  },
  {
    name: "E. Growth + leader: C, plus leading its sector (top quarter of its sector and top fifth of the market over 12 months)",
    short: "Growth + leader",
    pick: (s, d, date, _mom, leader) => {
      const f = fundamentals(s, date);
      return growth(0.3)(f) && leader && shortTermUp(d) ? f!.growth3y! : null;
    },
    fundExit: (f) => !f || !f.profitable,
  },
  {
    name: "F. Full checklist: profitable, ROE ≥17%, profits up ≥20%/yr for 3 years, sales up ≥15% and speeding up, sector leader, short-term uptrend",
    short: "Full checklist",
    pick: (s, d, date, _mom, leader) => {
      const f = fundamentals(s, date);
      const accelerating = !!f && (f.salesGrowth ?? -1) >= 0.15 && f.salesGrowthYearAgo != null && f.salesGrowth! > f.salesGrowthYearAgo;
      return growth(0.2)(f) && accelerating && leader && shortTermUp(d) ? f!.growth3y! : null;
    },
    fundExit: (f) => !f || !f.profitable,
  },
  // Blends: fundamentals add points to the price score instead of blocking buys.
  {
    name: "G. Blend: price score + fundamental points (growth up to +2, ROE +1, losing money −2), buy at 4+",
    short: "Blend, buy at 4+",
    pick: (s, d, date, mom) => {
      const score = trendScore(d) + mom + fundPoints(fundamentals(s, date));
      return score >= 4 ? score * 10 + mom + (d.ret12_1 ?? 0) : null;
    },
  },
  {
    name: "H. Blend, higher bar: as G, buy at 5+ (price strength alone isn't enough)",
    short: "Blend, buy at 5+",
    pick: (s, d, date, mom) => {
      const score = trendScore(d) + mom + fundPoints(fundamentals(s, date));
      return score >= 5 ? score * 10 + mom + (d.ret12_1 ?? 0) : null;
    },
  },
  {
    name: "I. Blend, profitable only: as G, but never buy a company losing money",
    short: "Blend, profitable only",
    pick: (s, d, date, mom) => {
      const f = fundamentals(s, date);
      if (!f?.profitable) return null;
      const score = trendScore(d) + mom + fundPoints(f);
      return score >= 4 ? score * 10 + mom + (d.ret12_1 ?? 0) : null;
    },
  },
];

// --- Simulation -----------------------------------------------------------------
type Pos = { qty: number; cost: number };
type Result = { equity: { date: string; v: number }[]; trades: number; stops: number; invested: number[]; qualifying: number[] };

function run(v: Version): Result {
  let cash = 100_000;
  const pos = new Map<string, Pos>();
  const lastSold = new Map<string, string>();
  let pending: { sym: string; side: "buy" | "sell"; dollars?: number }[] = [];
  const equity: Result["equity"] = [];
  const invested: number[] = [];
  const qualifying: number[] = [];
  let trades = 0, stops = 0;

  for (let i = 0; i < calendar.length; i++) {
    const date = calendar[i];
    const today = (s: string) => days.get(s)?.get(date);

    // 1. At the open: yesterday's decisions.
    for (const o of pending) {
      const d = today(o.sym);
      if (!d) continue;
      if (o.side === "sell") {
        const p = pos.get(o.sym);
        if (!p) continue;
        cash += p.qty * d.o * (1 - COST);
        pos.delete(o.sym);
        lastSold.set(o.sym, date);
        trades++;
      } else if (!pos.has(o.sym) && cash >= o.dollars!) {
        pos.set(o.sym, { qty: (o.dollars! * (1 - COST)) / d.o, cost: d.o });
        cash -= o.dollars!;
        trades++;
      }
    }
    pending = [];

    // 2. During the day: the 8% stop, against the day's low.
    for (const [s, p] of [...pos]) {
      const d = today(s);
      if (!d) continue;
      const stopPx = p.cost * (1 - RULES.stop);
      if (d.l <= stopPx) {
        const fill = Math.min(d.o, stopPx);
        cash += p.qty * fill * (1 - COST);
        pos.delete(s);
        lastSold.set(s, date);
        trades++;
        stops++;
      }
    }

    // 3. At the close: mark the account, then decide tomorrow's trades.
    let value = cash;
    for (const [s, p] of pos) value += p.qty * (today(s)?.c ?? p.cost);
    equity.push({ date, v: value });
    invested.push(1 - cash / value);

    const selling = new Set<string>();
    for (const s of pos.keys()) {
      const d = today(s);
      if (!d) continue;
      if (d.sma200 && d.c < d.sma200) selling.add(s); // trend broke
      else if (v.fundExit?.(fundamentals(s, date))) selling.add(s); // a new filing broke the rule
    }
    for (const s of selling) pending.push({ sym: s, side: "sell" });

    // Momentum score, as live: 12-month return (skipping the last month) in the
    // top fifth of the universe = 2, second fifth = 1.
    const rets = symbols.map((s) => today(s)?.ret12_1).filter((x): x is number => x != null).sort((a, b) => a - b);
    const q = (p: number) => rets[Math.floor(p * (rets.length - 1))];
    const [q60, q80] = [q(0.6), q(0.8)];
    // Industry leadership: each sector's top-quarter cut-off for the 12-month return.
    const bySector = new Map<string, number[]>();
    for (const s of symbols) {
      const r = today(s)?.ret12_1;
      if (r != null) (bySector.get(sectorOf.get(s) ?? "?") ?? bySector.set(sectorOf.get(s) ?? "?", []).get(sectorOf.get(s) ?? "?")!).push(r);
    }
    const sectorCut = new Map([...bySector].map(([k, xs]) => [k, xs.sort((a, b) => a - b)[Math.floor(0.75 * (xs.length - 1))]]));
    const cands: Cand[] = [];
    for (const s of symbols) {
      if (pos.has(s)) continue;
      const d = today(s);
      if (!d || d.c < 5) continue;
      const mom = d.ret12_1 == null ? 0 : d.ret12_1 >= q80 ? 2 : d.ret12_1 >= q60 ? 1 : 0;
      const leader = mom === 2 && d.ret12_1! >= (sectorCut.get(sectorOf.get(s) ?? "?") ?? Infinity);
      const r = v.pick(s, d, date, mom, leader);
      if (r != null) cands.push({ sym: s, rank: r });
    }
    qualifying.push(cands.length);
    cands.sort((a, b) => b.rank - a.rank);

    const staying = [...pos.keys()].filter((s) => !selling.has(s));
    let open = staying.length;
    let spend = cash + [...selling].reduce((sum, s) => sum + pos.get(s)!.qty * (today(s)?.c ?? 0), 0);
    const perSector = new Map<string, number>();
    for (const s of staying) perSector.set(sectorOf.get(s) ?? "?", (perSector.get(sectorOf.get(s) ?? "?") ?? 0) + 1);
    for (const c of cands) {
      if (open >= RULES.maxPositions) break;
      const sold = lastSold.get(c.sym);
      if (selling.has(c.sym) || (sold && (new Date(date).getTime() - new Date(sold).getTime()) / DAY_MS < RULES.cooldownDays)) continue;
      const sec = sectorOf.get(c.sym) ?? "?";
      if ((perSector.get(sec) ?? 0) >= RULES.perSector) continue;
      const dollars = value * RULES.weight;
      if (spend < dollars) break;
      pending.push({ sym: c.sym, side: "buy", dollars });
      spend -= dollars;
      open++;
      perSector.set(sec, (perSector.get(sec) ?? 0) + 1);
    }
  }
  return { equity, trades, stops, invested, qualifying };
}

// Benchmarks: SPY, and every stock on the list held in equal amounts (rebalanced daily).
function benchmark(kind: "spy" | "ew"): { date: string; v: number }[] {
  let v = 100_000;
  return calendar.map((date, i) => {
    if (i > 0) {
      const prev = calendar[i - 1];
      if (kind === "spy") {
        const di = spy.t.indexOf(date), pi = spy.t.indexOf(prev);
        v *= spy.c[di] / spy.c[pi];
      } else {
        const r = symbols.map((s) => {
          const a = days.get(s)!.get(prev), b = days.get(s)!.get(date);
          return a && b ? b.c / a.c - 1 : null;
        }).filter((x): x is number => x != null);
        v *= 1 + r.reduce((x, y) => x + y, 0) / r.length;
      }
    }
    return { date, v };
  });
}

// --- Stats ------------------------------------------------------------------------
function stats(curve: { date: string; v: number }[], from: string, to: string) {
  const c = curve.filter((p) => p.date >= from && p.date < to);
  const rets = c.slice(1).map((p, i) => p.v / c[i].v - 1);
  const yrs = rets.length / 252;
  const cagr = (c[c.length - 1].v / c[0].v) ** (1 / yrs) - 1;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / rets.length);
  let peak = c[0].v, dd = 0;
  for (const p of c) {
    peak = Math.max(peak, p.v);
    dd = Math.min(dd, p.v / peak - 1);
  }
  return { cagr, sharpe: (m / sd) * Math.sqrt(252), dd };
}
const pct = (x: number) => `${x >= 0 ? "" : "−"}${Math.abs(x * 100).toFixed(1)}%`;

const END = "9999";
const rows: string[] = [];
const header = "| Version | 2017–21 / yr | Sharpe | Worst drop | 2022–26 / yr | Sharpe | Worst drop | Whole period / yr | Trades | Stop-outs | Avg invested | Avg stocks qualifying |";
rows.push(header, "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
const line = (name: string, curve: { date: string; v: number }[], extra = "| – | – | – | – |") => {
  const a = stats(curve, START, SPLIT), b = stats(curve, SPLIT, END), w = stats(curve, START, END);
  rows.push(`| ${name} | ${pct(a.cagr)} | ${a.sharpe.toFixed(2)} | ${pct(a.dd)} | ${pct(b.cagr)} | ${b.sharpe.toFixed(2)} | ${pct(b.dd)} | ${pct(w.cagr)} ${extra}`);
  console.log(`${name.padEnd(16)} 17-21 ${pct(a.cagr).padStart(6)} S${a.sharpe.toFixed(2)} DD${pct(a.dd)} | 22-26 ${pct(b.cagr).padStart(6)} S${b.sharpe.toFixed(2)} DD${pct(b.dd)} | all ${pct(w.cagr)}`);
};
for (const v of VERSIONS) {
  const r = run(v);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  line(v.short, r.equity, `| ${r.trades} | ${r.stops} | ${pct(avg(r.invested))} | ${avg(r.qualifying).toFixed(0)} |`);
}
line("SPY", benchmark("spy"));
line("Every stock, equal weight", benchmark("ew"));

const md = `# Fundamentals-first rules: backtest

Generated ${new Date().toISOString().slice(0, 10)} by \`site/scripts/backtest-fundamentals.ts\`. Today's S&P 500 (${symbols.length} stocks), ${START} to ${calendar[calendar.length - 1]}, split into 2017–21 and 2022–26. Educational, not investment advice.

Every version uses the live bot's mechanics: decide at the close, trade at the next open, 8% stop-loss on the day's low, sell below the 200-day average, 10 positions at 9%, at most 2 per sector, 14-day cooldown, 0.05% cost per trade. Fundamentals are point-in-time (a filing counts from the day after it was filed).

${VERSIONS.map((v) => `- **${v.short}**: ${v.name.replace(/^[A-I]. /, "")}`).join("\n")}

${rows.join("\n")}

**Read with care:** this uses *today's* S&P 500. Companies that grew fast are exactly the ones that got added to the index, so a growth-first strategy is flattered more than the rest. Compare each version with "every stock, equal weight" (same list, same bias), not only with SPY. Profit growth uses total net income (cover-page share counts aren't split-adjusted, so per-share numbers would be wrong).
`;
writeFileSync("../projects/paper-trading/FUNDAMENTALS_BACKTEST.md", md);
console.log("Wrote projects/paper-trading/FUNDAMENTALS_BACKTEST.md");
