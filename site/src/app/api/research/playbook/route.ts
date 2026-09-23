import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildBriefing } from "@/lib/researchBriefing";
import { getRedis, kvConfigured } from "@/lib/kv";

const anthropic = new Anthropic();

// Turns the research briefing into something actionable for a paper
// account: what's actually happening at the company right now (from the
// headlines), how it's doing financially (from the 10-K ratios), and two or
// three concrete things the reader could do about it — each tied to an
// action this site can perform. Same grounding rules as the analyst panel.
const SYSTEM_PROMPT = `You are a sharp, plain-spoken equity analyst helping a student manage a paper-trading
account. You will be given a briefing: the company's latest annual financials, its current share
price, and recent headlines. Work only from that briefing, cite the specific headlines and numbers
you're reacting to, and where something isn't in the briefing, say so rather than guessing.

Produce:

1. catalysts, the 2-5 things in the headlines that could actually move the stock: a new product
   or launch, an earnings or guidance change, a deal, a regulatory or legal event, a management
   change, or a macro factor. For each: the type, a one-line headline in your own words, why it
   matters for the share price, and whether it's positive, negative, or mixed. Skip headlines that
   are noise (generic "stocks to watch" listicles, analyst-rating churn without new information).
   If the headlines contain nothing material, return an empty list, do not pad.

2. financialHealth, one word verdict (strong / solid / mixed / weak) and 2-4 short points backed
   by the ratios: growth, profitability, balance sheet, cash generation. Quote the numbers.

3. options, 2-3 concrete, different things the reader could do next, ordered from most to least
   sensible given the evidence. Each has: a short title; the reasoning in 2-3 sentences that ties
   the catalysts and financials together; an action, which must be exactly one of
   "buy" (open a starter position in the paper account), "watch" (don't act yet, wait for a
   specific event), "journal" (write down a thesis before doing anything), "dcf" (the numbers are
   interesting enough to value it properly), or "avoid"; and an invalidation, the specific thing
   that would prove this option wrong. If you suggest "buy", say what a sensible starter size is as
   a percent of the account (1-5%). Never suggest going all-in.

Be direct. No hedging boilerplate; the page already carries a disclaimer.

Never use em dashes or en dashes (— or –) anywhere in your output. Use a comma, colon, semicolon, full stop, or parentheses instead. A hyphen inside a compound word is fine.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    catalysts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["product", "earnings", "guidance", "deal", "regulatory", "management", "macro", "other"] },
          headline: { type: "string" },
          why: { type: "string" },
          direction: { type: "string", enum: ["positive", "negative", "mixed"] },
        },
        required: ["type", "headline", "why", "direction"],
        additionalProperties: false,
      },
    },
    financialHealth: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["strong", "solid", "mixed", "weak"] },
        points: { type: "array", items: { type: "string" } },
      },
      required: ["verdict", "points"],
      additionalProperties: false,
    },
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          rationale: { type: "string" },
          action: { type: "string", enum: ["buy", "watch", "journal", "dcf", "avoid"] },
          starterSizePct: { type: ["number", "null"] },
          invalidation: { type: "string" },
        },
        required: ["title", "rationale", "action", "starterSizePct", "invalidation"],
        additionalProperties: false,
      },
    },
  },
  required: ["catalysts", "financialHealth", "options"],
  additionalProperties: false,
};

// Headlines change through the day, so the cache is short — but long enough
// that flipping between tickers and back doesn't re-bill.
const CACHE_TTL_SECONDS = 60 * 60 * 3;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  const cacheKey = `playbook:${ticker}`;
  if (kvConfigured()) {
    try {
      const cached = await getRedis().get<Record<string, unknown>>(cacheKey);
      if (cached) return NextResponse.json({ ...cached, cached: true });
    } catch {
      // cache is an optimisation, never a reason to fail
    }
  }

  const briefing = await buildBriefing(ticker, 12);

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: briefing.text }],
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: RESPONSE_SCHEMA },
    },
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const parsed = JSON.parse(textBlock && "text" in textBlock ? textBlock.text : "{}");
  const result = { ...parsed, basedOn: briefing.basedOn, generatedAt: new Date().toISOString() };

  if (kvConfigured()) {
    try {
      await getRedis().set(cacheKey, result, { ex: CACHE_TTL_SECONDS });
    } catch {
      // ignore
    }
  }
  return NextResponse.json({ ...result, cached: false });
}
