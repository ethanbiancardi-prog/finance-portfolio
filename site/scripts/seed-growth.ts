// Fills the Growth Stocks screen's company numbers (Redis hash growth:fund:v1)
// for every stock on the list (src/lib/growthUniverse.json) at once, so the
// screen is complete on day one instead of after two weeks of daily slices.
// api/cron/daily keeps it current after that.
//
//   S&P 500 members   from the local ML cache (.ml-cache/sp500/fundamentals.json,
//                     refreshed by scripts/ml/fetch-fundamentals.ts): no SEC calls
//   everyone else     from SEC, slowly (SEC allows ~10 requests a second), skipping
//                     companies already in Redis, so a rerun resumes
//
// Usage, from site/:  npx tsx --env-file=.env.local scripts/seed-growth.ts   (~15 minutes the first time)

import { existsSync, readFileSync } from "node:fs";
import { getCompanyFactsWithHistory } from "../src/lib/edgar";
import { fundRecord, type FundRecord } from "../src/lib/growthScreen";
import universe from "../src/lib/growthUniverse.json";
import { getRedis } from "../src/lib/kv";
import { fundamentalSnapshots, type FundamentalSnapshot } from "../src/lib/ml/fundamentals";

const KEY = "growth:fund:v1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const redis = getRedis();
  const have = new Set(Object.keys((await redis.hgetall<Record<string, FundRecord>>(KEY)) ?? {}));
  const stocks = universe.stocks as { symbol: string; cik: number; name: string }[];

  // 1. From the local cache, no SEC calls.
  const cacheFile = ".ml-cache/sp500/fundamentals.json";
  const cache: Record<string, FundamentalSnapshot[]> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
  const fromCache: Record<string, FundRecord> = {};
  for (const s of stocks) {
    const snaps = cache[s.symbol];
    if (have.has(s.symbol) || !snaps?.length || !("equity" in snaps[snaps.length - 1])) continue;
    const r = fundRecord(snaps);
    if (r) fromCache[s.symbol] = r;
  }
  if (Object.keys(fromCache).length) await redis.hset(KEY, fromCache);
  for (const k of Object.keys(fromCache)) have.add(k);
  console.log(`From the local cache: ${Object.keys(fromCache).length}. Already in Redis: ${have.size}.`);

  // 2. The rest from SEC, two at a time, saved every 50.
  const todo = stocks.filter((s) => !have.has(s.symbol) && s.cik);
  let batch: Record<string, FundRecord> = {};
  let done = 0;
  let failed = 0;
  for (let i = 0; i < todo.length; i += 2) {
    await Promise.all(
      todo.slice(i, i + 2).map(async (s) => {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const { facts } = await getCompanyFactsWithHistory({ cik: s.cik, ticker: s.symbol, title: s.name });
            const r = fundRecord(fundamentalSnapshots(facts));
            if (r) batch[s.symbol] = r;
            return;
          } catch {
            await sleep(2000 * attempt);
          }
        }
        failed++;
      }),
    );
    await sleep(300);
    done = Math.min(i + 2, todo.length);
    if (Object.keys(batch).length >= 50 || done === todo.length) {
      if (Object.keys(batch).length) await redis.hset(KEY, batch);
      batch = {};
      console.log(`  SEC ${done}/${todo.length} (${failed} failed)`);
    }
  }
  console.log(`Done. ${failed} companies couldn't be read (often non-US filers without 10-Ks).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
