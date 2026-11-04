import { NextResponse } from "next/server";
import { getMarketNews, isNewsFeed } from "@/lib/marketNews";

// Read-only: the latest ~100 headlines (Alpaca / Benzinga) for the Market
// News tab on /research. ?feed=research (default: stories about the research
// page's stocks and the index funds) or ?feed=all (the whole market).
// 3-minute Redis cache per feed (lib/marketNews.ts).
export async function GET(request: Request) {
  const feed = new URL(request.url).searchParams.get("feed") ?? "research";
  if (!isNewsFeed(feed)) return NextResponse.json({ error: "unknown feed" }, { status: 400 });
  try {
    return NextResponse.json(await getMarketNews(feed));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "News fetch failed" }, { status: 502 });
  }
}
