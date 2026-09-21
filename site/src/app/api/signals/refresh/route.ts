import { NextResponse } from "next/server";
import { refreshPoliticalSignals } from "@/lib/signals/political";

// Manual refresh, secret-gated (same secret as the crons) — for seeding
// and testing. The scheduled refresh lives in /api/cron/daily.
export const maxDuration = 60;

export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const batch = await refreshPoliticalSignals();
  return NextResponse.json({ generatedAt: batch.generatedAt, stats: batch.stats, tickers: batch.items.map((i) => i.ticker) });
}
