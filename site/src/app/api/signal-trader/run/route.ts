import { NextResponse } from "next/server";
import { runSignalTrader } from "@/lib/signalTrader";

// Executes trades on the showcase account (lib/signalTrader.ts), so it's
// gated behind CRON_SECRET like the other trading routes. Called every 15
// minutes on weekdays by .github/workflows/signal-trader.yml, because both
// Vercel crons are taken. ?dryRun=1 reports what it would do and trades nothing.
export const maxDuration = 60;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  try {
    return NextResponse.json(await runSignalTrader({ dryRun }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
