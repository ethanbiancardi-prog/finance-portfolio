import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { AI_ENABLED, AI_PAUSED_MESSAGE } from "@/lib/aiFeatures";
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

// The response is streamed as NDJSON (one JSON object per line) so the panel
// can show each analyst the moment its take is written, instead of a blank
// ~30-second wait for all six. Lines, in order:
//   {"type":"status","stage":"briefing"|"thinking"}  progress, for the UI's label
//   {"type":"take","take":{role,stance,verdict,reasons,change_mind}}  one per analyst
//   {"type":"done","basedOn":{...},"generatedAt":"...","cached":bool}
//   {"type":"error","message":"..."}  instead of "done" if something broke
// A cached result is replayed in the same format, all at once.
type Line =
  | { type: "status"; stage: "briefing" | "thinking" }
  | { type: "take"; take: Record<string, unknown> }
  | { type: "done"; basedOn: unknown; generatedAt: string; cached: boolean }
  | { type: "error"; message: string };

// Pulls each complete analyst object out of the JSON as it streams in: the
// output is {"analysts":[{...},{...},...]}, so once inside the array, every
// time the braces balance back to zero one take is complete. Quotes and
// escapes are tracked so a "{" or "}" inside a sentence doesn't count.
function takeExtractor(onTake: (json: string) => void) {
  let buf = "";
  let i = 0;
  let inArray = false;
  let inString = false;
  let escaped = false;
  let depth = 0;
  let start = -1;
  return (chunk: string) => {
    buf += chunk;
    for (; i < buf.length; i++) {
      const ch = buf[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (!inArray) inArray = ch === "[";
      else if (ch === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && start >= 0) {
          onTake(buf.slice(start, i + 1));
          start = -1;
        }
      }
    }
  };
}

const isTake = (t: unknown): t is { role: string } =>
  typeof t === "object" && t !== null && ANALYST_ROLES.includes((t as { role: string }).role as (typeof ANALYST_ROLES)[number]);

export async function POST(request: Request) {
  if (!AI_ENABLED) return NextResponse.json({ error: AI_PAUSED_MESSAGE }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  const cacheKey = `analysis:v2:${ticker}`;
  let cached: { analysts?: unknown[]; basedOn?: unknown; generatedAt?: string } | null = null;
  if (kvConfigured()) {
    try {
      cached = await getRedis().get(cacheKey);
    } catch {
      // cache is an optimisation, never a reason to fail
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: Line) => controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      try {
        if (cached?.analysts) {
          for (const take of cached.analysts) if (isTake(take)) send({ type: "take", take });
          send({ type: "done", basedOn: cached.basedOn, generatedAt: cached.generatedAt ?? "", cached: true });
          return;
        }

        send({ type: "status", stage: "briefing" });
        const briefing = await buildBriefing(ticker, 10);
        send({ type: "status", stage: "thinking" });

        const extract = takeExtractor((json) => {
          try {
            const take = JSON.parse(json);
            if (isTake(take)) send({ type: "take", take });
          } catch {
            // a malformed piece is skipped here; the final parse below decides
          }
        });
        const response = anthropic.messages.stream({
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
        response.on("text", extract);
        const message = await response.finalMessage();
        if (message.stop_reason !== "end_turn") {
          send({ type: "error", message: "The analysis was cut off. Try again." });
          return;
        }

        const textBlock = message.content.find((block) => block.type === "text");
        const parsed = JSON.parse(textBlock && "text" in textBlock ? textBlock.text : "{}");
        // Tell the UI what the takes were actually based on, so a reader can see
        // "priced as of 3:58pm, filing FY2025, 8 headlines" next to the output.
        const result = { ...parsed, basedOn: briefing.basedOn, generatedAt: new Date().toISOString() };
        if (kvConfigured()) {
          await getRedis().set(cacheKey, result, { ex: CACHE_TTL_SECONDS }).catch(() => {});
        }
        send({ type: "done", basedOn: result.basedOn, generatedAt: result.generatedAt, cached: false });
      } catch (err) {
        console.error("analysis stream failed", err);
        send({ type: "error", message: "Analysis failed." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
