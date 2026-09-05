import { Redis } from "@upstash/redis";
import type { SectorKey } from "@/lib/rotation";

// Lazy-initialized so importing this module doesn't crash at build/import
// time before UPSTASH_REDIS_REST_URL/TOKEN are provisioned.
let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) redis = Redis.fromEnv();
  return redis;
}

const KEY = "rotation:last-rebalance";

export type RebalanceRecord = {
  month: string; // "2026-09"
  ranAt: string; // ISO timestamp
  positions: { symbol: string; sector: SectorKey; qty: number; weight: number }[];
  sleeveDollars: number;
};

export async function getLastRebalance(): Promise<RebalanceRecord | null> {
  return (await getRedis().get<RebalanceRecord>(KEY)) ?? null;
}

export async function saveRebalance(record: RebalanceRecord): Promise<void> {
  await getRedis().set(KEY, record);
}
