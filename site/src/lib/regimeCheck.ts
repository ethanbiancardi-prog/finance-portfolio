import { getRegime } from "@/lib/rotation";
import { runRebalance } from "@/lib/rotationRun";
import { getLastRebalance } from "@/lib/rotationStore";

// Daily circuit-breaker check. The monthly rebalance already applies the
// regime rule, but a crash on the 3rd would otherwise ride in 3x ETFs until
// the 1st. Compares today's regime with the one recorded at the last
// rebalance and, only if it has flipped, runs a full rebalance right away.
// Any other day it does nothing and places no orders.
export async function runRegimeCheck() {
  const [regime, last] = await Promise.all([getRegime(), getLastRebalance()]);
  const lastRiskOn = last?.regime?.riskOn;
  const checkedAt = new Date().toISOString();

  // No recorded regime (never rebalanced, or a pre-Sep-2026 record): leave it
  // to the monthly run rather than guess.
  if (lastRiskOn === undefined) return { checkedAt, regime, action: "none" as const, reason: "no regime on record yet" };
  if (regime.riskOn === lastRiskOn) return { checkedAt, regime, action: "none" as const, reason: "regime unchanged" };

  const result = await runRebalance("regime-change");
  return { checkedAt, regime, action: "rebalanced" as const, reason: `regime flipped to ${regime.riskOn ? "risk-on" : "risk-off"}`, result };
}
