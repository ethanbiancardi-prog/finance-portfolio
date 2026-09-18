import { NextResponse } from "next/server";
import { getRegime } from "@/lib/rotation";
import { runRebalance } from "@/lib/rotationRun";
import { getLastRebalance } from "@/lib/rotationStore";

// Daily circuit-breaker check, run by Vercel Cron after each weekday close.
// The monthly rebalance already applies the regime rule, but a crash on the
// 3rd would otherwise ride in 3x ETFs until the 1st. This compares today's
// regime with the one recorded at the last rebalance and, only if it has
// flipped, runs a full rebalance right away (which sells the leveraged
// sleeve and halves momentum on a flip to risk-off, or re-deploys on a flip
// back). Any other day it does nothing and places no orders.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [regime, last] = await Promise.all([getRegime(), getLastRebalance()]);
  const lastRiskOn = last?.regime?.riskOn;

  // No recorded regime (never rebalanced, or a pre-Sep-2026 record): leave it
  // to the monthly run rather than guess.
  if (lastRiskOn === undefined) {
    return NextResponse.json({ checkedAt: new Date().toISOString(), regime, action: "none", reason: "no regime on record yet" });
  }
  if (regime.riskOn === lastRiskOn) {
    return NextResponse.json({ checkedAt: new Date().toISOString(), regime, action: "none", reason: "regime unchanged" });
  }

  const result = await runRebalance("regime-change");
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    regime,
    action: "rebalanced",
    reason: `regime flipped to ${regime.riskOn ? "risk-on" : "risk-off"}`,
    result,
  });
}
