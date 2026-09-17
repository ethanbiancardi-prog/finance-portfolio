import { getRedis } from "@/lib/kv";
import type { SectorKey } from "@/lib/rotation";

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
