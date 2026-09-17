import { NextResponse } from "next/server";
import { resolveTickerEntries } from "@/lib/edgar";
import { isSectorKey, SECTORS } from "@/lib/sectors";

export async function GET(request: Request) {
  const category = new URL(request.url).searchParams.get("category") ?? "";
  if (!isSectorKey(category)) {
    return NextResponse.json({ error: "unknown category" }, { status: 400 });
  }

  const companies = await resolveTickerEntries([...SECTORS[category].tickers]);
  return NextResponse.json({ companies });
}
