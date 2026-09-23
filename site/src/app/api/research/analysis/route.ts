import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildBriefing } from "@/lib/researchBriefing";

const anthropic = new Anthropic();

// The model only knows what it was trained on, so without a briefing every
// take would be months stale and read like a Wikipedia summary. We hand it
// the same three things the research page shows — the 10-K ratio dashboard,
// the latest price, and recent headlines — and require each persona to cite
// them. Anything we can't fetch is labelled "not available" so the model
// says so instead of inventing a figure.
const SYSTEM_PROMPT = `You are a panel of six investing personas analyzing one stock ticker for a
retail investor deciding whether to buy it. Stay in character for each persona, and write each
take as 2-3 sentences. Every persona's take must end with a concrete statement of what evidence
or event would change that persona's mind; this keeps the panel analytical instead of a vibes
battle.

You will be given a briefing with the company's latest annual financials (from its 10-K filing
with the SEC), the current share price, and recent headlines. Ground every take in that briefing:
quote the specific numbers and headlines you are reacting to, and treat the briefing as more
current than anything you remember about the company. Where the briefing says a figure is not
available, say so rather than guessing. Note that the financials are annual, if the headlines
describe something that happened after the fiscal year end, say which is newer.

The personas, in order:
1. The Bull, makes the strongest honest case for buying. What's the upside story, what has to
   go right, why now.
2. The Devil's Advocate (Bear), the most important voice on the panel. Strongest case against:
   what breaks the thesis, what the bulls are ignoring, why this could drop 50%.
3. The Accountant, ignores stories entirely, only looks at numbers: revenue trend, margins,
   debt, cash burn, whether it's even profitable, anything fishy in the filings.
4. The Risk Manager, doesn't care if it's a good company, cares what it does to the portfolio:
   position size, volatility, correlation with what's already held, worst-case loss.
5. The Historian, zooms out. How has this stock or sector behaved in past cycles, what happened
   to similar hype waves before, base rates.
6. The Indexer, the killjoy every panel needs: why is this better than just holding SPY? Forces
   the pick to justify its existence against the benchmark.

After all six takes, write one final section naming the single sharpest disagreement between
the personas: the one place where two of them look at the same fact and draw opposite
conclusions.

Never use em dashes or en dashes (— or –) anywhere in your output. Use a comma, colon, semicolon, full stop, or parentheses instead. A hyphen inside a compound word is fine.`;

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
  const body = await request.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  const briefing = await buildBriefing(ticker, 10);

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: briefing.text }],
    output_config: {
      // Six short takes over a briefing we already assembled — medium effort
      // keeps the reasoning without the wait a research-report-length answer
      // would need.
      effort: "medium",
      format: { type: "json_schema", schema: RESPONSE_SCHEMA },
    },
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const parsed = JSON.parse(textBlock && "text" in textBlock ? textBlock.text : "{}");

  // Tell the UI what the takes were actually based on, so a reader can see
  // "priced as of 3:58pm, filing FY2025, 8 headlines" next to the output.
  return NextResponse.json({
    ...parsed,
    basedOn: briefing.basedOn,
  });
}
