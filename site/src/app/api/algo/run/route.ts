import { NextResponse } from "next/server";
import { runAlgoPortfolios } from "@/lib/algoPortfolios";

// Manual trigger for the algo portfolios (lib/algoPortfolios.ts), for
// testing. ?dryRun=1 shows today's decisions at current prices and trades
// nothing; without it, ?force=1 runs a live round outside the 3:45pm window
// (still at most once a day). Secret-gated like the other trading routes.
// The scheduled run comes through /api/signal-trader/run.
export const maxDuration = 120;

export async function GET(request: Request) {
  const allowed = [process.env.SIGNAL_TRADER_SECRET, process.env.CRON_SECRET]
    .filter((s): s is string => !!s)
    .map((s) => `Bearer ${s}`);
  if (!allowed.includes(request.headers.get("authorization") ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  try {
    return NextResponse.json(
      await runAlgoPortfolios({ dryRun: params.get("dryRun") === "1", force: params.get("force") === "1" }),
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
