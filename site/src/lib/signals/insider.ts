// Insider buying: executives and directors of the companies in the curated
// universe (lib/sectors.ts) buying their own company's stock on the open
// market, from the Form 4s they must file with the SEC within two business
// days of trading. Feeds the Signal Trader's score (lib/signalTrader.ts).
//
// Only open-market purchases count (transaction code "P"). Insiders sell
// for all sorts of reasons (taxes, diversifying, a house) and receive stock
// as pay all the time, but they buy with their own cash for one reason.
// Purchases made under a pre-arranged 10b5-1 trading plan are left out:
// those were scheduled months ahead, so they say little about today.
//
// Refreshed nightly by api/cron/daily. Each run lists every Form 4 the
// universe's companies filed in the last WINDOW_DAYS (one submissions
// request per company) and reads only the ones it hasn't seen before, so
// after the first run it's a few dozen small XML files a night.
import { resolveTicker, secFetch } from "@/lib/edgar";
import { getRedis } from "@/lib/kv";
import { SECTOR_KEYS, SECTORS } from "@/lib/sectors";

const KEY = "signals:insider";
export const INSIDER_WINDOW_DAYS = 60;
// SEC's fair-access limit is 10 requests a second: WORKERS requests in
// flight, each worker pausing GAP_MS between its own, stays under it.
const WORKERS = 4;
const GAP_MS = 450;
// New Form 4s read per run. ~17 are filed a day across the universe, so this
// only binds on the first run, which then finishes on the next.
const MAX_NEW_PER_RUN = 1200;
// A request SEC hasn't answered by now is dropped and retried next run.
const TIMEOUT_MS = 15_000;

export type InsiderBuy = {
  ticker: string;
  insider: string; // as filed, e.g. "SMITH BRADFORD L"
  role: string; // officer title, or "Director" / "10% owner"
  topOfficer: boolean; // CEO, CFO or President
  date: string; // transaction date, YYYY-MM-DD
  shares: number;
  price: number;
  value: number; // shares × price, in dollars
  filed: string; // filing date, YYYY-MM-DD
  url: string; // the filing on sec.gov
};

export type InsiderBatch = {
  generatedAt: string;
  windowDays: number;
  buys: InsiderBuy[];
  // Accession numbers already read, so the next run skips them. Only those
  // still inside the window are kept.
  seen: string[];
  stats: Record<string, number | string>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Runs `fn` over `items` with a few workers, each pacing its own requests.
async function paced<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]).then(
          (value) => ({ status: "fulfilled", value }) as const,
          (reason) => ({ status: "rejected", reason }) as const,
        );
        await sleep(GAP_MS);
      }
    }),
  );
  return out;
}

// The first <value> inside a tag, e.g. <transactionCode>P</transactionCode>
// or <transactionShares><value>100</value></transactionShares>.
function field(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>\\s*(?:<value>)?\\s*([^<]*?)\\s*(?:</value>)?\\s*(?:<footnoteId[^>]*/>\\s*)*</${tag}>`));
  return m ? m[1].trim() : null;
}

type Listed = { ticker: string; cik: number; accession: string; doc: string; filed: string };

// One Form 4 → the open-market purchases in it (usually none).
function parseForm4(xml: string, f: Listed): InsiderBuy[] {
  // Trades under a 10b5-1 plan: the newer forms flag the whole filing.
  if (field(xml, "aff10b5One") === "1" || field(xml, "aff10b5One") === "true") return [];
  const owner = xml.match(/<reportingOwner>[\s\S]*?<\/reportingOwner>/)?.[0] ?? "";
  const name = field(owner, "rptOwnerName") ?? "Unknown";
  const flag = (tag: string) => ["1", "true"].includes(field(owner, tag) ?? "");
  const title = field(owner, "officerTitle") ?? "";
  const role = title || (flag("isDirector") ? "Director" : flag("isTenPercentOwner") ? "10% owner" : "Insider");
  const topOfficer = /chief executive|\bceo\b|chief financial|\bcfo\b|\bpresident\b/i.test(title);
  const url = `https://www.sec.gov/Archives/edgar/data/${f.cik}/${f.accession.replace(/-/g, "")}/${f.accession}-index.htm`;

  const buys: InsiderBuy[] = [];
  for (const tx of xml.match(/<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/g) ?? []) {
    if (field(tx, "transactionCode") !== "P") continue;
    if (field(tx, "transactionAcquiredDisposedCode") !== "A") continue;
    const shares = Number(field(tx, "transactionShares"));
    const price = Number(field(tx, "transactionPricePerShare"));
    if (!(shares > 0) || !(price > 0)) continue;
    buys.push({
      ticker: f.ticker,
      insider: name,
      role,
      topOfficer,
      date: field(tx, "transactionDate") ?? f.filed,
      shares,
      price,
      value: Math.round(shares * price),
      filed: f.filed,
      url,
    });
  }
  return buys;
}

export async function refreshInsiderSignals(now = new Date()): Promise<InsiderBatch> {
  const since = new Date(now.getTime() - INSIDER_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const prev = await getRedis().get<InsiderBatch>(KEY);
  const seen = new Set(prev?.seen ?? []);
  const universe = [...new Set(SECTOR_KEYS.flatMap((k) => [...SECTORS[k].tickers]))];

  // 1. Every Form 4 each company filed inside the window.
  const listings = await paced(universe, async (ticker) => {
    // SEC writes share classes with a dash (BRK-B), the site with a dot.
    const company = (await resolveTicker(ticker)) ?? (await resolveTicker(ticker.replace(".", "-")));
    if (!company) throw new Error(`${ticker}: not an SEC filer`);
    const res = await secFetch(`https://data.sec.gov/submissions/CIK${String(company.cik).padStart(10, "0")}.json`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recent = ((await res.json()) as any).filings?.recent;
    const out: Listed[] = [];
    for (let i = 0; i < (recent?.form?.length ?? 0); i++) {
      if (recent.form[i] !== "4" || recent.filingDate[i] < since) continue;
      out.push({ ticker, cik: company.cik, accession: recent.accessionNumber[i], doc: recent.primaryDocument[i], filed: recent.filingDate[i] });
    }
    return out;
  });
  const listed = listings.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const listingFailures = listings.filter((r) => r.status === "rejected").length;

  // 2. Read the ones not seen before, newest first.
  const fresh = listed
    .filter((f) => !seen.has(f.accession))
    .sort((a, b) => b.filed.localeCompare(a.filed))
    .slice(0, MAX_NEW_PER_RUN);
  const parsed = await paced(fresh, async (f) => {
    // primaryDocument points at SEC's rendered HTML view ("xslF345X05/x.xml");
    // the raw XML sits at the same name without that folder.
    const raw = f.doc.replace(/^xslF345X\d+\//, "");
    const res = await secFetch(`https://www.sec.gov/Archives/edgar/data/${f.cik}/${f.accession.replace(/-/g, "")}/${raw}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return parseForm4(await res.text(), f);
  });
  const newBuys: InsiderBuy[] = [];
  let readFailures = 0;
  parsed.forEach((r, i) => {
    if (r.status === "fulfilled") {
      newBuys.push(...r.value);
      seen.add(fresh[i].accession);
    } else readFailures++;
  });

  // 3. Keep what's still inside the window.
  const inWindow = new Set(listed.map((f) => f.accession));
  const buys = [...(prev?.buys ?? []), ...newBuys]
    .filter((b) => b.filed >= since)
    .sort((a, b) => b.date.localeCompare(a.date));
  const batch: InsiderBatch = {
    generatedAt: now.toISOString(),
    windowDays: INSIDER_WINDOW_DAYS,
    buys,
    seen: [...seen].filter((a) => inWindow.has(a)),
    stats: {
      companies: universe.length,
      listingFailures,
      form4sInWindow: listed.length,
      readThisRun: fresh.length,
      readFailures,
      // Left for the next run when the per-run cap binds (first run only).
      leftForNextRun: Math.max(0, listed.filter((f) => !seen.has(f.accession)).length),
      buys: buys.length,
    },
  };
  await getRedis().set(KEY, batch);
  return batch;
}

export async function getInsiderSignals(): Promise<InsiderBatch | null> {
  return (await getRedis().get<InsiderBatch>(KEY)) ?? null;
}
