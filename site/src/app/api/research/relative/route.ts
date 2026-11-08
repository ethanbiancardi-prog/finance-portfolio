import { NextResponse } from "next/server";
import { getGrowthScreen } from "@/lib/growthScreen";

// Read-only: one stock's Relative Price Score (1-99, vs the S&P 500 and vs
// its own sector; lib/growthScreen.ts) for the Search tab on /research.
// /api/research/relative?symbol=NVDA. Uses the same daily-cached prices as
// the Growth Stocks screen, so it adds no new data calls.
export const maxDuration = 60;

export async function GET(request: Request) {
  const symbol = (new URL(request.url).searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(symbol)) return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  try {
    const screen = await getGrowthScreen();
    const row = screen.rows.find((r) => r.symbol === symbol || r.symbol === symbol.replace("-", "."));
    const body = row
      ? { symbol, inSp500: true, score: row.score, sectorScore: row.sectorScore, sector: row.sector, priceDay: screen.priceDay }
      : { symbol, inSp500: false, priceDay: screen.priceDay };
    return NextResponse.json(body, { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=3600" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
