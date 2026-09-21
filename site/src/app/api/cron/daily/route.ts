import { NextResponse } from "next/server";
import { runRegimeCheck } from "@/lib/regimeCheck";
import { refreshAiSignals } from "@/lib/signals/aiSignals";
import { refreshFinancialSignals } from "@/lib/signals/financial";
import { refreshPoliticalSignals } from "@/lib/signals/political";
import { refreshPresidentialSignals } from "@/lib/signals/presidential";

// One weekday-evening cron for everything that runs daily: the strategy's
// circuit-breaker check and the Research Signals refreshes. Vercel's free
// tier allows two cron jobs per project and the monthly rebalance is the
// other. Each job is isolated — a failure in one is reported, not
// propagated, and a failed refresh leaves the previous day's cache in place.
//
// The AI refreshes each run 1-2 minutes of web searching, so this needs
// the long function limit (Fluid Compute allows 300s on every plan).
export const maxDuration = 300;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [regime, political, legislation, geopolitics, financial, presidential] = await Promise.allSettled([
    runRegimeCheck(),
    refreshPoliticalSignals(),
    refreshAiSignals("legislation"),
    refreshAiSignals("geopolitics"),
    refreshFinancialSignals(),
    refreshPresidentialSignals(),
  ]);
  const report = (r: PromiseSettledResult<unknown>) =>
    r.status === "fulfilled" ? { ok: true, result: r.value } : { ok: false, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
  return NextResponse.json({
    ranAt: new Date().toISOString(),
    regimeCheck: report(regime),
    politicalSignals: report(political),
    legislationSignals: report(legislation),
    geopoliticsSignals: report(geopolitics),
    financialSignals: report(financial),
    presidentialSignals: report(presidential),
  });
}
