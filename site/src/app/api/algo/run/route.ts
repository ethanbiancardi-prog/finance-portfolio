import { NextResponse } from "next/server";
import { runAlgoPortfolios } from "@/lib/algoPortfolios";

// Manual trigger for the algo portfolios (lib/algoPortfolios.ts), for
// testing. ?dryRun=1 shows the decisions at current prices and trades
// nothing; without it, one live round runs now (market hours only).
// Secret-gated like the other trading routes. The scheduled 15-minute run
// comes through /api/signal-trader/run.
export const maxDuration = 120;

export async function GET(request: Request) {
  const allowed = [process.env.SIGNAL_TRADER_SECRET, process.env.CRON_SECRET]
    .filter((s): s is string => !!s)
    .map((s) => `Bearer ${s}`);
  if (!allowed.includes(request.headers.get("authorization") ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  try {
    return NextResponse.json(await runAlgoPortfolios({ dryRun }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
