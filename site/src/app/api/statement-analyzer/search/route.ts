import { NextResponse } from "next/server";
import { searchCompanies } from "@/lib/edgar";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ matches: await searchCompanies(q) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
