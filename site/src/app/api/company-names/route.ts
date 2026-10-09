import { NextResponse } from "next/server";
import { getCompanyNames } from "@/lib/companyNames";

// Read-only: short company names for up to 200 tickers, e.g.
// /api/company-names?symbols=INTC,SPY -> { "INTC": "Intel", "SPY": "State Street SPDR S&P 500 ETF Trust" }.
// Names come from cached Alpaca/SEC lists (lib/companyNames.ts), never a paid
// API, and change rarely, so the CDN keeps each answer for a day.
const SYMBOL = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export async function GET(request: Request) {
  const symbols = (new URL(request.url).searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SYMBOL.test(s))
    .slice(0, 200);
  if (!symbols.length) return NextResponse.json({});
  try {
    return NextResponse.json(await getCompanyNames(symbols), {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch {
    // Names are a nicety: without them the pages just show tickers.
    return NextResponse.json({});
  }
}
