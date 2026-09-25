import { NextResponse } from "next/server";
import { isMarketOpen } from "@/lib/alpaca";
import { getQuote } from "@/lib/marketdata";

// Latest price for the research page. `marketOpen` tells the page whether
// to keep polling for live updates.
export async function GET(request: Request) {
  const symbol = (new URL(request.url).searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }
  try {
    const [quote, marketOpen] = await Promise.all([getQuote(symbol), isMarketOpen().catch(() => false)]);
    return NextResponse.json(
      { ...quote, marketOpen },
      // Pages poll every 30s; a 15s shared cache lets many viewers of the
      // same ticker share one Alpaca call.
      { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=15" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Quote fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
