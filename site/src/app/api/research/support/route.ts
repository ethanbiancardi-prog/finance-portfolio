import { NextResponse } from "next/server";
import { alpacaData } from "@/lib/alpaca";
import { getLatestPrices } from "@/lib/marketdata";
import { findSupportLevels, type PriceBar } from "@/lib/supportLevels";

// Read-only: one stock's support levels for the Search tab on /research.
//   GET /api/research/support?symbol=NVDA
// Three years of daily bars (consolidated "sip" feed, split-adjusted so the
// prices match the chart) plus the latest trade as "today's price". The math
// is in lib/supportLevels.ts. Free Alpaca data, cached 10 minutes at the CDN.
export const maxDuration = 30;

export async function GET(request: Request) {
  const symbol = (new URL(request.url).searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(symbol)) return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });

  try {
    // The free plan can't read the last 15 minutes of SIP data, so stop short.
    const end = new Date(Date.now() - 20 * 60_000);
    const start = new Date(end.getTime() - 3 * 366 * 86_400_000);
    const bars: PriceBar[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        timeframe: "1Day",
        start: start.toISOString().slice(0, 10),
        end: end.toISOString(),
        feed: "sip",
        adjustment: "split",
        limit: "10000",
        ...(pageToken ? { page_token: pageToken } : {}),
      });
      const page = await alpacaData(`/stocks/${encodeURIComponent(symbol)}/bars?${params}`);
      for (const b of page.bars ?? []) bars.push({ t: b.t, h: b.h, l: b.l, c: b.c });
      pageToken = page.next_page_token ?? undefined;
    } while (pageToken);

    if (bars.length < 20) return NextResponse.json({ error: "Not enough price history" }, { status: 404 });

    // Today's price: the latest trade, or the last daily close if none.
    const latest = (await getLatestPrices([symbol]).catch(() => new Map())).get(symbol);
    const price = latest?.price ?? bars[bars.length - 1].c;
    const asOf = latest?.asOf ?? bars[bars.length - 1].t;

    const result = findSupportLevels(bars, price);
    return NextResponse.json(
      { symbol, price, asOf, historyFrom: bars[0].t.slice(0, 10), ...result },
      { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=3600" } },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
