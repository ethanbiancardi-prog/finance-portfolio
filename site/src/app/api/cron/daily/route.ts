import { NextResponse } from "next/server";
import { runRegimeCheck } from "@/lib/regimeCheck";
import { refreshPoliticalSignals } from "@/lib/signals/political";

// One weekday-evening cron for everything that runs daily: the strategy's
// circuit-breaker check and the Research Signals refresh. Vercel's free tier
// allows two cron jobs per project and the monthly rebalance is the other.
// Each job is isolated — a failure in one is reported, not propagated.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [regime, political] = await Promise.allSettled([runRegimeCheck(), refreshPoliticalSignals()]);
  const report = (r: PromiseSettledResult<unknown>) =>
    r.status === "fulfilled" ? { ok: true, result: r.value } : { ok: false, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
  return NextResponse.json({ ranAt: new Date().toISOString(), regimeCheck: report(regime), politicalSignals: report(political) });
}
