// Feeds the Strategy Lab (lib/strategyLab.ts) real prices and caches the
// result. ~100 stocks x 10 years of daily closes is a few hundred thousand
// bars, so it's computed once a day by api/cron/daily and read from Redis on
// page load. If the cache is empty (first deploy, or Redis was flushed) the
// first visitor computes it; Alpaca's data API is free, so that costs time,
// not money.

import { getRedis, kvConfigured } from "./kv";
import { getDailyBars } from "./marketdata";
import { SECTOR_KEYS, SECTORS } from "./sectors";
import { buildTable, runLab, type LabResult } from "./strategyLab";

const CACHE_KEY = "strategy-lab:v2"; // bump when the engine changes, so old results are never served
const TTL_SECONDS = 60 * 60 * 26; // a day, plus slack so a late cron never leaves it empty
const HISTORY_START = "2016-01-01"; // as far back as Alpaca's free consolidated feed goes

// The same hand-picked ~100 household names the research page and the
// rotation strategy use. SPY is fetched separately as the benchmark.
export function labUniverse(): string[] {
  return [...new Set(SECTOR_KEYS.flatMap((k) => SECTORS[k].tickers))];
}

export async function computeLab(): Promise<LabResult> {
  const universe = labUniverse();
  const bars = await getDailyBars(["SPY", ...universe], 0, {
    start: HISTORY_START,
    feed: "sip",
    adjustment: "all", // dividends included, so buy-and-hold gets credit for them
  });
  return runLab(buildTable(bars), universe.filter((s) => bars.has(s)));
}

export async function refreshLab(): Promise<LabResult> {
  const result = await computeLab();
  if (kvConfigured()) await getRedis().set(CACHE_KEY, result, { ex: TTL_SECONDS });
  return result;
}

export async function getLab(): Promise<LabResult> {
  if (kvConfigured()) {
    try {
      const cached = await getRedis().get<LabResult>(CACHE_KEY);
      if (cached) return cached;
    } catch {
      // Cache read failed — compute it this once.
    }
  }
  return refreshLab();
}
