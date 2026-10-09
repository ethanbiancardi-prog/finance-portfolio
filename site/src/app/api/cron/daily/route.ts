import { NextResponse } from "next/server";
import { runRegimeCheck } from "@/lib/regimeCheck";
import { refreshAiSignals } from "@/lib/signals/aiSignals";
import { refreshFinancialSignals } from "@/lib/signals/financial";
import { refreshInsiderSignals } from "@/lib/signals/insider";
import { refreshPoliticalSignals } from "@/lib/signals/political";
import { refreshPresidentialSignals } from "@/lib/signals/presidential";
import { refreshLab } from "@/lib/strategyLabData";
import { runStrategies } from "@/lib/strategyRunner";

// One weekday-evening cron for everything that runs daily: the strategy's
// circuit-breaker check, the Research Signals refreshes, the insider-buying
// refresh the Signal Trader scores from (lib/signals/insider.ts), users' paper
// portfolio strategies (lib/strategyRunner.ts), which rebalance at the close,
// and the Strategy Lab's backtests (lib/strategyLabData.ts). Vercel's free
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
  const [regime, political, legislation, geopolitics, financial, presidential, insider, strategies, lab] = await Promise.allSettled([
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
  });
}
