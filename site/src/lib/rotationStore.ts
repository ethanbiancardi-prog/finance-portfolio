import { getRedis } from "@/lib/kv";
import type { Regime, SectorKey } from "@/lib/rotation";

const KEY = "rotation:last-rebalance";

// Why a rebalance ran: the 1st-of-month cron, the dashboard button, or the
// daily check catching SPY crossing its 200-day.
export type RebalanceTrigger = "monthly" | "manual" | "regime-change";

export type RebalanceRecord = {
  month: string; // "2026-09"
  ranAt: string; // ISO timestamp
  // Optional: records saved before Sep 18 2026 don't carry these.
  trigger?: RebalanceTrigger;
  regime?: Regime;
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
