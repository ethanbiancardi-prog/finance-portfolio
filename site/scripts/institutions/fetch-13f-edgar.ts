// Fresher fund holdings: read the newest quarter's 13F filings straight from
// EDGAR as funds file them, instead of waiting for the SEC's bundled data set
// (which can trail the filing deadline by weeks). Funds have 45 days after a
// quarter ends to file, so a quarter is only COMPLETE ~47 days after it ends;
// build-institutions.ts ignores a quarter fetched before then (a half-filed
// quarter would make every stock look like funds were selling).
//
// How: EDGAR's quarterly form index lists every 13F-HR filed; each filing's
// full text (one request) holds its holdings table as XML, one <infoTable>
// per position with a <cusip>. Same counting rules as the bundles: original
// 13F-HR only, option rows skipped, each fund once per stock.
//
// Resumable: finished filings are appended to .ml-cache/13f/edgar/<period>.jsonl,
// so rerunning picks up only new filings (run it again after the deadline).
//
// Usage, from site/:  npx tsx scripts/institutions/fetch-13f-edgar.ts [YYYY-MM-DD]
// (default: the latest quarter end at least 10 days ago). ~9,000 filings at
// SEC's polite pace: ~30-40 minutes on the first run. Then rerun
// build-institutions.ts.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { secFetch } from "../../src/lib/edgar";

const DIR = ".ml-cache/13f/edgar";
mkdirSync(DIR, { recursive: true });
const DAY = 86_400_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function latestQuarterEnd(): string {
  const d = new Date(Date.now() - 10 * DAY);
  const ends = ["03-31", "06-30", "09-30", "12-31"];
  for (let y = d.getUTCFullYear(); ; y--) {
    for (const e of [...ends].reverse()) {
      const iso = `${y}-${e}`;
      if (iso <= d.toISOString().slice(0, 10)) return iso;
    }
  }
}

async function main() {
  const period = process.argv[2] ?? latestQuarterEnd();
  const end = new Date(period);
  // Filings for a quarter arrive in the next calendar quarter (late ones after).
  const next = new Date(end.getTime() + 2 * DAY);
  const idxQuarters = [{ y: next.getUTCFullYear(), q: Math.floor(next.getUTCMonth() / 3) + 1 }];
  const deadline = new Date(end.getTime() + 45 * DAY).toISOString().slice(0, 10);
  console.log(`Quarter ${period}: filing deadline ${deadline}`);

  // 1. Every 13F-HR filed so far.
  const filings: { cik: string; path: string }[] = [];
  for (const { y, q } of idxQuarters) {
    const idx = await (await secFetch(`https://www.sec.gov/Archives/edgar/full-index/${y}/QTR${q}/form.idx`)).text();
    for (const line of idx.split("\n")) {
      const m = line.match(/^13F-HR\s+.*?\s(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(edgar\/\S+\.txt)\s*$/);
      if (m) filings.push({ cik: m[1], path: m[3] });
    }
  }

  // 2. Fetch the ones not done yet.
  const progress = `${DIR}/${period}.jsonl`;
  const done = new Set<string>();
  if (existsSync(progress)) for (const l of readFileSync(progress, "utf8").split("\n")) if (l) done.add(l.split("\t")[0]);
  const todo = filings.filter((f) => !done.has(f.path));
  console.log(`${filings.length} 13F-HR filings listed, ${done.size} done, ${todo.length} to fetch`);

  let i = 0, failed = 0;
  const worker = async () => {
    while (i < todo.length) {
      const f = todo[i++];
      try {
        const text = await (await secFetch(`https://www.sec.gov/Archives/${f.path}`)).text();
        const p = text.match(/CONFORMED PERIOD OF REPORT:\s*(\d{4})(\d{2})(\d{2})/);
        const filedFor = p ? `${p[1]}-${p[2]}-${p[3]}` : "";
        const cusips = new Set<string>();
        for (const block of text.split(/<(?:\w+:)?infoTable>/i).slice(1)) {
          if (/<(?:\w+:)?putCall>\s*\w/i.test(block)) continue; // option position
          const c = block.match(/<(?:\w+:)?cusip>\s*([0-9A-Za-z]{9})\s*</i)?.[1]?.toUpperCase();
          if (c) cusips.add(c);
        }
        // Filings for other quarters (late filers) are recorded but not counted.
        appendFileSync(progress, `${f.path}\t${filedFor}\t${[...cusips].join(",")}\n`);
      } catch {
        failed++;
      }
      await sleep(400); // 3 workers x 2.5/s: well under SEC's 10 requests a second
    }
  };
  const timer = setInterval(() => console.log(`  ${Math.min(i, todo.length)} / ${todo.length}`), 60_000);
  await Promise.all([worker(), worker(), worker()]);
  clearInterval(timer);

  // 3. Count funds per CUSIP for this quarter, in the bundles' format.
  const counts: Record<string, number> = {};
  let n = 0;
  for (const l of readFileSync(progress, "utf8").split("\n")) {
    const [, filedFor, list] = l.split("\t");
    if (filedFor !== period || !list) continue;
    n++;
    for (const c of list.split(",")) counts[c] = (counts[c] ?? 0) + 1;
  }
  for (const [c, k] of Object.entries(counts)) if (k < 5) delete counts[c];
  const today = new Date().toISOString().slice(0, 10);
  const complete = today > new Date(new Date(deadline).getTime() + 2 * DAY).toISOString().slice(0, 10);
  writeFileSync(`${DIR}/${period}.counts.json`, JSON.stringify({ period, fetched: today, deadline, complete, filings: n, counts }));
  console.log(`${n} filings for ${period} counted (${failed} failed, rerun to retry). ${complete ? "Complete: past the deadline." : `NOT complete until after ${deadline}: rerun then.`}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
