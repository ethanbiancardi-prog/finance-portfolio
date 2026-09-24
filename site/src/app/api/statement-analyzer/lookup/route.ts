import { NextResponse } from "next/server";
import { computeRatios, getCompanyFactsWithHistory, resolveTicker } from "@/lib/edgar";

export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const company = await resolveTicker(ticker);
  if (!company) {
    return NextResponse.json({ error: `No SEC filer found for ${ticker}` }, { status: 404 });
  }

  // Reaches back to the predecessor entity when the ticker now points at a
  // successor registrant with no annual report yet (see edgar.ts).
  const { facts, filedUnder } = await getCompanyFactsWithHistory(company);
  const dashboard = computeRatios(facts);

  return NextResponse.json({ company, filedUnder, dashboard });
}
