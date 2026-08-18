import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  findSnippets,
  getCompanyFacts,
  getFilingText,
  getRecentTenKFilings,
  getRedFlagNumbers,
  resolveTicker,
} from "@/lib/edgar";

const anthropic = new Anthropic();

// Three of the five checks below are pure arithmetic and are decided in code
// (see getRedFlagNumbers) — we only ask the model to write the "why" for
// ones that are already true, grounded in the real numbers we hand it. The
// other two need actual reading comprehension: a keyword hit on "going
// concern" is meaningless on its own (it's routine audit boilerplate in
// nearly every 10-K), and "non-GAAP" usage is only a real flag when it's
// being used to paper over weak GAAP results, not just report a normal
// supplemental metric.
const SYSTEM_PROMPT = `You are a skeptical equity research analyst scanning a 10-K filing for red flags.

You will be given:
1. Three pre-computed numeric signals, each already determined to be true or false. For every one that is true, write a one-sentence "why" using only the numbers provided — do not invent figures.
2. Text snippets pulled from the filing around mentions of "non-GAAP"/"adjusted" figures, and around mentions of "going concern".

For the non-GAAP snippets: only flag it if the snippets suggest management leans on adjusted figures to paper over weak GAAP results (e.g. large addbacks, adjusted figures presented more prominently than GAAP, a pattern of adjusting away recurring costs). Routine, isolated non-GAAP reporting is normal and should not be flagged.

For the going-concern snippets: only flag it if the language expresses genuine doubt about the company continuing to operate (e.g. "substantial doubt", "may not continue as a going concern"). Standard audit-report boilerplate that merely explains what a going-concern opinion would cover, without expressing doubt, is NOT a flag.

Only include patterns that are genuinely triggered. If nothing qualifies, return an empty list. Do not pad the list to seem thorough.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    flags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          why: { type: "string" },
        },
        required: ["pattern", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["flags"],
  additionalProperties: false,
};

function fmtPct(value: number | null) {
  return value == null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

function fmtX(value: number | null) {
  return value == null ? "N/A" : `${value.toFixed(2)}x`;
}

export async function POST(request: Request) {
  const { ticker } = await request.json();
  const company = await resolveTicker(ticker);
  if (!company) {
    return NextResponse.json({ error: `No SEC filer found for ${ticker}` }, { status: 404 });
  }

  const [facts, filings] = await Promise.all([
    getCompanyFacts(company.cik),
    getRecentTenKFilings(company.cik, 1),
  ]);
  const numbers = getRedFlagNumbers(facts);

  let nonGaapSnippets: string[] = [];
  let goingConcernSnippets: string[] = [];
  if (filings.length) {
    const text = await getFilingText(company.cik, filings[0]);
    nonGaapSnippets = findSnippets(
      text,
      /non-GAAP|adjusted (EBITDA|net income|operating income|earnings)/gi,
      250,
      6,
    );
    goingConcernSnippets = findSnippets(text, /going concern/gi, 300, 4);
  }

  const snippetBlock = (label: string, snippets: string[]) =>
    `${label}:\n${snippets.length ? snippets.map((s, i) => `[${i + 1}] ...${s}...`).join("\n") : "(no mentions found in the filing)"}`;

  const userPrompt = `Ticker: ${ticker.toUpperCase()}

Numeric signals (already computed correctly — do not recompute, just explain the ones that are true):
1. Revenue up but operating cash flow down: ${numbers.revenueUpOcfDown} (revenue growth ${fmtPct(numbers.revenueGrowth)}, operating cash flow growth ${fmtPct(numbers.ocfGrowth)})
2. Rising debt with falling interest coverage: ${numbers.debtRisingCoverageFalling} (total liabilities growth ${fmtPct(numbers.liabilitiesGrowth)}, interest coverage ${fmtX(numbers.interestCoveragePrior)} -> ${fmtX(numbers.interestCoverageNow)})
3. Inventory growing faster than revenue: ${numbers.inventoryOutpacingRevenue} (inventory growth ${fmtPct(numbers.inventoryGrowth)}, revenue growth ${fmtPct(numbers.revenueGrowth)})

${snippetBlock("Non-GAAP / adjusted-figure mentions", nonGaapSnippets)}

${snippetBlock("Going-concern mentions", goingConcernSnippets)}`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    output_config: {
      format: { type: "json_schema", schema: RESPONSE_SCHEMA },
    },
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const parsed = JSON.parse(textBlock && "text" in textBlock ? textBlock.text : "{}");

  return NextResponse.json(parsed);
}
