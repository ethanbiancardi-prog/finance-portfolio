import { NextResponse } from "next/server";
import { getNews } from "@/lib/news";

export async function GET(request: Request) {
  const symbol = (new URL(request.url).searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getNews(symbol));
  } catch (err) {
    const message = err instanceof Error ? err.message : "News fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
