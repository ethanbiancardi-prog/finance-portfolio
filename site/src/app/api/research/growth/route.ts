import { NextResponse } from "next/server";
import { getGrowthScreen } from "@/lib/growthScreen";

// Read-only: the Growth Stocks screen on /research (lib/growthScreen.ts).
// Company numbers come from Redis (refreshed weekly by api/cron/daily);
// chart numbers are computed once per trading day and cached. The first call
// of the day reads a year of prices for ~500 stocks, hence the longer limit.
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await getGrowthScreen(), { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=3600" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
