// Information diffusion, step 1 of 3: every 8-K filed by the research-list
// companies (lib/researchUniverse.ts) since START, with the exact moment SEC
// accepted it, into site/.ml-cache/diffusion/events.json (gitignored).
//
// An 8-K is the form a US company must file within 4 business days of
// "material" news. Each lists item codes saying what kind of news it is:
// 2.02 = earnings results, 5.02 = an executive leaving or joining, 1.01 = a
// major contract or deal, 2.05 = layoffs/restructuring, 5.07 = shareholder
// vote results, and so on. SEC's acceptance time (to the second) is when the
// filing became public on EDGAR.
//
// Source: data.sec.gov/submissions (free, no key; SEC asks for <= 10
// requests a second and a User-Agent with contact details, see lib/edgar.ts).
//
// Usage, from site/:  npx tsx scripts/diffusion/fetch-events.ts   (~2 minutes)

import { mkdirSync, writeFileSync } from "node:fs";
import { resolveTicker, secFetch } from "../../src/lib/edgar";
import { RESEARCH_UNIVERSE } from "../../src/lib/researchUniverse";

export const START = "2021-07-01"; // ~5 years of events
export const OUT = ".ml-cache/diffusion";

export type FilingEvent = { ticker: string; accession: string; accepted: string; items: string[] };

type Columns = { accessionNumber: string[]; acceptanceDateTime: string[]; form: string[]; items: string[]; filingDate: string[] };

async function eightKs(ticker: string): Promise<FilingEvent[]> {
  const company = await resolveTicker(ticker);
  if (!company) throw new Error(`${ticker}: not an SEC filer`);
  const cik = String(company.cik).padStart(10, "0");
  const sub = await (await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`)).json();
  const pages: Columns[] = [sub.filings.recent];
  // "recent" holds the last ~1,000 filings. Heavy filers (lots of insider
  // Form 4s) can push 5 years past that, so read older pages until covered.
  for (const f of sub.filings.files ?? []) {
    if (f.filingTo >= START) pages.push(await (await secFetch(`https://data.sec.gov/submissions/${f.name}`)).json());
  }
  const out: FilingEvent[] = [];
  for (const p of pages) {
    for (let i = 0; i < p.form.length; i++) {
      // Amendments (8-K/A) mostly re-file old news, so they're skipped.
      if (p.form[i] !== "8-K" || p.filingDate[i] < START) continue;
      out.push({
        ticker,
        accession: p.accessionNumber[i],
        accepted: p.acceptanceDateTime[i], // UTC, e.g. 2026-11-02T21:30:23.000Z
        items: (p.items[i] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      });
    }
  }
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const events: FilingEvent[] = [];
  const failed: string[] = [];
  for (let i = 0; i < RESEARCH_UNIVERSE.length; i += 4) {
    const chunk = RESEARCH_UNIVERSE.slice(i, i + 4);
    const results = await Promise.allSettled(chunk.map(eightKs));
    results.forEach((r, j) => (r.status === "fulfilled" ? events.push(...r.value) : failed.push(`${chunk[j]} (${String(r.reason).slice(0, 60)})`)));
  }
  events.sort((a, b) => a.accepted.localeCompare(b.accepted));
  writeFileSync(`${OUT}/events.json`, JSON.stringify(events));
  console.log(`${events.length} 8-Ks from ${new Set(events.map((e) => e.ticker)).size} companies since ${START}. Failed: ${failed.join(", ") || "none"}`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/diffusion/fetch-events.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
