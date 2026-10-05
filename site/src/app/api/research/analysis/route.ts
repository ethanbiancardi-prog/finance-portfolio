import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildBriefing } from "@/lib/researchBriefing";
import { getRedis, kvConfigured } from "@/lib/kv";

const anthropic = new Anthropic();

// Six AI analysts, each answering a different question from its own slice of
// the briefing (the 10-K ratios, current price, and relevance-filtered
// headlines), so the takes can't all retell the same story. Each returns a
// stance, a one-line verdict, 2-3 numbered reasons that quote real numbers,
// and what would change its mind. Anything not in the briefing is "not
// available" rather than invented.
const SYSTEM_PROMPT = `You are a panel of six analysts explaining one stock to a beginner investor who is
learning, not deciding what to trade. Each analyst answers ONE question using ONLY its own slice of the
briefing below. You will be given a briefing with the company's latest annual financials (from its
10-K filing with the SEC), the current share price, and recent headlines about this company.

The analysts, in this order (use these exact role values):
1. "business": Is the business growing and becoming more profitable? Use only revenue, revenue
   growth, gross / operating / net margin, ROE, ROIC. Nothing about debt, the share price, or news.
2. "safety": Could the company survive a bad year? Use only the current, quick and cash ratios,
   debt-to-equity, debt-to-assets, interest coverage, free cash flow, operating cash flow margin.
3. "price": Is the stock expensive for what you get? Use the current price, market cap and
   trailing P/E, and compare them with the growth and margins (for example, a high P/E with slow
   growth means the price already assumes a lot). If the P/E is not available, say so.
4. "news": What changed recently? Use only the headlines in the briefing. If the briefing says
   there is no relevant news, the stance is "neutral", the verdict is "No relevant news about this
   company right now.", and the one reason says so. Never use headlines about other companies.
5. "skeptic": What is the single biggest thing that could go wrong? Pick the strongest risk in the
   briefing and back it with evidence. Do not restate a reason another analyst already gave; find
   the risk they missed or understated.
6. "summary": What does it all mean? In plain everyday English with no jargon, weigh the five
   answers above, say which way the evidence leans overall and why, and name the one thing worth
   watching. Add no new facts.

For each analyst return:
- stance: "bullish", "neutral" or "bearish", following from its own reasons only.
- verdict: one short sentence answering its question directly.
- reasons: 2 or 3 short sentences (at most 25 words each), each quoting a specific number or
  headline from the briefing with its period or date. Each reason must explain WHY the number
  matters ("net margin of 23% means it keeps 23 cents of every sales dollar"), not just repeat it.
  The verdict must follow logically from the reasons.
- change_mind: one sentence naming the specific number or event that would flip this stance.

Rules: no two analysts may make the same point. Ground everything in the briefing and treat it as
more current than anything you remember; where a figure is not available, say so instead of
guessing. The financials are annual: if a headline is newer than the fiscal year end, say so.
Describe evidence, never tell the reader to buy or sell.

Never use em dashes or en dashes (— or –) anywhere in your output. Use a comma, colon, semicolon, full stop, or parentheses instead. A hyphen inside a compound word is fine.`;

const ANALYST_ROLES =["business", "safety", "price", "news", "skeptic", "summary"] as const;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    analysts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: "string", enum: ANALYST_ROLES },
          stance: { type: "string", enum: ["bullish", "neutral", "bearish"] },
          verdict: { type: "string" },
          reasons: { type: "array", items: { type: "string" } },
          change_mind: { type: "string" },
        },
        required: ["role", "stance", "verdict", "reasons", "change_mind"],
        additionalProperties: false,
      },
    },
  },
  required: ["analysts"],
  additionalProperties: false,
};

// Same window as the playbook: headlines move through the day, but flipping
// between tickers and back shouldn't re-bill six takes.
const CACHE_TTL_SECONDS = 60 * 60 * 3;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  const cacheKey = `analysis:v2:${ticker}`;
  if (kvConfigured()) {
    try {
      const cached = await getRedis().get<Record<string, unknown>>(cacheKey);
      if (cached) return NextResponse.json({ ...cached, cached: true });
    } catch {
      // cache is an optimisation, never a reason to fail
    }
  }

  const briefing = await buildBriefing(ticker, 10);

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: briefing.text }],
    output_config: {
      // Six short structured takes over a briefing we already assembled —
      // medium effort keeps the reasoning without a report-length wait.
      effort: "medium",
      format: { type: "json_schema", schema: RESPONSE_SCHEMA },
    },
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const parsed = JSON.parse(textBlock && "text" in textBlock ? textBlock.text : "{}");

  // Tell the UI what the takes were actually based on, so a reader can see
  // "priced as of 3:58pm, filing FY2025, 8 headlines" next to the output.
  const result = { ...parsed, basedOn: briefing.basedOn, generatedAt: new Date().toISOString() };
  if (kvConfigured()) {
    await getRedis().set(cacheKey, result, { ex: CACHE_TTL_SECONDS }).catch(() => {});
  }
  return NextResponse.json({ ...result, cached: false });
}
