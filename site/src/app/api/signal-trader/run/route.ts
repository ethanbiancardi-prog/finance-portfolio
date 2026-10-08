import { NextResponse } from "next/server";
import { runAlgoPortfolios } from "@/lib/algoPortfolios";
import { runSignalTrader } from "@/lib/signalTrader";

// Executes trades, so it's secret-gated like the other trading routes.
// Called every 15 minutes on weekdays by cron-job.org and by
// .github/workflows/signal-trader.yml, because both Vercel crons are taken.
// Each call runs:
//   - the Signal Trader on the showcase account (lib/signalTrader.ts), and
//   - the algo portfolios (lib/algoPortfolios.ts), which only act once a
//     day in the 3:40-3:58pm window and return straight away otherwise.
// The two are independent: one failing never stops the other.
// ?dryRun=1 reports what the Signal Trader would do and trades nothing
// (the algo portfolios have their own dry run at /api/algo/run).
//
// Two secrets work: SIGNAL_TRADER_SECRET, which unlocks only the trading
// routes and is the one given to cron-job.org, and CRON_SECRET (GitHub Actions).
export const maxDuration = 120;

export async function GET(request: Request) {
  const allowed = [process.env.SIGNAL_TRADER_SECRET, process.env.CRON_SECRET]
    .filter((s): s is string => !!s)
    .map((s) => `Bearer ${s}`);
  if (!allowed.includes(request.headers.get("authorization") ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const [signal, algo] = await Promise.allSettled([
    runSignalTrader({ dryRun }),
    dryRun ? Promise.resolve(null) : runAlgoPortfolios(),
  ]);
  const algoResult =
    algo.status === "fulfilled" ? algo.value : { error: algo.reason instanceof Error ? algo.reason.message : String(algo.reason) };
  if (signal.status === "rejected") {
    const error = signal.reason instanceof Error ? signal.reason.message : String(signal.reason);
    return NextResponse.json({ error, algo: algoResult }, { status: 500 });
  }
  return NextResponse.json({ ...signal.value, algo: algoResult });
}
