import { NextResponse } from "next/server";
import { isPeriodKey } from "@/lib/industries";
import { getIndustryData } from "@/lib/industriesData";

// Read-only: % returns for every sector-list stock plus SPY over one period,
// for the Industry Charts page. /api/industries?period=1m|3m|6m|ytd|1y|5y
// (default 1y). Served from a 10-minute Redis cache (lib/industriesData.ts).
export const maxDuration = 60;

export async function GET(request: Request) {
  const period = new URL(request.url).searchParams.get("period") ?? "1y";
  if (!isPeriodKey(period)) return NextResponse.json({ error: "unknown period" }, { status: 400 });
  try {
    return NextResponse.json(await getIndustryData(period));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
