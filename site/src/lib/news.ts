import { alpacaNews } from "./alpaca";
import { resolveTicker } from "./edgar";

export type NewsItem = {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  // Alpaca's ticker tags for the story; empty for Yahoo items.
  symbols?: string[];
};

// --- Relevance -----------------------------------------------------------
// Both feeds are keyed by ticker but still return general market stories
// ("3 stocks to watch", "Dow futures...") that merely tag the ticker. A
// headline is kept only if it is actually about the company: either Alpaca
// tagged it with this ticker alone, or the headline itself names the company
// or ticker within its first few words (so "SpaceX launches ... including
// Google's experiment" isn't a Google story) and isn't a list of several
// companies ("Bulls and Bears: Alphabet, Micron, Nike").
const SUBJECT_WORDS = 8;

// Legal-form words that never appear in how a headline names a company.
const NAME_SUFFIXES = new Set([
  "inc", "incorporated", "corp", "corporation", "co", "company", "companies", "ltd", "limited", "plc",
  "holdings", "holding", "group", "the", "sa", "nv", "ag", "se", "lp", "llc", "de", "com", "class", "cl",
]);
// First words too common to identify a company on their own ("American ...").
const GENERIC_WORDS = new Set([
  "american", "general", "united", "first", "international", "national", "global", "new", "bank",
  "energy", "health", "capital", "financial", "southern", "western", "eastern", "northern", "royal",
  "applied", "advanced", "digital", "public", "service", "services", "realty", "technologies",
]);
// Brands better known than the parent's legal name.
const ALIASES: Record<string, string[]> = {
  GOOGL: ["google"],
  GOOG: ["google"],
  META: ["facebook", "instagram", "whatsapp"],
  BRK: ["berkshire"],
};

const normalise = (s: string) => ` ${s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim()} `;

// "COCA COLA CO" -> ["coca cola"]; "NVIDIA CORP" -> ["nvidia"];
// "JPMORGAN CHASE & CO" -> ["jpmorgan and chase", "jpmorgan"].
function nameTerms(ticker: string, title: string | null): string[] {
  const terms = new Set<string>(ALIASES[ticker.split(/[.\-]/)[0]] ?? []);
  if (title) {
    const words = normalise(title).trim().split(" ").filter((w) => w && !NAME_SUFFIXES.has(w));
    if (words.length) terms.add(words.join(" "));
    if (words[0] && words[0].length >= 5 && !GENERIC_WORDS.has(words[0])) terms.add(words[0]);
  }
  return [...terms];
}

// Does this text name the company or its ticker? Ticker written the way
// finance headlines write one: "(KO)", "$KO", "NYSE: KO". Bare uppercase only
// for 3+ letters, so "IT" or "ON" in a headline doesn't count as Gartner or onsemi.
function names(text: string, ticker: string, terms: string[]): boolean {
  if (terms.some((t) => normalise(text).includes(` ${t} `))) return true;
  const t = ticker.replace(/[.\-]/g, "[.\\-]");
  if (new RegExp(`(\\(|\\$|:\\s?)${t}\\b`).test(text)) return true;
  return ticker.length >= 3 && new RegExp(`\\b${t}\\b`).test(text);
}

function isRelevant(n: NewsItem, ticker: string, terms: string[]): boolean {
  // Tagged with this ticker alone, and the story names the company somewhere
  // (Benzinga occasionally mis-tags, e.g. an Anthropic story tagged INTC).
  const tags = n.symbols ?? [];
  if (tags.length === 1 && tags[0] === ticker && names(`${n.headline} ${n.summary}`, ticker, terms)) return true;

  // Two or more commas reads as a list of companies, not a story about one.
  if ((n.headline.match(/,/g) ?? []).length >= 2) return false;

  return names(n.headline.split(/\s+/).slice(0, SUBJECT_WORDS).join(" "), ticker, terms);
}

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

// Merge both feeds, drop near-duplicate headlines and ones that aren't about
// the company, newest first. Either source failing on its own is tolerated;
// only both failing is an error. `hidden` counts the unrelated headlines
// dropped, so the UI can say so.
export async function getNews(symbol: string, limit = 20): Promise<{ items: NewsItem[]; sources: string[]; hidden: number }> {
  const [yahoo, alpaca, company] = await Promise.allSettled([
    yahooRss(symbol),
    // Fetch extra: some of these will be filtered out as unrelated.
    alpacaNews(symbol, 50).then((rows) =>
      rows.map((n) => ({
        id: `alpaca-${n.id}`,
        headline: decode(n.headline),
        summary: decode(n.summary),
        source: n.source,
        url: n.url,
        publishedAt: n.created_at,
        symbols: n.symbols ?? [],
      })),
    ),
    resolveTicker(symbol),
  ]);
  const terms = nameTerms(symbol, company.status === "fulfilled" ? (company.value?.title ?? null) : null);
  const ok = [yahoo, alpaca].filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<NewsItem[]>[];
  if (ok.length === 0) throw new Error("Both news sources failed");

  const seen = new Set<string>();
  const unique = ok
    .flatMap((r) => r.value)
    .filter((n) => n.headline && n.url)
    .filter((n) => {
      const key = n.headline.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const relevant = unique.filter((n) => isRelevant(n, symbol, terms));
  const items = relevant.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, limit);

  const sources = [yahoo.status === "fulfilled" ? "yahoo" : null, alpaca.status === "fulfilled" ? "alpaca" : null].filter(
    Boolean,
  ) as string[];
  return { items, sources, hidden: unique.length - relevant.length };
}
