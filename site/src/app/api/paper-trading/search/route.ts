import { NextResponse } from "next/server";
import { searchAssets } from "@/lib/alpaca";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ matches: await searchAssets(q) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
