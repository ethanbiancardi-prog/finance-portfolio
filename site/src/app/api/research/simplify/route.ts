import { createHash } from "crypto";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getRedis, kvConfigured } from "@/lib/kv";

const anthropic = new Anthropic();

// Rewrites one passage of research text for someone new to finance: same
// facts, no jargon, plus an analogy from everyday life. Cached by the text's
// hash for a week, so a passage is only ever rewritten once.
const SYSTEM_PROMPT = `You rewrite short passages of stock research for a smart reader who is new to finance.

Rules:
- Keep every fact and number exactly as given. Do not add claims, opinions, or advice.
- Replace jargon with plain words, or keep the term and explain it in a few words the first time.
- Same length or shorter. Short sentences. No bullet points.
- Then give ONE analogy from everyday life (a household budget, a shop, a car, a sports team...) that makes the
  main point click. One or two sentences. It must map onto the actual point of the passage, not be generic.

Reply with ONLY a JSON object: {"simple": "...", "analogy": "..."}`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: { simple: { type: "string" }, analogy: { type: "string" } },
  required: ["simple", "analogy"],
  additionalProperties: false,
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const text = String(body.text ?? "").trim();
  const context = String(body.context ?? "").trim().slice(0, 200);
  if (text.length < 20 || text.length > 4000) {
    return NextResponse.json({ error: "Text must be 20-4000 characters" }, { status: 400 });
  }

  const key = `simplify:${createHash("sha256").update(text).digest("hex").slice(0, 32)}`;
  if (kvConfigured()) {
    try {
      const cached = await getRedis().get<{ simple: string; analogy: string }>(key);
      if (cached) return NextResponse.json({ ...cached, cached: true });
    } catch {
      // cache is an optimisation only
    }
  }

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `${context ? `Context: ${context}\n\n` : ""}Passage:\n${text}` }],
    output_config: {
      effort: "low", // a rewrite, not analysis — fast and cheap
      format: { type: "json_schema", schema: RESPONSE_SCHEMA },
    },
  });
  const textBlock = response.content.find((b) => b.type === "text");
  const parsed = JSON.parse(textBlock && "text" in textBlock ? textBlock.text : "{}");
  const result = { simple: String(parsed.simple ?? ""), analogy: String(parsed.analogy ?? "") };

  if (kvConfigured()) {
    try {
      await getRedis().set(key, result, { ex: 60 * 60 * 24 * 7 });
    } catch {
      // ignore
    }
  }
  return NextResponse.json({ ...result, cached: false });
}
