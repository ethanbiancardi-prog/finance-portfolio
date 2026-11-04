// Fills the Growth Stocks screen's company numbers (Redis hash growth:fund:v1)
// for every S&P 500 company at once, from the local ML cache
// (.ml-cache/sp500/fundamentals.json, refreshed by scripts/ml/fetch-fundamentals.ts),
// so the screen is complete on day one instead of after a week of daily
// slices. api/cron/daily keeps it current after that.
//
// Usage, from site/:  npx tsx --env-file=.env.local scripts/seed-growth.ts

import { readFileSync } from "node:fs";
import { fundRecord, type FundRecord } from "../src/lib/growthScreen";
import { getRedis } from "../src/lib/kv";
import type { FundamentalSnapshot } from "../src/lib/ml/fundamentals";
import sp500 from "../src/lib/ml/sp500.json";

async function main() {
  const cache: Record<string, FundamentalSnapshot[]> = JSON.parse(readFileSync(".ml-cache/sp500/fundamentals.json", "utf8"));
  const records: Record<string, FundRecord> = {};
  for (const { symbol } of sp500.stocks) {
    const snaps = cache[symbol];
    if (!snaps?.length || !("equity" in snaps[snaps.length - 1])) continue; // needs the Nov 2026 refresh (equity)
    const r = fundRecord(snaps);
    if (r) records[symbol] = r;
  }
  await getRedis().hset("growth:fund:v1", records);
  console.log(`Seeded ${Object.keys(records).length} of ${sp500.stocks.length} companies.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
