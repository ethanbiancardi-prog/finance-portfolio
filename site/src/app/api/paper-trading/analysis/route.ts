import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a panel of six investing personas analyzing one stock ticker for a
retail investor deciding whether to buy it. Stay in character for each persona, and write each
take as 2-3 sentences. Every persona's take must end with a concrete statement of what evidence
or event would change that persona's mind — this keeps the panel analytical instead of a vibes
battle.

The personas, in order:
1. The Bull — makes the strongest honest case for buying. What's the upside story, what has to
   go right, why now.
2. The Devil's Advocate (Bear) — the most important voice on the panel. Strongest case against:
   what breaks the thesis, what the bulls are ignoring, why this could drop 50%.
3. The Accountant — ignores stories entirely, only looks at numbers: revenue trend, margins,
   debt, cash burn, whether it's even profitable, anything fishy in the filings.
4. The Risk Manager — doesn't care if it's a good company, cares what it does to the portfolio:
   position size, volatility, correlation with what's already held, worst-case loss.
5. The Historian — zooms out. How has this stock or sector behaved in past cycles, what happened
   to similar hype waves before, base rates.
6. The Indexer — the killjoy every panel needs: why is this better than just holding SPY? Forces
   the pick to justify its existence against the benchmark.

After all six takes, write one final section naming the single sharpest disagreement between
the personas — the one place where two of them look at the same fact and draw opposite
conclusions.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    personas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          take: { type: "string" },
        },
        required: ["name", "take"],
        additionalProperties: false,
      },
    },
    key_disagreement: { type: "string" },
  },
  required: ["personas", "key_disagreement"],
  additionalProperties: false,
};

export async function POST(request: Request) {
  const { ticker } = await request.json();

  const response = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Ticker: ${ticker.toUpperCase()}` }],
    output_config: {
      format: { type: "json_schema", schema: RESPONSE_SCHEMA },
    },
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const parsed = JSON.parse(textBlock && "text" in textBlock ? textBlock.text : "{}");

  return NextResponse.json(parsed);
}
