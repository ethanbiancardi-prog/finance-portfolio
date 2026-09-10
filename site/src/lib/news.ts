import { alpacaNews } from "./alpaca";

export type NewsItem = {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
};

// Yahoo Finance has no official API; its per-ticker RSS feed is the one
// sanctioned surface. It aggregates many outlets (Barron's, TheStreet,
// Reuters...) so it complements Alpaca's Benzinga-only feed well.
async function yahooRss(symbol: string): Promise<NewsItem[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (finance-portfolio)" },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Yahoo RSS failed (${res.status})`);
  const xml = await res.text();

  const field = (item: string, tag: string) => {
    const m = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return m ? decode(m[1].trim()) : "";
  };
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const link = field(item, "link");
    return {
      id: field(item, "guid") || link,
      headline: field(item, "title"),
      summary: field(item, "description"),
      source: sourceFromUrl(link),
      url: link,
      publishedAt: new Date(field(item, "pubDate")).toISOString(),
    };
  });
}

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, "");
}

function sourceFromUrl(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.endsWith("yahoo.com")) return "yahoo";
    return host.split(".").slice(0, -1).join(".") || host;
  } catch {
    return "yahoo";
  }
}

// Merge both feeds, drop near-duplicate headlines, newest first. Either
// source failing on its own is tolerated; only both failing is an error.
export async function getNews(symbol: string, limit = 20): Promise<{ items: NewsItem[]; sources: string[] }> {
  const [yahoo, alpaca] = await Promise.allSettled([
    yahooRss(symbol),
    alpacaNews(symbol, limit).then((rows) =>
      rows.map((n) => ({
        id: `alpaca-${n.id}`,
        headline: decode(n.headline),
        summary: decode(n.summary),
        source: n.source,
        url: n.url,
        publishedAt: n.created_at,
      })),
    ),
  ]);
  const ok = [yahoo, alpaca].filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<NewsItem[]>[];
  if (ok.length === 0) throw new Error("Both news sources failed");

  const seen = new Set<string>();
  const items = ok
    .flatMap((r) => r.value)
    .filter((n) => n.headline && n.url)
    .filter((n) => {
      const key = n.headline.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit);

  const sources = [yahoo.status === "fulfilled" ? "yahoo" : null, alpaca.status === "fulfilled" ? "alpaca" : null].filter(
    Boolean,
  ) as string[];
  return { items, sources };
}
