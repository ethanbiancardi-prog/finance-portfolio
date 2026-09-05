import { NextResponse } from "next/server";
import { alpaca } from "@/lib/alpaca";
import { computeRotationPlan } from "@/lib/rotation";
import { getLastRebalance } from "@/lib/rotationStore";

// Read-only: recomputes this month's picks live and reports the last
// executed rebalance. Safe to call anytime — places no orders.
export async function GET() {
  const account = await alpaca("/account");
  const plan = await computeRotationPlan(Number(account.equity));
  const lastRebalance = await getLastRebalance();

  return NextResponse.json({
    asOf: new Date().toISOString(),
    sleeveDollars: plan.sleeveDollars,
    picks: plan.picks,
    lastRebalance,
  });
}
