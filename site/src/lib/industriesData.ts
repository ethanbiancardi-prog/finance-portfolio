// Prices for the Industry Charts page (/industries): every stock in
// lib/sectors.ts plus SPY, for one period, as % returns from the period's
// starting close. One Alpaca call per period (free, batched 50 symbols at a
// time), cached in Redis for 10 minutes so page loads read the cache.

import { getCompanyNames } from "./companyNames";
import { type IndustryData, type PeriodKey } from "./industries";
import { getRedis, kvConfigured } from "./kv";
import { getDailyBars } from "./marketdata";
import { SECTOR_KEYS, SECTORS } from "./sectors";

const CACHE_VERSION = "v1"; // bump when the response shape changes
const TTL_SECONDS = 10 * 60;
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

async function compute(period: PeriodKey): Promise<IndustryData> {
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
  };
}

export async function getIndustryData(period: PeriodKey): Promise<IndustryData> {
  const key = `industries:${CACHE_VERSION}:${period}`;
  if (kvConfigured()) {
    try {
      const cached = await getRedis().get<IndustryData>(key);
      if (cached) return cached;
    } catch {
      // Cache read failed — fetch fresh this once.
    }
  }
  const data = await compute(period);
  if (kvConfigured()) await getRedis().set(key, data, { ex: TTL_SECONDS }).catch(() => {});
  return data;
}
