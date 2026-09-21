import { NextResponse } from "next/server";
import { computeDcfPrefill } from "@/lib/dcfPrefill";
import { getCompanyFacts, resolveTicker } from "@/lib/edgar";
import { getQuote } from "@/lib/marketdata";

// DCF assumptions derived from a company's latest 10-K, plus the live share
// price, with the arithmetic behind each one. Read-only; no AI involved —
// every number is computed from tagged filing data so it can be checked.
export async function GET(request: Request) {
  const ticker = (new URL(request.url).searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }
  const company = await resolveTicker(ticker);
  if (!company) {
    return NextResponse.json({ error: `No SEC filer found for ${ticker}` }, { status: 404 });
  }

  const [facts, quote] = await Promise.all([
    getCompanyFacts(company.cik),
    getQuote(ticker).catch(() => null), // market closed / no IEX trade is not an error here
  ]);
  const prefill = computeDcfPrefill(facts);
  if (!prefill) {
    return NextResponse.json({ error: `No annual revenue on file for ${ticker}` }, { status: 422 });
  }

  return NextResponse.json({
    company,
    ...prefill,
    currentPrice: quote ? quote.price.toFixed(2) : "",
    priceAsOf: quote?.asOf ?? null,
  });
}
