// Legislation and geopolitics signals, researched by Claude with its web
// search tool. The model is asked for a strict JSON list; this module then
// enforces the sourcing rule in code rather than trusting the prompt:
//
//   - every item must cite at least one URL that appeared in this run's
//     actual web search results (a URL recalled from training doesn't count)
//   - every item must carry a dated event (YYYY-MM-DD) inside the window
//   - every ticker must resolve in SEC's filer list
//
// Anything that fails is dropped and counted in the batch stats, so the
// page only ever shows sourced, dated, real-company leads.
import Anthropic from "@anthropic-ai/sdk";
import { resolveTickerNames } from "@/lib/edgar";
import { getRedis } from "@/lib/kv";
import type { Signal, SignalBatch, SignalCategory, SignalSource } from "./types";

const anthropic = new Anthropic();
const WINDOW_DAYS = 21;
const MAX_ITEMS = 8;

const COMMON_RULES = `You are researching leads for a student's stock-research tool. Use web search to find what has
actually happened in the last ${WINDOW_DAYS} days, then pick the events most likely to matter for the share price of
specific US-listed public companies. Prefer primary or reputable sources: congress.gov, federalregister.gov, agency
press releases, SEC filings, Reuters, AP, Bloomberg, FT, WSJ, major trade press. Skip anything you cannot date and
source from a page you actually opened in search.

For each lead give: the ticker of one directly affected company (a real US-listed ticker, not an ETF), a short title,
the date of the underlying event, a one-paragraph reasoning that says what happened and the mechanism by which it
affects that company's revenue, costs, or valuation, a one-sentence bull case, a one-sentence "what could go wrong"
(including the case that the market has already priced it in), and the sources you used with their URLs and dates.

Rules: at most ${MAX_ITEMS} leads; aim for at least 4, and keep searching (you have the budget) if your first
searches turn up fewer. One ticker per lead; if several companies are affected, pick the most exposed and mention
the others in the reasoning. Every source URL must be a page you saw in search results, and it must be the specific
article or press release about the event — not a newsroom index, section page, or search page. Do not include
leads you cannot source. This is research, not advice — no "buy"/"sell" language.

When you are done, reply with ONLY a JSON object, no prose before or after, in exactly this shape:
{"items":[{"ticker":"NVDA","title":"...","eventDate":"YYYY-MM-DD","reasoning":"...","bullCase":"...","risk":"...",
"sources":[{"label":"Reuters, YYYY-MM-DD","url":"https://..."}]}]}`;

const PROMPTS: Record<"legislation" | "geopolitics", string> = {
  legislation: `${COMMON_RULES}

Category: LEGISLATION AND REGULATION. Look for: bills advancing in Congress (committee markups, floor votes, signed
laws), federal agency rules and enforcement actions (FDA approvals or rejections, FTC/DOJ antitrust, FCC, EPA, SEC,
Treasury/OFAC, USTR tariffs), executive orders, and major state laws — each tied to the specific companies it hits.`,
  geopolitics: `${COMMON_RULES}

Category: GEOPOLITICS AND MACRO EVENTS. Look for: sanctions and export controls, trade negotiations and tariffs,
conflicts and ceasefires affecting supply chains or commodity prices, elections with policy consequences, central bank
decisions, OPEC output changes, and major international deals — each tied to the specific companies most exposed.`,
};

type RawItem = {
  ticker?: string;
  title?: string;
  eventDate?: string;
  reasoning?: string;
  bullCase?: string;
  risk?: string;
  sources?: { label?: string; url?: string }[];
};

// Pull the JSON object out of the final text block, tolerating stray prose.
function extractJson(text: string): { items?: RawItem[] } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normaliseUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    // Tracking params never change what page a link points to.
    for (const k of [...url.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/.test(k)) url.searchParams.delete(k);
    return url.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}

export async function refreshAiSignals(category: "legislation" | "geopolitics", now = new Date()): Promise<SignalBatch> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: PROMPTS[category],
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10 }],
    messages: [{ role: "user", content: `Today is ${today}. Find leads from ${since} to today.` }],
    output_config: { effort: "medium" },
  });

  // Every URL the model actually saw. Sources must come from this set.
  const seenUrls = new Set<string>();
  for (const block of response.content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) if (r.type === "web_search_result") seenUrls.add(normaliseUrl(r.url));
    }
  }
  const finalText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  if (process.env.SIGNALS_DEBUG) console.error(`--- ${category} final text (${finalText.length} chars, stop ${response.stop_reason}) ---
${finalText.slice(0, 3000)}`);
  const parsed = extractJson(finalText);
  if (!parsed?.items) throw new Error(`${category}: model returned no parseable JSON (stop_reason ${response.stop_reason})`);

  const stats = { returned: parsed.items.length, droppedNoSource: 0, droppedNoDate: 0, droppedUnknownTicker: 0, searches: seenUrls.size };
  const candidates = parsed.items.slice(0, MAX_ITEMS * 2);
  const names = await resolveTickerNames(candidates.map((i) => String(i.ticker ?? "").toUpperCase()).filter(Boolean));

  const items: Signal[] = [];
  for (const raw of candidates) {
    const ticker = String(raw.ticker ?? "").toUpperCase();
    const sources: SignalSource[] = (raw.sources ?? [])
      .filter((s): s is { label?: string; url: string } => typeof s.url === "string" && seenUrls.has(normaliseUrl(s.url)))
      .map((s) => ({ label: s.label?.trim() || new URL(s.url).hostname, url: s.url }));
    if (sources.length === 0) {
      stats.droppedNoSource++;
      continue;
    }
    const eventDate = String(raw.eventDate ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || eventDate < since || eventDate > today) {
      stats.droppedNoDate++;
      continue;
    }
    if (!names.has(ticker)) {
      stats.droppedUnknownTicker++;
      continue;
    }
    if (!raw.reasoning || !raw.title) continue;
    items.push({
      id: `${category}-${ticker}-${eventDate}`,
      category,
      ticker,
      company: names.get(ticker)!,
      title: raw.title,
      eventDate,
      reasoning: raw.reasoning,
      bullCase: raw.bullCase ?? "",
      risk: raw.risk ?? "",
      sources,
    });
    if (items.length >= MAX_ITEMS) break;
  }

  const batch: SignalBatch = {
    category,
    generatedAt: now.toISOString(),
    windowDays: WINDOW_DAYS,
    items: items.sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
    stats: { ...stats, kept: items.length, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
  await getRedis().set(`signals:${category}`, batch);
  return batch;
}

export async function getAiSignals(category: SignalCategory): Promise<SignalBatch | null> {
  return (await getRedis().get<SignalBatch>(`signals:${category}`)) ?? null;
}
