// Prices for the Industry Charts tab on /research: every stock in
// lib/sectors.ts plus SPY, for one period, as % returns from the period's
// starting close. Two layers, both free Alpaca data cached in Redis:
//   - history: daily closes from the consolidated (SIP) feed, which on the
//     free plan runs ~15 minutes behind. Heavy (up to 5 years x 95 stocks),
//     so cached 10 minutes per period.
//   - live: while the market is open, the latest trade on IEX for every
//     stock, which is real-time. One light call, cached 1 minute, and it
//     replaces (or adds) today's point on every line.

import { getCompanyNames } from "./companyNames";
import { type IndustryData, type PeriodKey } from "./industries";
import { getRedis, kvConfigured } from "./kv";
import { isMarketOpen } from "./alpaca";
import { getDailyBars, getLatestPrices } from "./marketdata";
import { SECTOR_KEYS, SECTORS } from "./sectors";

const CACHE_VERSION = "v2"; // bump when the cached shape changes
const TTL_SECONDS = 10 * 60;
const LIVE_TTL_SECONDS = 60;
const LIVE_KEY = `industries:live:${CACHE_VERSION}`;

// The history layer also keeps each stock's starting close, so a live price
// can be turned into a return the same way as the daily ones.
type History = Omit<IndustryData, "live"> & { bases: Record<string, number> };
type Live = { open: boolean; day: string; asOf: string | null; prices: Record<string, number> };

// A timestamp's calendar day in New York, where the market keeps its hours.
const nyDay = (t: Date | string) => new Date(t).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const MAX_POINTS = 150; // per line; more only slows the chart without showing more

// The first day of the period, as YYYY-MM-DD. The period's starting price is
// the last close on or before this day.
function periodStart(period: PeriodKey, now: Date): string {
  const d = new Date(now);
  switch (period) {
    case "1m": d.setUTCMonth(d.getUTCMonth() - 1); break;
    case "3m": d.setUTCMonth(d.getUTCMonth() - 3); break;
    case "6m": d.setUTCMonth(d.getUTCMonth() - 6); break;
    case "ytd": return `${now.getUTCFullYear() - 1}-12-31`;
    case "1y": d.setUTCFullYear(d.getUTCFullYear() - 1); break;
    case "5y": d.setUTCFullYear(d.getUTCFullYear() - 5); break;
  }
  return d.toISOString().slice(0, 10);
}

export function industryUniverse(): string[] {
  return [...new Set(SECTOR_KEYS.flatMap((k) => SECTORS[k].tickers))];
}

async function computeHistory(period: PeriodKey): Promise<History> {
  const now = new Date();
  const start = periodStart(period, now);
  // Fetch from two weeks earlier, so there is always a close on or before
  // the start day (weekends, holidays) to measure from.
  const fetchFrom = new Date(`${start}T00:00:00Z`);
  fetchFrom.setUTCDate(fetchFrom.getUTCDate() - 14);

  const symbols = ["SPY", ...industryUniverse()];
  const [bars, names] = await Promise.all([
    getDailyBars(symbols, 0, {
      start: fetchFrom.toISOString().slice(0, 10),
      // The consolidated feed covers every exchange and goes back far enough
      // for 5Y; on the free plan it runs ~15 minutes behind, so today's bar
      // is the day so far, up to about 20 minutes ago.
      feed: "sip",
      // Dividends included, so a high-yield stock isn't shown losing ground
      // every time it pays one out.
      adjustment: "all",
    }),
    getCompanyNames(symbols).catch(() => ({}) as Record<string, string>),
  ]);

  // SPY trades every market day, so its dates are the calendar.
  const day = (t: string) => t.slice(0, 10);
  const calendar = (bars.get("SPY") ?? []).map((b) => day(b.t));
  if (calendar.length === 0) throw new Error("No market data came back");
  let base = 0;
  for (let i = 0; i < calendar.length; i++) if (calendar[i] <= start) base = i;
  const allDates = calendar.slice(base);

  // Thin long periods to MAX_POINTS, always keeping the first and last day.
  const step = Math.max(1, Math.ceil(allDates.length / MAX_POINTS));
  const keep = allDates
    .map((_, i) => i)
    .filter((i) => i === 0 || (allDates.length - 1 - i) % step === 0);
  const dates = keep.map((i) => allDates[i]);

  const series: IndustryData["series"] = {};
  const bases: History["bases"] = {};
  for (const symbol of symbols) {
    const closes = new Map((bars.get(symbol) ?? []).map((b) => [day(b.t), b.c]));
    // Starting price: the close on the base day, or the first close after it
    // for a stock that wasn't trading yet (e.g. listed mid-period).
    let first: number | undefined;
    for (const d of allDates) {
      first = closes.get(d);
      if (first) break;
    }
    if (!first) continue;
    bases[symbol] = first;
    // Return = today's close / starting close - 1, rounded to 0.01% to keep
    // the response small.
    series[symbol] = dates.map((d) => {
      const c = closes.get(d);
      return c ? Math.round((c / first - 1) * 10_000) / 10_000 : null;
    });
  }

  return {
    period,
    dates,
    series,
    names,
    asOf: now.toISOString(),
    lastBar: calendar[calendar.length - 1],
    bases,
  };
}

// Latest IEX trade for every stock, only while the market is open, and only
// trades from today (a stock that hasn't traded on IEX yet today keeps its
// last consolidated price rather than showing yesterday's trade as today's).
async function computeLive(): Promise<Live> {
  const today = nyDay(new Date());
  if (!(await isMarketOpen())) return { open: false, day: today, asOf: null, prices: {} };
  const latest = await getLatestPrices(["SPY", ...industryUniverse()]);
  const prices: Live["prices"] = {};
  let asOf: string | null = null;
  for (const [symbol, { price, asOf: t }] of latest) {
    if (nyDay(t) !== today) continue;
    prices[symbol] = price;
    if (!asOf || t > asOf) asOf = t;
  }
  return { open: true, day: today, asOf, prices };
}

async function cached<T>(key: string, ttl: number, make: () => Promise<T>): Promise<T> {
  if (kvConfigured()) {
    try {
      const hit = await getRedis().get<T>(key);
      if (hit) return hit;
    } catch {
      // Cache read failed — compute fresh this once.
    }
  }
  const value = await make();
  if (kvConfigured()) await getRedis().set(key, value, { ex: ttl }).catch(() => {});
  return value;
}

// Today's point from the live prices: it overwrites the delayed one if the
// history already has today, or is added on the end if it doesn't yet.
function withLive(h: History, live: Live): IndustryData {
  const { bases, ...data } = h;
  if (!live.open || !live.asOf) return { ...data, live: null };
  const n = data.dates.length;
  const append = data.dates[n - 1] !== live.day;
  const series: IndustryData["series"] = {};
  for (const [symbol, values] of Object.entries(data.series)) {
    const price = live.prices[symbol];
    const now = price && bases[symbol] ? Math.round((price / bases[symbol] - 1) * 10_000) / 10_000 : null;
    series[symbol] = append ? [...values, now] : [...values.slice(0, -1), now ?? values[n - 1]];
  }
  return {
    ...data,
    dates: append ? [...data.dates, live.day] : data.dates,
    lastBar: live.day,
    series,
    live: { asOf: live.asOf },
  };
}

export async function getIndustryData(period: PeriodKey): Promise<IndustryData> {
  const [history, live] = await Promise.all([
    cached(`industries:${CACHE_VERSION}:${period}`, TTL_SECONDS, () => computeHistory(period)),
    // A failed live call just means delayed prices, never a broken chart.
    cached(LIVE_KEY, LIVE_TTL_SECONDS, computeLive).catch(() => null),
  ]);
  return withLive(history, live ?? { open: false, day: "", asOf: null, prices: {} });
}
