// The Growth Stocks screen on /research: ~1,700 US stocks (every NYSE/Nasdaq
// company worth $2B+, plus the S&P 500; src/lib/growthUniverse.json, built by
// scripts/universe/build-universe.ts), each checked
// against a strict growth-investing checklist, based on the rules William
// O'Neil and Investor's Business Daily popularized (profits growing fast for
// years, high return on equity, sales accelerating, an industry leader on
// a healthy chart, with funds buying in). It is a research shortlist, not a buy list: in the Nov
// 2026 backtest (projects/paper-trading/FUNDAMENTALS_BACKTEST.md) only a
// handful of big companies passed on a typical day.
//
// Two layers, both free and cached in Redis:
//   fundamentals  from SEC filings (lib/ml/fundamentals.ts snapshots), one
//                 record per company in the hash growth:fund:v1. Filings only
//                 change quarterly, so api/cron/daily refreshes a fifth of the
//                 list each weekday: every company once a week.
//   chart         one pass over a year of Alpaca daily bars for all ~500,
//                 cached per New York trading day.

import { getCompanyNames } from "./companyNames";
import { getCompanyFactsWithHistory, resolveTicker } from "./edgar";
import { getRedis, kvConfigured } from "./kv";
import { getDailyBars } from "./marketdata";
import { fundamentalSnapshots, type FundamentalSnapshot } from "./ml/fundamentals";
import universe from "./growthUniverse.json";
import institutions from "./institutions.json";

// Institutional sponsorship (O'Neil's "I"): how many investment funds own the
// stock, from SEC 13F filings (scripts/institutions/build-institutions.ts,
// rerun each quarter; funds file within 45 days of the quarter's end). The
// number of 13F filers grows every year, so "more funds than last quarter" is
// too easy: the check asks for the count to rise FASTER than the typical
// (median) stock's did over the same quarter.
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
// % change in funds holding each stock over one quarter (prev -> now).
export function fundChanges(holders: Record<string, (number | null)[]>, prev: number, now: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const [t, row] of Object.entries(holders)) {
    const a = row[prev], b = row[now];
    if (a != null && b != null && a > 0) out.set(t, b / a - 1);
  }
  return out;
}
const INST = institutions as { asOf: string; periods: string[]; holders: Record<string, (number | null)[]> };
const instLast = INST.periods.length - 1;
const instChanges = instLast >= 1 ? fundChanges(INST.holders, instLast - 1, instLast) : new Map<string, number>();
const instMedian = median([...instChanges.values()]);

// Volume shows buying: the daily stand-in for funds buying, after IBD's
// Up/Down Volume idea. Big funds can't build a position quietly, so heavy
// volume on up days and light volume on down days is their footprint.
// Ratio = shares traded on up days ÷ shares traded on down days over the
// last 50 trading days; above 1 means more buying than selling pressure.
// An estimate of who's trading, not proof (13F above is the proof, but late).
export function upDownVolume(closes: number[], volumes: number[], days = 50): number | null {
  const n = closes.length;
  if (n < days + 1 || volumes.length !== n) return null;
  let up = 0, down = 0;
  for (let i = n - days; i < n; i++) {
    if (closes[i] > closes[i - 1]) up += volumes[i];
    else if (closes[i] < closes[i - 1]) down += volumes[i];
  }
  return down > 0 ? up / down : null;
}

export const GROWTH_RULES = {
  profitGrowth: 0.25, // average yearly profit growth over 3 years (O'Neil's 25%)
  netMargin: 0.1,
  roe: 0.17,
  salesGrowth: 0.2, // and faster than a year ago
  nearHigh: 0.15, // within 15% of the 52-week high
  // Industry leader: Relative Price Score (below) of 80+ against the whole
  // whole list and 75+ against its own sector.
  marketScore: 80,
  sectorScore: 75,
  upDownVolume: 1.2, // 20%+ more volume on up days than down days, last 50 days
} as const;

// Relative Price Score, 1-99: how a stock's price performance over the past
// year ranks against the other ~1,700 stocks (or just its own sector). The
// year is weighted towards recent months, 40% the latest quarter and 20% each
// of the three before, so a stock that's strong NOW scores higher than one
// whose run was a year ago. The growth-investing books treat 80+ as strong.
// It's our own transparent version of the idea, not IBD's proprietary rating.
export function weightedReturn(closes: number[]): number | null {
  const Q = 63; // trading days in a quarter
  if (closes.length < 4 * Q + 1) return null;
  const at = (k: number) => closes[closes.length - 1 - k * Q];
  const q = (n: number) => at(n - 1) / at(n) - 1; // quarter n back (1 = latest)
  return 0.4 * q(1) + 0.2 * q(2) + 0.2 * q(3) + 0.2 * q(4);
}
// 1-99 percentile ranks for a set of values (higher value = higher score).
export function rankScores(values: Map<string, number>): Map<string, number> {
  const sorted = [...values].sort((a, b) => a[1] - b[1]);
  const out = new Map<string, number>();
  const n = sorted.length;
  sorted.forEach(([sym], i) => out.set(sym, n < 2 ? 50 : 1 + Math.round((i / (n - 1)) * 98)));
  return out;
}

const FUND_KEY = "growth:fund:v1";
const TECH_KEY = "growth:tech:v3"; // v2: weighted return for the Relative Price Score; v3: up/down volume
const SLICES = 10; // company numbers: a tenth refreshed each weekday, all every two weeks

const STOCKS = (universe as { stocks: { symbol: string; cik: number; name: string; sector: string }[] }).stocks;
const SECTOR_OF = new Map(STOCKS.map((s) => [s.symbol, s.sector]));

export type FundRecord = {
  filed: string; // date of the latest filing used
  updated: string; // when this record was computed
  netIncome: number | null; // trailing 12 months
  growth3y: number | null; // average yearly profit growth over 3 years (null if any year lost money)
  grewEveryYear: boolean;
  netMargin: number | null;
  roe: number | null; // net income / shareholders' equity
  salesGrowth: number | null; // trailing 12 months vs the year before
  salesGrowthYearAgo: number | null; // the same, a year ago
};

type Tech = { close: number; sma50: number | null; sma200: number | null; high52: number; ret12m: number | null; wret: number | null; udv: number | null };

export type Check = { pass: boolean | null; value: string }; // null = no data
export type GrowthRow = {
  symbol: string;
  name: string;
  sector: string;
  passed: number;
  checked: number;
  checks: Record<"profitable" | "profitGrowth" | "margin" | "roe" | "sales" | "leader" | "chart" | "funds" | "volume", Check>;
  score: number | null; // Relative Price Score vs the whole list (~1,700 stocks), 1-99
  sectorScore: number | null; // the same, vs its own sector only
  growth3y: number | null; // for sorting
  belowSma200: boolean | null; // last close under the 200-day average (the growth robot's sell rule)
};

// --- Fundamentals --------------------------------------------------------------

const DAY = 86_400_000;
const yearsBack = (date: string, y: number) => new Date(new Date(date).getTime() - y * 365.25 * DAY).toISOString().slice(0, 10);
const snapAt = (list: FundamentalSnapshot[], date: string) => {
  let out: FundamentalSnapshot | null = null;
  for (const s of list) if (s.known <= date) out = s;
  return out;
};

export function fundRecord(snaps: FundamentalSnapshot[], today = new Date().toISOString().slice(0, 10)): FundRecord | null {
  const now = snapAt(snaps, today);
  if (!now) return null;
  // Trailing-12-month profit now and 1, 2, 3 years earlier.
  const ni = [0, 1, 2, 3].map((y) => (y === 0 ? now : snapAt(snaps, yearsBack(today, y)))?.niTtm ?? null);
  const allPositive = ni.every((x) => x != null && x > 0);
  return {
    filed: now.known,
    updated: new Date().toISOString(),
    netIncome: now.niTtm,
    // Average yearly growth (compound): (profit now / profit 3 years ago)^(1/3) − 1.
    growth3y: allPositive ? (ni[0]! / ni[3]!) ** (1 / 3) - 1 : null,
    grewEveryYear: allPositive && ni[0]! > ni[1]! && ni[1]! > ni[2]! && ni[2]! > ni[3]!,
    netMargin: now.netMargin,
    roe: now.niTtm != null && now.equity && now.equity > 0 ? now.niTtm / now.equity : null,
    salesGrowth: now.revGrowth,
    salesGrowthYearAgo: snapAt(snaps, yearsBack(today, 1))?.revGrowth ?? null,
  };
}

// A stable tenth for each ticker, so each slot refreshes the same group.
const sliceOf = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % SLICES;
// Which tenth today: the weekday (Mon-Fri) plus 5 on odd weeks, so the ten
// slots come round once every two weeks of weekday runs.
const todaysSlice = () => {
  const now = new Date();
  const week = Math.floor(now.getTime() / (7 * DAY));
  return ((now.getUTCDay() + 4) % 5) + (week % 2) * 5;
};

// For api/cron/daily: one tenth of the list (all of it with slice "all").
export async function refreshGrowthFundamentals(slice: number | "all" = todaysSlice()) {
  if (!kvConfigured()) throw new Error("Redis isn't configured");
  const mine = STOCKS.filter((s) => slice === "all" || sliceOf(s.symbol) === slice);
  const records: Record<string, FundRecord> = {};
  const failed: string[] = [];
  // SEC asks for at most 10 requests a second; 4 at a time stays well under.
  for (let i = 0; i < mine.length; i += 4) {
    await Promise.all(
      mine.slice(i, i + 4).map(async (s) => {
        try {
          // The list carries each company's SEC id; fall back to a ticker lookup.
          const company = s.cik ? { cik: s.cik, ticker: s.symbol, title: s.name } : await resolveTicker(s.symbol.replace(".", "-"));
          if (!company) throw new Error("not an SEC filer");
          const { facts } = await getCompanyFactsWithHistory(company);
          const r = fundRecord(fundamentalSnapshots(facts));
          if (r) records[s.symbol] = r;
          else failed.push(s.symbol);
        } catch {
          failed.push(s.symbol);
        }
      }),
    );
  }
  if (Object.keys(records).length) await getRedis().hset(FUND_KEY, records);
  return { slice, companies: mine.length, updated: Object.keys(records).length, failed: failed.length };
}

// --- Chart -----------------------------------------------------------------------

const nyDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

type TechCache = { day: string; tech: Record<string, Tech>; names: Record<string, string> };

// Reads ~1,700 stocks' last year of prices: a minute or two, so it runs in
// api/cron/daily after the close, not when someone opens the page.
export async function refreshGrowthTechnicals() {
  const out = await computeTechnicals();
  return { day: out.day, stocks: Object.keys(out.tech).length };
}

async function technicals(): Promise<TechCache> {
  if (kvConfigured()) {
    const hit = await getRedis().get<TechCache>(TECH_KEY).catch(() => null);
    // Last night's numbers are fine during the day; recompute only if the
    // cache is missing or the cron has missed several days.
    if (hit && (Date.now() - new Date(hit.day).getTime()) / DAY <= 4) return hit;
  }
  return computeTechnicals();
}

async function computeTechnicals(): Promise<TechCache> {
  const day = nyDay();
  const symbols = STOCKS.map((s) => s.symbol);
  const from = new Date(Date.now() - 400 * DAY).toISOString().slice(0, 10);
  const [bars, names] = await Promise.all([
    getDailyBars(symbols, 0, { start: from, feed: "sip", adjustment: "all" }),
    getCompanyNames(symbols).catch(() => ({}) as Record<string, string>),
  ]);
  const tech: Record<string, Tech> = {};
  for (const [s, b] of bars) {
    const c = b.map((x) => x.c);
    if (c.length < 60) continue;
    const avg = (n: number) => (c.length >= n ? c.slice(-n).reduce((a, x) => a + x, 0) / n : null);
    const year = c.slice(-252);
    tech[s] = {
      close: c[c.length - 1],
      sma50: avg(50),
      sma200: avg(200),
      high52: Math.max(...year),
      ret12m: c.length > 252 ? c[c.length - 1] / c[c.length - 253] - 1 : null,
      wret: weightedReturn(c),
      udv: b.every((x) => x.v != null) ? upDownVolume(c, b.map((x) => x.v!)) : null,
    };
  }
  const out = { day, tech, names };
  if (kvConfigured()) await getRedis().set(TECH_KEY, out, { ex: 6 * 86400 }).catch(() => {});
  return out;
}

// --- The screen ------------------------------------------------------------------

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(0)}%`;

export async function getGrowthScreen() {
  const [fund, { day, tech, names }] = await Promise.all([
    kvConfigured() ? getRedis().hgetall<Record<string, FundRecord>>(FUND_KEY) : Promise.resolve(null),
    technicals(),
  ]);
  const funds = fund ?? {};

  // Relative Price Scores: against the whole list, and within each sector.
  const wrets = new Map(STOCKS.flatMap((s) => (tech[s.symbol]?.wret != null ? [[s.symbol, tech[s.symbol].wret!] as const] : [])));
  const marketScores = rankScores(wrets);
  const sectorScores = new Map<string, number>();
  for (const sector of new Set(STOCKS.map((s) => s.sector))) {
    const inSector = new Map([...wrets].filter(([sym]) => SECTOR_OF.get(sym) === sector));
    for (const [sym, sc] of rankScores(inSector)) sectorScores.set(sym, sc);
  }

  const R = GROWTH_RULES;
  const rows: GrowthRow[] = STOCKS.map((s) => {
    const f = funds[s.symbol];
    const t = tech[s.symbol];
    const checks: GrowthRow["checks"] = {
      profitable: f?.netIncome == null ? { pass: null, value: "no data" } : { pass: f.netIncome > 0, value: f.netIncome > 0 ? "yes" : "losing money" },
      profitGrowth: !f
        ? { pass: null, value: "no data" }
        : f.growth3y == null
          ? { pass: false, value: "lost money in the last 3 years" }
          : { pass: f.growth3y >= R.profitGrowth && f.grewEveryYear, value: `${pct(f.growth3y)}/yr${f.grewEveryYear ? "" : ", not every year"}` },
      margin: f?.netMargin == null ? { pass: null, value: "no data" } : { pass: f.netMargin >= R.netMargin, value: `${(f.netMargin * 100).toFixed(0)}% net` },
      roe: f?.roe == null ? { pass: f ? false : null, value: f ? "no equity figure (or negative)" : "no data" } : { pass: f.roe >= R.roe, value: `${(f.roe * 100).toFixed(0)}%` },
      sales: f?.salesGrowth == null
        ? { pass: null, value: "no data" }
        : {
            pass: f.salesGrowth >= R.salesGrowth && f.salesGrowthYearAgo != null && f.salesGrowth > f.salesGrowthYearAgo,
            value: `${pct(f.salesGrowth)}${f.salesGrowthYearAgo != null ? ` (a year ago ${pct(f.salesGrowthYearAgo)})` : ""}`,
          },
      leader: !marketScores.has(s.symbol)
        ? { pass: null, value: "no data" }
        : {
            pass: marketScores.get(s.symbol)! >= R.marketScore && (sectorScores.get(s.symbol) ?? 0) >= R.sectorScore,
            value: `Relative Price Score ${marketScores.get(s.symbol)} (${sectorScores.get(s.symbol)} in its sector)`,
          },
      chart: !t || t.sma200 == null || t.sma50 == null
        ? { pass: null, value: "no data" }
        : {
            pass: t.close > t.sma50 && t.close > t.sma200 && t.close >= t.high52 * (1 - R.nearHigh),
            value: `${pct(t.close / t.high52 - 1)} from 52-wk high, ${t.close > t.sma50 && t.close > t.sma200 ? "above" : "not above"} 50/200-day`,
          },
      funds: (() => {
        const ch = instChanges.get(s.symbol);
        const n = INST.holders[s.symbol]?.[instLast];
        if (ch == null || n == null || instMedian == null) return { pass: null, value: "no 13F data" };
        return {
          pass: ch > 0 && ch > instMedian,
          value: `${n.toLocaleString("en-US")} funds hold it, ${pct(ch)} in the quarter to ${INST.periods[instLast]} (typical stock ${pct(instMedian)})`,
        };
      })(),
      volume: t?.udv == null
        ? { pass: null, value: "no data" }
        : { pass: t.udv >= R.upDownVolume, value: `up/down volume ${t.udv.toFixed(2)} over 50 days` },
    };
    const vals = Object.values(checks);
    return {
      symbol: s.symbol,
      name: names[s.symbol] ?? s.name,
      sector: s.sector,
      passed: vals.filter((c) => c.pass === true).length,
      checked: vals.filter((c) => c.pass !== null).length,
      checks,
      growth3y: f?.growth3y ?? null,
      belowSma200: t?.sma200 == null ? null : t.close < t.sma200,
      score: marketScores.get(s.symbol) ?? null,
      sectorScore: sectorScores.get(s.symbol) ?? null,
    };
  }).sort((a, b) => b.passed - a.passed || (b.growth3y ?? -9) - (a.growth3y ?? -9));

  const filedDates = Object.values(funds).map((f) => f.updated).sort();
  return {
    rules: GROWTH_RULES,
    priceDay: day,
    fundsQuarter: INST.periods[instLast] ?? null,
    fundamentals: { companies: Object.keys(funds).length, oldest: filedDates[0] ?? null, newest: filedDates[filedDates.length - 1] ?? null },
    rows,
  };
}
