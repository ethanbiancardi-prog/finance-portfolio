import { NextResponse } from "next/server";
import { computeRatios, getCompanyFacts, resolveTicker } from "@/lib/edgar";

export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const company = await resolveTicker(ticker);
  if (!company) {
    return NextResponse.json({ error: `No SEC filer found for ${ticker}` }, { status: 404 });
  }

  const facts = await getCompanyFacts(company.cik);
  const dashboard = computeRatios(facts);

  return NextResponse.json({ company, dashboard });
}
