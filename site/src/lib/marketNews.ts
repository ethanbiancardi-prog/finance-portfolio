// Market-wide headlines for the Market News tab on /research: the newest
// stories across the whole market from Alpaca's news API (Benzinga's feed,
// free with the Alpaca keys already set up), not tied to one ticker.
//
// Cached in Redis for 3 minutes, so however many people have the tab open,
// Alpaca sees at most one request every 3 minutes (rule 2: never call an
// external API on every page load).
import type { AlpacaNewsItem } from "./alpaca";
import { getRedis, kvConfigured } from "./kv";
import { RESEARCH_UNIVERSE } from "./researchUniverse";

// Two feeds. "research": stories tagged with a stock on the research page or
// one of the big index funds (market-wide stories get tagged SPY/QQQ). "all":
// everything, which is mostly small-cap press releases and earnings-call
// transcripts (100 stories is about half an hour of it).
export type NewsFeed = "research" | "all";
export const isNewsFeed = (f: string): f is NewsFeed => f === "research" || f === "all";
const INDEX_FUNDS = ["SPY", "QQQ", "DIA", "IWM"];

export type MarketNewsItem = {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  symbols: string[]; // tickers Benzinga tagged the story with
};
export type MarketNews = { items: MarketNewsItem[]; fetchedAt: string };

const CACHE_KEY = (feed: NewsFeed) => `market-news:v1:${feed}`;
const TTL_SECONDS = 3 * 60;
const PAGES = 2; // Alpaca caps a page at 50, so two pages = the latest 100 stories

async function fetchFromAlpaca(feed: NewsFeed): Promise<MarketNews> {
  const symbols: Record<string, string> = feed === "research" ? { symbols: [...INDEX_FUNDS, ...RESEARCH_UNIVERSE].join(",") } : {};
  const items: MarketNewsItem[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < PAGES; page++) {
    const params = new URLSearchParams({ ...symbols, limit: "50", sort: "desc", ...(pageToken ? { page_token: pageToken } : {}) });
    const res = await fetch(`https://data.alpaca.markets/v1beta1/news?${params}`, {
      headers: {
        "APCA-API-KEY-ID": process.env.APCA_API_KEY_ID ?? "",
        "APCA-API-SECRET-KEY": process.env.APCA_API_SECRET_KEY ?? "",
      },
      cache: "no-store", // Redis is the cache
    });
    if (!res.ok) throw new Error(`Alpaca news failed (${res.status})`);
    const data: { news?: AlpacaNewsItem[]; next_page_token?: string | null } = await res.json();
    for (const n of data.news ?? []) {
      items.push({
        id: String(n.id),
        headline: n.headline,
        // Benzinga summaries sometimes carry HTML tags; headlines don't.
        summary: (n.summary ?? "").replace(/<[^>]+>/g, "").trim(),
        source: n.source,
        url: n.url,
        publishedAt: n.created_at,
        symbols: n.symbols ?? [],
      });
    }
    pageToken = data.next_page_token ?? undefined;
    if (!pageToken) break;
  }
  return { items, fetchedAt: new Date().toISOString() };
}

export async function getMarketNews(feed: NewsFeed): Promise<MarketNews> {
  if (kvConfigured()) {
    try {
      const hit = await getRedis().get<MarketNews>(CACHE_KEY(feed));
      if (hit) return hit;
    } catch {
      // Cache read failed: fetch fresh this once.
    }
  }
  const fresh = await fetchFromAlpaca(feed);
  if (kvConfigured()) await getRedis().set(CACHE_KEY(feed), fresh, { ex: TTL_SECONDS }).catch(() => {});
  return fresh;
}
