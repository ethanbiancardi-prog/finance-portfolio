import { Redis } from "@upstash/redis";
import type { SectorKey } from "@/lib/rotation";

// Provisioned via Vercel's "KV" storage product (Upstash-backed under the
// hood, but it injects KV_REST_API_URL/TOKEN rather than the
// UPSTASH_REDIS_REST_URL/TOKEN names Redis.fromEnv() looks for) — so we
// build the client explicitly instead of relying on fromEnv(). Lazy-
// initialized so importing this module doesn't crash at build/import time
// before the env vars are provisioned.
let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.KV_REST_API_URL ?? "",
      token: process.env.KV_REST_API_TOKEN ?? "",
    });
  }
  return redis;
}

const KEY = "rotation:last-rebalance";

export type RebalanceRecord = {
  month: string; // "2026-09"
  ranAt: string; // ISO timestamp
  // `name` is optional — records saved before names were tracked won't have
  // it; callers should fall back to `symbol` when reading it.
  positions: { symbol: string; sector: SectorKey; name?: string; qty: number; weight: number }[];
  sleeveDollars: number;
};

export async function getLastRebalance(): Promise<RebalanceRecord | null> {
  return (await getRedis().get<RebalanceRecord>(KEY)) ?? null;
}

export async function saveRebalance(record: RebalanceRecord): Promise<void> {
  await getRedis().set(KEY, record);
}
