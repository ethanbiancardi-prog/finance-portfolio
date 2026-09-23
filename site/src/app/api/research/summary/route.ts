import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  extractBusinessSection,
  getCompanyProfile,
  getFilingText,
  getRecentTenKFilings,
  resolveTicker,
  type CompanyProfile,
} from "@/lib/edgar";
import { getRedis, kvConfigured } from "@/lib/kv";

const anthropic = new Anthropic();

// The summary is written from the company's own "Item 1. Business" section
// of its latest 10-K, not from the model's memory — so it reflects what the
// company actually said about itself in its most recent annual report.
const SYSTEM_PROMPT = `You write short, plain-English company overviews for a retail investor who has
just typed a ticker into a research tool and wants to know what the business is before looking at
the numbers.

You will be given the "Business" section of the company's latest annual report (10-K). Using only
that text:
- Write a 3-4 sentence summary: what the company sells or does, who its customers are, and how it
  makes money. Write like a knowledgeable friend, not a press release, no marketing adjectives, no
  "leading provider of innovative solutions".
- List the company's main products, services, or reportable segments (2-5 items, each a few words).
  If the filing names reportable segments, use those.
If the text is too thin or garbled to answer confidently, say what you can and keep it short, and
never invent products or customers that aren't in the text.

Never use em dashes or en dashes (— or –) anywhere in your output. Use a comma, colon, semicolon, full stop, or parentheses instead. A hyphen inside a compound word is fine.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    segments: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "segments"],
  additionalProperties: false,
};

type Summary = {
  summary: string;
  segments: string[];
  filingDate: string;
  profile: CompanyProfile;
};

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 90; // a filing's summary doesn't go stale for months

async function readCache(key: string): Promise<Summary | null> {
  if (!kvConfigured()) return null;
  try {
    return (await getRedis().get<Summary>(key)) ?? null;
  } catch {
    return null; // cache is an optimisation, never a reason to fail
  }
}

async function writeCache(key: string, value: Summary) {
  if (!kvConfigured()) return;
  try {
    await getRedis().set(key, value, { ex: CACHE_TTL_SECONDS });
  } catch {
    // ignore — see readCache
  }
}

export async function GET(request: Request) {
  const ticker = (new URL(request.url).searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }
  const company = await resolveTicker(ticker);
  if (!company) {
    return NextResponse.json({ error: `No SEC filer found for ${ticker}` }, { status: 404 });
  }

  const [profile, filings] = await Promise.all([
    getCompanyProfile(company.cik),
    getRecentTenKFilings(company.cik, 1),
  ]);
  if (filings.length === 0) {
    return NextResponse.json({ error: "No 10-K on file" }, { status: 404 });
  }
  const filing = filings[0];

  // Keyed by accession number: a new 10-K gets a fresh summary, the same
  // filing is summarised once no matter how many people look it up.
  const cacheKey = `summary:${filing.accessionNumber}`;
  const cached = await readCache(cacheKey);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  const text = await getFilingText(company.cik, filing);
  const business = extractBusinessSection(text);
  if (!business) {
    return NextResponse.json({ error: "Couldn't find the Business section in the filing" }, { status: 422 });
  }

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Company: ${company.title} (${ticker})\nFiling date: ${filing.filingDate}\n\nItem 1. Business:\n${business}`,
      },
    ],
    output_config: {
      // Straight summarisation of a text we hand it — low effort is plenty
      // and keeps this fast enough to load automatically on every search.
      effort: "low",
      format: { type: "json_schema", schema: RESPONSE_SCHEMA },
    },
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const parsed = JSON.parse(textBlock && "text" in textBlock ? textBlock.text : "{}");

  const result: Summary = {
    summary: parsed.summary ?? "",
    segments: Array.isArray(parsed.segments) ? parsed.segments.slice(0, 5) : [],
    filingDate: filing.filingDate,
    profile,
  };
  await writeCache(cacheKey, result);
  return NextResponse.json({ ...result, cached: false });
}
