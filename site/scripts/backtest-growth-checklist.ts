// Backtest: the Growth Stocks screen's checklist as a buying rule, with
// lenient versions. Instead of buying only stocks that pass EVERY check (which
// left the Nov 4 backtest mostly in cash), buy anything passing 5+ or 6+.
//
// The eight checks are the screen's own (lib/growthScreen.ts), point-in-time:
//   1 profitable              trailing-12-month net income > 0
//   2 profit growth           +25%/yr average over 3 years, up every year
//   3 margins                 net margin >= 10%
//   4 return on equity        >= 17%
//   5 sales speeding up       sales +20%+ and faster than a year ago
//   6 industry leader         Relative Price Score 80+ vs the list, 75+ in its sector
//   7 healthy chart           above the 50- and 200-day averages, within 15% of the 52-week high
//   8 funds buying            13F fund count rose last quarter, faster than the median stock's
//   9 volume shows buying     up-day volume >= 1.2x down-day volume over 50 days
// Versions test 5+/6+ of the original 7, and with either new check (of 8) or both (of 9).
// A filing counts from the day after it was filed; a quarter's 13F counts from
// 46 days after the quarter ends (the filing deadline is 45 days).
//
// Mechanics are the live bot's, as in backtest-fundamentals.ts: decide at the
// close, trade at the next open; 8% stop-loss on the day's low; sell when the
// close drops under the 200-day average or the company starts losing money;
// 10 positions at 9% of the account; at most 2 per sector; 14-day cooldown;
// 0.05% cost per trade. Candidates are ranked by checks passed, then by
// Relative Price Score.
//
// Data: .ml-cache/sp500 (scripts/ml/fetch-data.ts + fetch-fundamentals.ts) and
// .ml-cache/13f/holders.json (scripts/institutions/build-institutions.ts).
// Today's S&P 500 only: see the survivorship caveat in the report.
//
// Usage, from site/:  npx tsx scripts/backtest-growth-checklist.ts   -> projects/paper-trading/GROWTH_CHECKLIST_BACKTEST.md

import { readFileSync, writeFileSync } from "node:fs";
import sp500 from "../src/lib/ml/sp500.json";
import type { FundamentalSnapshot } from "../src/lib/ml/fundamentals";
import { fundChanges, GROWTH_RULES, median, rankScores, upDownVolume, weightedReturn } from "../src/lib/growthScreen";

type Bars = { t: string[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] };
const bars: Record<string, Bars> = JSON.parse(readFileSync(".ml-cache/sp500/bars.json", "utf8"));
const fund: Record<string, FundamentalSnapshot[]> = JSON.parse(readFileSync(".ml-cache/sp500/fundamentals.json", "utf8"));
const inst: { periods: string[]; holders: Record<string, (number | null)[]> } = JSON.parse(readFileSync(".ml-cache/13f/holders.json", "utf8"));
const sectorOf = new Map(sp500.stocks.map((s) => [s.symbol, s.sector]));

const START = "2017-03-01";
const SPLIT = "2022-01-01";
const COST = 0.0005;
const RULES = { stop: 0.08, maxPositions: 10, weight: 0.09, perSector: 2, cooldownDays: 14 };
const G = { profitGrowth: 0.25, netMargin: 0.1, roe: 0.17, salesGrowth: 0.2, nearHigh: 0.15, marketScore: 80, sectorScore: 75 };
const YEAR = 252, MONTH = 21;
const DAY_MS = 86_400_000;

const spy = bars.SPY;
const calendar = spy.t.filter((d) => d >= START);
const symbols = Object.keys(bars).filter((s) => s !== "SPY" && bars[s].t.length > YEAR + MONTH);

// --- Per-stock daily price numbers ---------------------------------------------------
type Day = { o: number; h: number; l: number; c: number; sma50: number | null; sma200: number | null; high52: number; wret: number | null; ret12_1: number | null; udv: number | null };
const days = new Map<string, Map<string, Day>>();
for (const s of symbols) {
  const b = bars[s];
  const m = new Map<string, Day>();
  let s50 = 0, s200 = 0;
  for (let i = 0; i < b.t.length; i++) {
    s50 += b.c[i] - (i >= 50 ? b.c[i - 50] : 0);
    s200 += b.c[i] - (i >= 200 ? b.c[i - 200] : 0);
    if (b.t[i] < "2016-01-01") continue;
    const closes = b.c.slice(Math.max(0, i - 4 * 63), i + 1);
    m.set(b.t[i], {
      o: b.o[i], h: b.h[i], l: b.l[i], c: b.c[i],
      sma50: i >= 49 ? s50 / 50 : null,
      sma200: i >= 199 ? s200 / 200 : null,
      high52: Math.max(...b.c.slice(Math.max(0, i - YEAR + 1), i + 1)),
      wret: weightedReturn(closes),
      ret12_1: i >= YEAR ? b.c[i - MONTH] / b.c[i - YEAR] - 1 : null,
      udv: i >= 51 ? upDownVolume(b.c.slice(i - 50, i + 1), b.v.slice(i - 50, i + 1)) : null,
    });
  }
  days.set(s, m);
}

// --- Point-in-time fundamentals (same math as lib/growthScreen.ts fundRecord) -------------
type Fund = { profitable: boolean; growth3y: number | null; grewEveryYear: boolean; netMargin: number | null; roe: number | null; salesGrowth: number | null; salesGrowthYearAgo: number | null };
function snapAt(list: FundamentalSnapshot[], date: string): FundamentalSnapshot | null {
  let lo = 0, hi = list.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].known < date) { ans = mid; lo = mid + 1; } else hi = mid - 1;
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
  const key = `${sym}|${now.known}`;
  if (fundCache.has(key)) return fundCache.get(key)!;
  const ni = [0, 1, 2, 3].map((y) => (y === 0 ? now : snapAt(list, yearsBack(date, y)))?.niTtm ?? null);
  const allPositive = ni.every((x) => x != null && x > 0);
  const f: Fund = {
    profitable: now.niTtm > 0,
    growth3y: allPositive ? (ni[0]! / ni[3]!) ** (1 / 3) - 1 : null,
    grewEveryYear: allPositive && ni[0]! > ni[1]! && ni[1]! > ni[2]! && ni[2]! > ni[3]!,
    netMargin: now.netMargin,
    roe: now.equity && now.equity > 0 ? now.niTtm / now.equity : null,
    salesGrowth: now.revGrowth,
    salesGrowthYearAgo: snapAt(list, yearsBack(date, 1))?.revGrowth ?? null,
  };
  fundCache.set(key, f);
  return f;
}

// --- Point-in-time fund buying (13F) ----------------------------------------------------------
// For each quarter i >= 1: the date it became public, each stock's change, and the median.
const instQuarters = inst.periods.slice(1).map((p, k) => {
  const changes = fundChanges(inst.holders, k, k + 1);
  return { known: new Date(new Date(p).getTime() + 46 * DAY_MS).toISOString().slice(0, 10), changes, median: median([...changes.values()]) };
});
function fundsBuying(sym: string, date: string): boolean | null {
  let q: (typeof instQuarters)[number] | null = null;
  for (const x of instQuarters) if (x.known <= date) q = x;
  const ch = q?.changes.get(sym);
  if (!q || ch == null || q.median == null) return null;
  return ch > 0 && ch > q.median;
}

// --- The checklist --------------------------------------------------------------------------------
// passed7 = the original seven; funds = 13F check; volume = up/down volume check.
type Checks = { passed7: number; funds: boolean; volume: boolean };
const checkCache = new Map<string, Checks>(); // the same stock-day is scored once for every version
function checklist(sym: string, d: Day, date: string, mScore: number | undefined, sScore: number | undefined): Checks {
  const key = `${date}|${sym}`;
  const hit = checkCache.get(key);
  if (hit) return hit;
  const c = computeChecks(sym, d, date, mScore, sScore);
  checkCache.set(key, c);
  return c;
}
function computeChecks(sym: string, d: Day, date: string, mScore: number | undefined, sScore: number | undefined): Checks {
  const f = fundamentals(sym, date);
  const pass = [
    !!f?.profitable,
    !!f && f.growth3y != null && f.growth3y >= G.profitGrowth && f.grewEveryYear,
    (f?.netMargin ?? -1) >= G.netMargin,
    (f?.roe ?? -1) >= G.roe,
    !!f && (f.salesGrowth ?? -1) >= G.salesGrowth && f.salesGrowthYearAgo != null && f.salesGrowth! > f.salesGrowthYearAgo,
    (mScore ?? 0) >= G.marketScore && (sScore ?? 0) >= G.sectorScore,
    !!d.sma50 && !!d.sma200 && d.c > d.sma50 && d.c > d.sma200 && d.c >= d.high52 * (1 - G.nearHigh),
  ];
  return { passed7: pass.filter(Boolean).length, funds: !!fundsBuying(sym, date), volume: (d.udv ?? 0) >= GROWTH_RULES.upDownVolume };
}

// --- Versions -------------------------------------------------------------------------------------
type Version = { short: string; name: string; pick: (c: Checks, d: Day, mom: number) => number | null };
const trendScore = (d: Day) => (d.sma200 && d.c > d.sma200 ? 1 : 0) + (d.sma50 && d.sma200 && d.sma50 > d.sma200 ? 1 : 0);
// Checks passed out of the seven, plus the 13F and/or volume checks.
const score = (c: Checks, funds: boolean, volume: boolean) => c.passed7 + (funds && c.funds ? 1 : 0) + (volume && c.volume ? 1 : 0);
const atLeast = (n: number, funds: boolean, volume: boolean) => (c: Checks) => (score(c, funds, volume) >= n ? score(c, funds, volume) : null);
const VERSIONS: Version[] = [
  { short: "Current bot", name: "The live Signal Trader's price-only rule (trend + momentum score 4), for reference", pick: (_c, d, mom) => (trendScore(d) + mom >= 4 ? mom * 10 + (d.sma200 ? d.c / d.sma200 : 0) : null) },
  { short: "6+ of 7", name: "The original 7 checks, miss at most one", pick: atLeast(6, false, false) },
  { short: "5+ of 7", name: "The original 7 checks, miss at most two", pick: atLeast(5, false, false) },
  { short: "7+ of 8 (13F)", name: "7 + funds buying (13F), miss at most one", pick: atLeast(7, true, false) },
  { short: "6+ of 8 (13F)", name: "7 + funds buying (13F), miss at most two", pick: atLeast(6, true, false) },
  { short: "5+ of 8 (13F)", name: "7 + funds buying (13F), miss at most three", pick: atLeast(5, true, false) },
  { short: "7+ of 8 (volume)", name: "7 + volume shows buying, miss at most one", pick: atLeast(7, false, true) },
  { short: "6+ of 8 (volume)", name: "7 + volume shows buying, miss at most two", pick: atLeast(6, false, true) },
  { short: "5+ of 8 (volume)", name: "7 + volume shows buying, miss at most three", pick: atLeast(5, false, true) },
  { short: "8+ of 9", name: "All nine checks, miss at most one", pick: atLeast(8, true, true) },
  { short: "7+ of 9", name: "All nine checks, miss at most two", pick: atLeast(7, true, true) },
  { short: "6+ of 9", name: "All nine checks, miss at most three", pick: atLeast(6, true, true) },
];

// --- Simulation -------------------------------------------------------------------------------------
type Pos = { qty: number; cost: number };
type Result = { equity: { date: string; v: number }[]; trades: number; stops: number; invested: number[]; qualifying: number[] };

function run(v: Version): Result {
  let cash = 100_000;
  const pos = new Map<string, Pos>();
  const lastSold = new Map<string, string>();
  let pending: { sym: string; side: "buy" | "sell"; dollars?: number }[] = [];
  const equity: Result["equity"] = [], invested: number[] = [], qualifying: number[] = [];
  let trades = 0, stops = 0;

  for (const date of calendar) {
    const today = (s: string) => days.get(s)?.get(date);

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

    for (const [s, p] of [...pos]) {
      const d = today(s);
      if (!d) continue;
      const stopPx = p.cost * (1 - RULES.stop);
      if (d.l <= stopPx) {
        cash += p.qty * Math.min(d.o, stopPx) * (1 - COST);
        pos.delete(s);
        lastSold.set(s, date);
        trades++;
        stops++;
      }
    }

    let value = cash;
    for (const [s, p] of pos) value += p.qty * (today(s)?.c ?? p.cost);
    equity.push({ date, v: value });
    invested.push(1 - cash / value);

    const selling = new Set<string>();
    for (const s of pos.keys()) {
      const d = today(s);
      if (!d) continue;
      if (d.sma200 && d.c < d.sma200) selling.add(s);
      else if (v.short !== "Current bot" && fundamentals(s, date)?.profitable === false) selling.add(s);
    }
    for (const s of selling) pending.push({ sym: s, side: "sell" });

    // Relative Price Scores today: vs the whole list and within each sector.
    const wrets = new Map<string, number>();
    for (const s of symbols) {
      const w = today(s)?.wret;
      if (w != null) wrets.set(s, w);
    }
    const mScores = rankScores(wrets);
    const sScores = new Map<string, number>();
    for (const sec of new Set(sectorOf.values())) {
      for (const [s, sc] of rankScores(new Map([...wrets].filter(([s]) => sectorOf.get(s) === sec)))) sScores.set(s, sc);
    }
    // Momentum score for the current bot (top fifth = 2, second fifth = 1).
    const rets = symbols.map((s) => today(s)?.ret12_1).filter((x): x is number => x != null).sort((a, b) => a - b);
    const q = (p: number) => rets[Math.floor(p * (rets.length - 1))];
    const [q60, q80] = [q(0.6), q(0.8)];

    const cands: { sym: string; rank: number }[] = [];
    for (const s of symbols) {
      if (pos.has(s)) continue;
      const d = today(s);
      if (!d || d.c < 5) continue;
      const mom = d.ret12_1 == null ? 0 : d.ret12_1 >= q80 ? 2 : d.ret12_1 >= q60 ? 1 : 0;
      const c = v.short === "Current bot" ? { passed7: 0, funds: false, volume: false } : checklist(s, d, date, mScores.get(s), sScores.get(s));
      const r = v.pick(c, d, mom);
      if (r != null) cands.push({ sym: s, rank: r * 1000 + (mScores.get(s) ?? 0) });
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

function benchmark(kind: "spy" | "ew"): { date: string; v: number }[] {
  let v = 100_000;
  return calendar.map((date, i) => {
    if (i > 0) {
      const prev = calendar[i - 1];
      if (kind === "spy") v *= spy.c[spy.t.indexOf(date)] / spy.c[spy.t.indexOf(prev)];
      else {
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

function stats(curve: { date: string; v: number }[], from: string, to: string) {
  const c = curve.filter((p) => p.date >= from && p.date < to);
  const rets = c.slice(1).map((p, i) => p.v / c[i].v - 1);
  const cagr = (c[c.length - 1].v / c[0].v) ** (252 / rets.length) - 1;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / rets.length);
  let peak = c[0].v, dd = 0;
  for (const p of c) { peak = Math.max(peak, p.v); dd = Math.min(dd, p.v / peak - 1); }
  return { cagr, sharpe: (m / sd) * Math.sqrt(252), dd };
}
const pct = (x: number) => `${x >= 0 ? "" : "−"}${Math.abs(x * 100).toFixed(1)}%`;

const rows = [
  "| Version | 2017–21 / yr | Sharpe | Worst drop | 2022–26 / yr | Sharpe | Worst drop | Whole period / yr | Trades | Stop-outs | Avg invested | Avg stocks qualifying |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
];
const line = (name: string, curve: { date: string; v: number }[], extra = "| – | – | – | – |") => {
  const a = stats(curve, START, SPLIT), b = stats(curve, SPLIT, "9999"), w = stats(curve, START, "9999");
  rows.push(`| ${name} | ${pct(a.cagr)} | ${a.sharpe.toFixed(2)} | ${pct(a.dd)} | ${pct(b.cagr)} | ${b.sharpe.toFixed(2)} | ${pct(b.dd)} | ${pct(w.cagr)} ${extra}`);
  console.log(`${name.padEnd(20)} 17-21 ${pct(a.cagr).padStart(6)} | 22-26 ${pct(b.cagr).padStart(6)} | all ${pct(w.cagr).padStart(6)} DD ${pct(w.dd)}`);
};
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
for (const v of VERSIONS) {
  const r = run(v);
  line(v.short, r.equity, `| ${r.trades} | ${r.stops} | ${pct(avg(r.invested))} | ${avg(r.qualifying).toFixed(0)} |`);
}
line("SPY", benchmark("spy"));
line("Every stock, equal weight", benchmark("ew"));

// How often does the funds check pass on its own? (sanity check on the 13F data)
let fundsPass = 0, fundsKnown = 0, volPass = 0, volKnown = 0;
for (const date of calendar.filter((_, i) => i % 21 === 0)) {
  for (const s of symbols) {
    const f = fundsBuying(s, date);
    if (f != null) { fundsKnown++; if (f) fundsPass++; }
    const u = days.get(s)?.get(date)?.udv;
    if (u != null) { volKnown++; if (u >= GROWTH_RULES.upDownVolume) volPass++; }
  }
}

const md = `# Growth checklist, lenient versions: backtest

Generated ${new Date().toISOString().slice(0, 10)} by \`site/scripts/backtest-growth-checklist.ts\`. Today's S&P 500 (${symbols.length} stocks), ${START} to ${calendar[calendar.length - 1]}, split into 2017–21 and 2022–26. Educational, not investment advice.

The question: the Growth Stocks screen's checklist left a bot mostly in cash when it demanded every check. What if it buys stocks that pass **most** of them?

**The checks** (the screen's own, \`lib/growthScreen.ts\`). The original 7: profitable · profits +25%/yr for 3 years, up every year · net margin ≥10% · ROE ≥17% · sales +20% and speeding up · industry leader (Relative Price Score 80+, 75+ in its sector) · healthy chart (above 50/200-day, within 15% of the 52-week high). Two new ways to see big funds buying:
- **Funds buying (13F)**: the number of funds holding it, from SEC 13F filings, rose last quarter faster than the median stock's. Quarterly and 45+ days late. Passed on ${pct(fundsPass / Math.max(1, fundsKnown))} of stock-days with data.
- **Volume shows buying**: ${GROWTH_RULES.upDownVolume}x+ as many shares traded on up days as down days over the last 50 days. Daily. Passed on ${pct(volPass / Math.max(1, volKnown))} of stock-days.

**Mechanics** (same as the live bot and FUNDAMENTALS_BACKTEST.md): decide at the close, trade at the next open, 8% stop-loss on the day's low, sell below the 200-day average or when the company starts losing money, 10 positions at 9%, at most 2 per sector, 14-day cooldown, 0.05% cost per trade. Candidates ranked by checks passed, then Relative Price Score. Fundamentals count from the day after filing; a quarter's 13F counts from 46 days after the quarter ends.

${VERSIONS.map((v) => `- **${v.short}**: ${v.name}`).join("\n")}

${rows.join("\n")}

**Read with care:** this uses *today's* S&P 500, so companies that grew fast (and got added to the index for it) are overrepresented; compare with "every stock, equal weight" (same list, same bias), not only SPY. The live screen covers ~1,700 stocks; this test covers only the ~500 with cached price and filing history. O'Neil's own sell rules (beyond the 8% stop) aren't modelled. 13F tickers come from today's CUSIP mapping, so a company whose CUSIP changed has no fund data before the change (the check counts as failed, not passed).
`;
writeFileSync("../projects/paper-trading/GROWTH_CHECKLIST_BACKTEST.md", md);
console.log("Wrote projects/paper-trading/GROWTH_CHECKLIST_BACKTEST.md");
