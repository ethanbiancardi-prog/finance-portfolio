// Institutional sponsorship: how many investment funds own each stock, every
// quarter since 2016. O'Neil's growth checklist wants "more funds buying in":
// the number of institutions holding a stock should be rising.
//
// Source: SEC Form 13F data sets (free, no key). Every fund managing $100M+
// in US stocks must file a 13F within 45 days of each quarter's end listing
// what it holds. The SEC bundles every filing into one zip per quarter.
// https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets
//
// 13F lists securities by CUSIP (a 9-character ID), not ticker, so CUSIPs are
// turned into tickers with OpenFIGI (Bloomberg's free mapping API, no key,
// 25 requests a minute). The mapping uses today's ticker; a company whose
// CUSIP changed years ago (a merger or reorganisation) has no count before
// the change, which shows up as "no data", not a zero.
//
// Counting rules: original 13F-HR holdings reports only (amendments skipped),
// stock positions only (put/call option rows skipped), each fund counted once
// per stock per quarter.
//
// Outputs
//   .ml-cache/13f/holders.json     every quarter, every stock (for backtests)
//   src/lib/institutions.json      the last 5 quarters for the Growth Stocks
//                                  screen's ~1,700 stocks (shipped with the site)
//
// Usage, from site/:  npx tsx scripts/institutions/build-institutions.ts
// First run downloads ~3 GB of zips (~40 files) into .ml-cache/13f: an hour or
// so. Later runs only fetch quarters that are new. Rerun each quarter.

import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { secFetch } from "../../src/lib/edgar";
import universe from "../../src/lib/growthUniverse.json";
import sp500 from "../../src/lib/ml/sp500.json";

const CACHE = ".ml-cache/13f";
const PAGE = "https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets";
const FIRST_FILE = "2016q2"; // filings from Apr 2016 on = holdings from Mar 2016 on
const MIN_HOLDERS = 5; // ignore CUSIPs fewer funds hold (keeps the cache small)
const MAP_MIN_HOLDERS = 20; // only look up tickers for CUSIPs this widely held
const KEEP_LIVE = 5; // quarters shipped in src/lib/institutions.json

mkdirSync(CACHE, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
const isoDate = (d: string) => {
  const [day, mon, yr] = d.trim().split("-"); // "31-MAR-2026"
  return `${yr}-${MONTHS[mon.toUpperCase()]}-${day.padStart(2, "0")}`;
};

// --- 1. Download the quarterly zips --------------------------------------------------

async function listZips(): Promise<string[]> {
  const html = await (await secFetch(PAGE)).text();
  const urls = [...html.matchAll(/href="([^"]*form13f\.zip)"/g)].map((m) => `https://www.sec.gov${m[1]}`);
  // Names are "2016q2_form13f.zip" (2013-2023) or "01mar2024-31may2024_form13f.zip" (2024 on).
  return urls.filter((u) => {
    const name = u.split("/").pop()!;
    const q = name.match(/^(\d{4})q(\d)/);
    return q ? `${q[1]}q${q[2]}` >= FIRST_FILE : true;
  });
}

async function download(url: string): Promise<string> {
  const file = `${CACHE}/${url.split("/").pop()}`;
  if (existsSync(file)) return file;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await secFetch(url);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return file;
    } catch (e) {
      if (attempt >= 3) throw e;
      await sleep(5000 * attempt);
    }
  }
}

// --- 2. Count funds per CUSIP per quarter ---------------------------------------------

type Counts = Record<string, Record<string, number>>; // period (YYYY-MM-DD) -> CUSIP -> funds

async function* lines(file: string) {
  const rl = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

async function countZip(zip: string): Promise<Counts> {
  const summary = zip.replace(/\.zip$/, ".counts.json");
  if (existsSync(summary)) return JSON.parse(readFileSync(summary, "utf8"));
  const dir = zip.replace(/\.zip$/, "");
  mkdirSync(dir, { recursive: true });
  // Windows 10+ and macOS/Linux all ship tar, which reads zips. Some years'
  // zips keep the files in a subfolder, so take the two wherever they sit.
  const inZip = execFileSync("tar", ["-tf", zip], { encoding: "utf8" }).split(/\r?\n/);
  const pick = (name: string) => inZip.find((p) => p.split("/").pop()?.toUpperCase() === name);
  const sub = pick("SUBMISSION.TSV"), info = pick("INFOTABLE.TSV");
  if (!sub || !info) throw new Error(`${zip}: no SUBMISSION/INFOTABLE inside`);
  execFileSync("tar", ["-xf", zip, "-C", dir, sub, info]);
  const subFile = `${dir}/${sub}`, infoFile = `${dir}/${info}`;

  // Which filings are original holdings reports, and for which quarter.
  const periodOf = new Map<string, string>();
  let head: string[] | null = null;
  for await (const line of lines(subFile)) {
    const f = line.split("\t");
    if (!head) { head = f; continue; }
    const row = Object.fromEntries(head.map((h, i) => [h, f[i]]));
    if (row.SUBMISSIONTYPE === "13F-HR" && row.PERIODOFREPORT) periodOf.set(row.ACCESSION_NUMBER, isoDate(row.PERIODOFREPORT));
  }

  // Each (filing, CUSIP) pair once: a fund can list one stock on several rows.
  const seen = new Set<string>();
  const counts: Counts = {};
  let cols: Record<string, number> | null = null;
  for await (const line of lines(infoFile)) {
    const f = line.split("\t");
    if (!cols) { cols = Object.fromEntries(f.map((h, i) => [h.trim(), i])); continue; }
    const acc = f[cols.ACCESSION_NUMBER];
    const period = periodOf.get(acc);
    if (!period || f[cols.PUTCALL]?.trim()) continue;
    const cusip = f[cols.CUSIP]?.trim().toUpperCase();
    if (!cusip || cusip.length !== 9) continue;
    const key = `${acc}|${cusip}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const p = (counts[period] ??= {});
    p[cusip] = (p[cusip] ?? 0) + 1;
  }
  for (const p of Object.values(counts)) for (const [c, n] of Object.entries(p)) if (n < MIN_HOLDERS) delete p[c];
  writeFileSync(summary, JSON.stringify(counts));
  rmSync(dir, { recursive: true, force: true });
  return counts;
}

// --- 3. CUSIP -> ticker (OpenFIGI) --------------------------------------------------------

const FIGI_FILE = `${CACHE}/figi.json`;
async function mapCusips(cusips: string[]): Promise<Record<string, string | null>> {
  const map: Record<string, string | null> = existsSync(FIGI_FILE) ? JSON.parse(readFileSync(FIGI_FILE, "utf8")) : {};
  // Non-US companies (Linde, Medtronic, Chubb...) have a CINS code, a CUSIP
  // starting with a letter, which OpenFIGI only finds as ID_CINS. Older runs
  // sent them as ID_CUSIP and cached a miss, so retry those.
  const isCins = (c: string) => /^[A-Z]/.test(c);
  for (const c of Object.keys(map)) if (map[c] === null && isCins(c)) delete map[c];
  const todo = cusips.filter((c) => !(c in map));
  console.log(`OpenFIGI: ${todo.length} CUSIPs to look up (~${Math.ceil(todo.length / 250)} min)`);
  for (let i = 0; i < todo.length; i += 10) {
    const batch = todo.slice(i, i + 10);
    const body = JSON.stringify(batch.map((c) => ({ idType: isCins(c) ? "ID_CINS" : "ID_CUSIP", idValue: c, exchCode: "US" })));
    let res: Response;
    for (;;) {
      res = await fetch("https://api.openfigi.com/v3/mapping", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (res.status !== 429) break;
      await sleep(15_000); // over the free limit: wait and retry
    }
    if (!res.ok) throw new Error(`OpenFIGI ${res.status}`);
    const out = (await res.json()) as { data?: { ticker: string; securityType: string }[] }[];
    batch.forEach((c, j) => {
      const hit = out[j].data?.find((d) => /Common Stock|REIT|ADR|Ltd Part|MLP/i.test(d.securityType)) ?? out[j].data?.[0];
      map[c] = hit ? hit.ticker.replace("/", ".") : null; // "BRK/B" -> "BRK.B"
    });
    if ((i / 10) % 25 === 24) writeFileSync(FIGI_FILE, JSON.stringify(map));
    await sleep(2500); // 25 requests a minute without a key
  }
  writeFileSync(FIGI_FILE, JSON.stringify(map));
  return map;
}

// --- Main -------------------------------------------------------------------------------------

async function main() {
const zips = await listZips();
console.log(`${zips.length} quarterly files from ${FIRST_FILE} on`);
const all: Counts = {};
for (const url of zips) {
  const zip = await download(url);
  const counts = await countZip(zip);
  // A quarter's late filers land in the next file: add them up.
  for (const [period, p] of Object.entries(counts)) {
    const t = (all[period] ??= {});
    for (const [c, n] of Object.entries(p)) t[c] = (t[c] ?? 0) + n;
  }
  console.log(`  ${url.split("/").pop()}: ${Object.keys(counts).length} quarters`);
}

// A newer quarter read straight from EDGAR (fetch-13f-edgar.ts), used only if
// it's complete (past the filing deadline) and no bundle covers it yet.
const edgarDir = `${CACHE}/edgar`;
if (existsSync(edgarDir)) {
  for (const f of readdirSync(edgarDir).filter((x) => x.endsWith(".counts.json"))) {
    const e = JSON.parse(readFileSync(`${edgarDir}/${f}`, "utf8")) as { period: string; complete: boolean; filings: number; counts: Record<string, number> };
    const inBundles = Object.keys(all[e.period] ?? {}).length > 2000;
    if (inBundles) continue;
    if (!e.complete) { console.log(`EDGAR ${e.period}: not complete yet (${e.filings} filings so far), skipped`); continue; }
    all[e.period] = e.counts;
    console.log(`EDGAR ${e.period}: ${e.filings} filings added`);
  }
}

// Only quarter-end periods with a real number of filers (stray late/odd periods dropped).
const periods = Object.keys(all)
  .filter((p) => /-(03-31|06-30|09-30|12-31)$/.test(p) && Object.keys(all[p]).length > 2000)
  .sort();
// The newest quarter is only complete once its 45-day filing window has closed
// AND the SEC has published the file that covers it.
console.log(`Quarters: ${periods[0]} .. ${periods[periods.length - 1]}`);

const wanted = new Set([...universe.stocks.map((s) => s.symbol), ...sp500.stocks.map((s) => s.symbol)]);
// Look up only CUSIPs still widely held in the newest quarter: anything else
// is a company that's gone, or an old CUSIP OpenFIGI can't map anyway.
const widelyHeld = new Set<string>();
for (const [c, n] of Object.entries(all[periods[periods.length - 1]])) if (n >= MAP_MIN_HOLDERS) widelyHeld.add(c);
const figi = await mapCusips([...widelyHeld]);

// ticker -> funds per quarter. A ticker with several CUSIPs (e.g. an old
// one still reported by a few funds) takes the largest count that quarter.
const holders: Record<string, (number | null)[]> = {};
for (const [cusip, ticker] of Object.entries(figi)) {
  if (!ticker || !wanted.has(ticker)) continue;
  const row = (holders[ticker] ??= periods.map(() => null));
  periods.forEach((p, i) => {
    const n = all[p][cusip];
    if (n != null && n > (row[i] ?? 0)) row[i] = n;
  });
}
writeFileSync(`${CACHE}/holders.json`, JSON.stringify({ periods, holders }));

const last = periods.slice(-KEEP_LIVE);
const live = Object.fromEntries(Object.entries(holders).map(([t, row]) => [t, row.slice(-KEEP_LIVE)]));
writeFileSync(
  "src/lib/institutions.json",
  JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), source: "SEC Form 13F data sets", periods: last, holders: live }),
);
const missing = [...wanted].filter((t) => !holders[t]);
console.log(`Wrote ${Object.keys(holders).length} of ${wanted.size} stocks. No 13F match: ${missing.length} (${missing.slice(0, 30).join(" ")}${missing.length > 30 ? " ..." : ""})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
