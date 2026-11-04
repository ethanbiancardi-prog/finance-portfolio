// The Growth Stocks screen on /research: every S&P 500 company checked
// against a strict growth-investing checklist, based on the rules William
// O'Neil and Investor's Business Daily popularized (profits growing fast for
// years, high return on equity, sales accelerating, an industry leader on
// a healthy chart). It is a research shortlist, not a buy list: in the Nov
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
import sp500 from "./ml/sp500.json";

export const GROWTH_RULES = {
  profitGrowth: 0.25, // average yearly profit growth over 3 years (O'Neil's 25%)
  netMargin: 0.1,
  roe: 0.17,
  salesGrowth: 0.2, // and faster than a year ago
  nearHigh: 0.15, // within 15% of the 52-week high
  marketTop: 0.8, // 12-month return in the top fifth of the S&P 500...
  sectorTop: 0.75, // ...and the top quarter of its own sector
} as const;

const FUND_KEY = "growth:fund:v1";
const TECH_KEY = "growth:tech:v1";
const SLICES = 5;

const STOCKS = (sp500 as { stocks: { symbol: string; cik: number; sector: string }[] }).stocks;

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

type Tech = { close: number; sma50: number | null; sma200: number | null; high52: number; ret12m: number | null };

export type Check = { pass: boolean | null; value: string }; // null = no data
export type GrowthRow = {
  symbol: string;
  name: string;
  sector: string;
  passed: number;
  checked: number;
  checks: Record<"profitable" | "profitGrowth" | "margin" | "roe" | "sales" | "leader" | "chart", Check>;
  growth3y: number | null; // for sorting
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

// A stable fifth for each ticker, so each weekday refreshes the same group.
const sliceOf = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % SLICES;

// For api/cron/daily: one fifth of the S&P 500 (all of it with slice "all").
export async function refreshGrowthFundamentals(slice: number | "all" = new Date().getUTCDay() % SLICES) {
  if (!kvConfigured()) throw new Error("Redis isn't configured");
  const mine = STOCKS.filter((s) => slice === "all" || sliceOf(s.symbol) === slice);
  const records: Record<string, FundRecord> = {};
  const failed: string[] = [];
  // SEC asks for at most 10 requests a second; 4 at a time stays well under.
  for (let i = 0; i < mine.length; i += 4) {
    await Promise.all(
      mine.slice(i, i + 4).map(async (s) => {
        try {
          // SEC spells class shares with a dash (BRK-B); the S&P list with a dot.
          const company = (await resolveTicker(s.symbol.replace(".", "-"))) ?? { cik: s.cik, ticker: s.symbol, title: s.symbol };
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

async function technicals(): Promise<{ day: string; tech: Record<string, Tech>; names: Record<string, string> }> {
  const day = nyDay();
  if (kvConfigured()) {
    const hit = await getRedis().get<{ day: string; tech: Record<string, Tech>; names: Record<string, string> }>(TECH_KEY).catch(() => null);
    if (hit?.day === day) return hit;
  }
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
    };
  }
  const out = { day, tech, names };
  if (kvConfigured()) await getRedis().set(TECH_KEY, out, { ex: 36 * 3600 }).catch(() => {});
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

  // Leadership cut-offs: the market's top fifth, and each sector's top quarter, by 12-month return.
  const sorted = (xs: number[]) => xs.sort((a, b) => a - b);
  const at = (xs: number[], p: number) => xs[Math.floor(p * (xs.length - 1))];
  const all = sorted(STOCKS.map((s) => tech[s.symbol]?.ret12m).filter((x): x is number => x != null));
  const marketCut = at(all, GROWTH_RULES.marketTop);
  const bySector = new Map<string, number[]>();
  for (const s of STOCKS) {
    const r = tech[s.symbol]?.ret12m;
    if (r != null) bySector.set(s.sector, [...(bySector.get(s.sector) ?? []), r]);
  }
  const sectorCut = new Map([...bySector].map(([k, xs]) => [k, at(sorted(xs), GROWTH_RULES.sectorTop)]));

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
      leader: t?.ret12m == null
        ? { pass: null, value: "no data" }
        : { pass: t.ret12m >= marketCut && t.ret12m >= (sectorCut.get(s.sector) ?? Infinity), value: `${pct(t.ret12m)} over 12 months` },
      chart: !t || t.sma200 == null || t.sma50 == null
        ? { pass: null, value: "no data" }
        : {
            pass: t.close > t.sma50 && t.close > t.sma200 && t.close >= t.high52 * (1 - R.nearHigh),
            value: `${pct(t.close / t.high52 - 1)} from 52-wk high, ${t.close > t.sma50 && t.close > t.sma200 ? "above" : "not above"} 50/200-day`,
          },
    };
    const vals = Object.values(checks);
    return {
      symbol: s.symbol,
      name: names[s.symbol] ?? s.symbol,
      sector: s.sector,
      passed: vals.filter((c) => c.pass === true).length,
      checked: vals.filter((c) => c.pass !== null).length,
      checks,
      growth3y: f?.growth3y ?? null,
    };
  }).sort((a, b) => b.passed - a.passed || (b.growth3y ?? -9) - (a.growth3y ?? -9));

  const filedDates = Object.values(funds).map((f) => f.updated).sort();
  return {
    rules: GROWTH_RULES,
    priceDay: day,
    fundamentals: { companies: Object.keys(funds).length, oldest: filedDates[0] ?? null, newest: filedDates[filedDates.length - 1] ?? null },
    rows,
  };
}
