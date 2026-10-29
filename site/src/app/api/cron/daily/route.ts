import { NextResponse } from "next/server";
import { runRegimeCheck } from "@/lib/regimeCheck";
import { refreshAiSignals } from "@/lib/signals/aiSignals";
import { refreshFinancialSignals } from "@/lib/signals/financial";
import { refreshInsiderSignals } from "@/lib/signals/insider";
import { refreshPoliticalSignals } from "@/lib/signals/political";
import { refreshPresidentialSignals } from "@/lib/signals/presidential";
import { refreshLab } from "@/lib/strategyLabData";
import { runStrategies } from "@/lib/strategyRunner";
import { trackKalshiPredictions } from "@/lib/calibrationTracking";
import { refreshStudySlice } from "@/lib/kalshiStudy";
import { createAdminClient } from "@/lib/supabase/admin";

// One weekday-evening cron for everything that runs daily: the strategy's
// circuit-breaker check, the Research Signals refreshes, the insider-buying
// refresh the Signal Trader scores from (lib/signals/insider.ts), users' paper
// portfolio strategies (lib/strategyRunner.ts), which rebalance at the close,
// the Strategy Lab's backtests (lib/strategyLabData.ts), and the Calibration
// Tracker's Kalshi jobs: auto-resolving settled predictions and recording
// each open one's price (lib/calibrationTracking.ts), plus one weekday's
// fifth of the "Is Kalshi calibrated?" study (lib/kalshiStudy.ts). Vercel's free
// tier allows two cron jobs per project and the monthly rebalance is the
// other. Each job is isolated — a failure in one is reported, not
// propagated, and a failed refresh leaves the previous day's cache in place.
//
// The AI refreshes each run 1-2 minutes of web searching, so this needs
// the long function limit (Fluid Compute allows 300s on every plan).
export const maxDuration = 300;

export async function GET(request: Request) {
  // An unset secret would make the expected header "Bearer undefined".
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [regime, political, legislation, geopolitics, financial, presidential, insider, strategies, lab, calibration, kalshiStudy] = await Promise.allSettled([
    runRegimeCheck(),
    refreshPoliticalSignals(),
    refreshAiSignals("legislation"),
    refreshAiSignals("geopolitics"),
    refreshFinancialSignals(),
    refreshPresidentialSignals(),
    // Just the counts; the buys themselves live in Redis.
    refreshInsiderSignals().then((b) => b.stats),
    runStrategies(),
    // Just the date range in the report; the full result lives in Redis.
    refreshLab().then((r) => ({ start: r.start, end: r.end })),
    // Every user's open Kalshi predictions, so prices are recorded even on
    // days nobody opens the page. The server key reads across users; the
    // lock-in trigger still only lets an open prediction be resolved.
    (async () => {
      const admin = createAdminClient();
      if (!admin) throw new Error("SUPABASE_SECRET_KEY is not set");
      const { markets: _markets, ...counts } = await trackKalshiPredictions(admin);
      void _markets;
      return counts;
    })(),
    refreshStudySlice(),
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
    insiderSignals: report(insider),
    paperStrategies: report(strategies),
    strategyLab: report(lab),
    calibrationTracker: report(calibration),
    kalshiStudy: report(kalshiStudy),
  });
}
