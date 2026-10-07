import { NextResponse } from "next/server";
import { runSignalTrader } from "@/lib/signalTrader";

// Executes trades on the showcase account (lib/signalTrader.ts), so it's
// secret-gated like the other trading routes. Called every 15 minutes on
// weekdays by cron-job.org and by .github/workflows/signal-trader.yml,
// because both Vercel crons are taken. ?dryRun=1 reports what it would do
// and trades nothing.
//
// Two secrets work: SIGNAL_TRADER_SECRET, which unlocks only this route and
// is the one given to cron-job.org, and CRON_SECRET (GitHub Actions).
export const maxDuration = 60;

export async function GET(request: Request) {
  const allowed = [process.env.SIGNAL_TRADER_SECRET, process.env.CRON_SECRET]
    .filter((s): s is string => !!s)
    .map((s) => `Bearer ${s}`);
  if (!allowed.includes(request.headers.get("authorization") ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  try {
    return NextResponse.json(await runSignalTrader({ dryRun }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
