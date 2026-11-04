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

// Every rebalance attempt, kept apart from the record above (which only
// changes when trades go through). Without it, a run that was blocked or
// crashed left no trace: from Oct to Nov 2026 every monthly run was blocked
// for lack of cash while the page still showed September as the latest.
const ATTEMPT_KEY = "rotation:last-attempt";
export type RebalanceAttempt = {
  at: string; // ISO timestamp
  month: string;
  trigger: RebalanceTrigger;
  outcome: "done" | "partial" | "blocked" | "error";
  reason?: string; // why it was blocked, failed or errored, in plain English
  placed: number;
  failed: number;
  // Recorded positions that were no longer in the account (bought out for
  // cash, delisted) and were dropped from the record before trading.
  dropped?: string[];
};

export async function getLastAttempt(): Promise<RebalanceAttempt | null> {
  return (await getRedis().get<RebalanceAttempt>(ATTEMPT_KEY)) ?? null;
}

export async function saveAttempt(attempt: RebalanceAttempt): Promise<void> {
  await getRedis().set(ATTEMPT_KEY, attempt);
}

export async function getLastRebalance(): Promise<RebalanceRecord | null> {
  return (await getRedis().get<RebalanceRecord>(KEY)) ?? null;
}

export async function saveRebalance(record: RebalanceRecord): Promise<void> {
  await getRedis().set(KEY, record);
}
