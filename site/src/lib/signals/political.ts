// Political trades: stock transactions reported by members of the House
// under the STOCK Act, straight from the Clerk's official disclosure site.
//
// How it works: the Clerk publishes a yearly index (a ZIP with one row per
// filing) and each Periodic Transaction Report (PTR) as a PDF. We take the
// PTRs filed in the last WINDOW_DAYS, pull the text out of each PDF, and
// parse the transaction rows. Everything here is deterministic — no AI —
// and every trade links to the PDF it came from.
//
// Not covered: the Senate (its site needs a session cookie and an agreement
// click per visit) and PTRs filed on paper and scanned (no text layer).
import { unzipSync } from "fflate";
import { getCompanyProfile, resolveTicker, resolveTickerNames } from "@/lib/edgar";
import { getRedis } from "@/lib/kv";
import { SECTOR_KEYS, SECTORS, type SectorKey } from "@/lib/sectors";
import { loadMembers, oversightOverlap, sectorFromSic, senatorKey, type MemberInfo, type Members } from "./committees";
import { fetchSenateTrades } from "./senate";
import { loadBars, sinceDate } from "./performance";
import type { PoliticalTrade, Signal, SignalBatch } from "./types";

const USER_AGENT = "finance-portfolio ethanbiancardi@gmail.com";
const CLERK = "https://disclosures-clerk.house.gov";
// Three months: long enough for the same name to show up across several
// members' filings, which is the only pattern worth reading in data that
// arrives weeks late.
export const WINDOW_DAYS = 90;
// Bound the work per run: the most recent filings first.
const MAX_FILINGS_PER_RUN = 250;
const PDF_CONCURRENCY = 6;
const KEY = "signals:political";

type IndexRow = { last: string; first: string; prefix: string; district: string; filingDate: string; docId: string };

// --- 1. The Clerk's yearly index --------------------------------------------
async function fetchPtrIndex(year: number): Promise<IndexRow[]> {
  const res = await fetch(`${CLERK}/public_disc/financial-pdfs/${year}FD.zip`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Clerk index ${year} failed (${res.status})`);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const txt = files[`${year}FD.txt`];
  if (!txt) throw new Error(`Clerk index ${year} has no ${year}FD.txt`);
  const lines = new TextDecoder("latin1").decode(txt).split(/\r?\n/).filter(Boolean);
  const header = lines[0].split("\t");
  const col = (name: string) => header.indexOf(name);
  const [iPrefix, iLast, iFirst, iType, iDist, iDate, iDoc] = ["Prefix", "Last", "First", "FilingType", "StateDst", "FilingDate", "DocID"].map(col);
  return lines
    .slice(1)
    .map((l) => l.split("\t"))
    .filter((c) => c[iType] === "P") // P = Periodic Transaction Report
    .map((c) => ({
      prefix: c[iPrefix] ?? "",
      last: c[iLast] ?? "",
      first: c[iFirst] ?? "",
      district: c[iDist] ?? "",
      filingDate: toIso(c[iDate] ?? ""),
      docId: c[iDoc] ?? "",
    }))
    .filter((r) => r.docId && r.filingDate);
}

// "9/17/2026" -> "2026-09-17"
function toIso(mdy: string): string {
  const m = mdy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

// --- 2. One PTR PDF -> transaction rows ---------------------------------------
async function fetchPtrText(year: number, docId: string): Promise<string> {
  const res = await fetch(`${CLERK}/public_disc/ptr-pdfs/${year}/${docId}.pdf`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PTR ${docId} failed (${res.status})`);
  // pdf-parse's package entry runs a debug block that reads a test fixture
  // at import time and crashes under a bundler — import the library file.
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const parsed = await pdfParse(Buffer.from(await res.arrayBuffer()));
  return parsed.text;
}

// The text layer of a PTR lays each transaction out as:
//   [SP|JT|DC]<asset name, possibly wrapped over two lines> (TICKER) [ST]
//   <P|S|S (partial)|E><MM/DD/YYYY><MM/DD/YYYY><$1,001 - $15,000>
//   F S : New            <- filing status line
//   S O : <account name> <- subholding line
// The owner code is glued to the start of the asset name — which may be a
// line or two above the ticker — so each match looks back over the text
// since the previous match to find it.
const ROW = /\(([A-Z][A-Z.\-]{0,6})\)\s*\[ST\]\s*\n?(P|S \(partial\)|S|E)(\d{2}\/\d{2}\/\d{4})(\d{2}\/\d{2}\/\d{4})(\$[\d,]+ -\s*\$[\d,]+|Over \$[\d,]+)/g;
const NOISE = /^(F\s+S\s+:|S\s+O\s+:|\* For the complete|Filing ID|IDOwnerAsset|Type$|DateNotification|Date$|AmountCap\.|Gains >|\$200\?)/;

export function parsePtrText(text: string): { ticker: string; amended: boolean; owner: PoliticalTrade["owner"]; type: PoliticalTrade["type"]; partial: boolean; tradeDate: string; notificationDate: string; amountRange: string }[] {
  const rows = [];
  let prevEnd = 0;
  // The form's small-caps headings come through with NUL bytes where the
  // spacing was; normalise them so the noise filter can see the lines.
  text = text.replace(/\u0000+/g, " ");
  for (const m of text.matchAll(ROW)) {
    const [, ticker, typeCode, trade, notified, amount] = m;
    // Asset-name block: everything since the last row, minus form chrome.
    const nameLines = text
      .slice(prevEnd, m.index)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !NOISE.test(l));
    const ownerCode = nameLines[0]?.match(/^(SP|JT|DC)(?=[A-Z])/)?.[1];
    prevEnd = m.index! + m[0].length;
    const amended = /^\s*F\s+S\s+:\s*Amended/m.test(text.slice(prevEnd, prevEnd + 60));
    rows.push({
      ticker,
      amended,
      owner: ownerCode === "SP" ? "spouse" : ownerCode === "JT" ? "joint" : ownerCode === "DC" ? "child" : "self",
      type: typeCode.startsWith("S") ? "sell" : typeCode === "E" ? "exchange" : "buy",
      partial: typeCode === "S (partial)",
      tradeDate: toIso(trade),
      notificationDate: toIso(notified),
      amountRange: amount.replace(/\s+/g, " "),
    } as const);
  }
  return rows;
}


// --- 3. Refresh: index -> PDFs -> per-ticker signals -> Redis ----------------
export async function refreshPoliticalSignals(now = new Date()): Promise<SignalBatch> {
  const year = now.getUTCFullYear();
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  const [indexAll, members, senate] = await Promise.all([
    fetchPtrIndex(year),
    // Committee data is an enrichment — if the dataset is down, still
    // publish the trades, just without it.
    loadMembers().catch((): Members => ({ byDistrict: new Map(), bySenatorName: new Map() })),
    // The Senate site is the flakier of the two; a failure there shouldn't
    // sink the House batch.
    fetchSenateTrades(since).catch((err: unknown) => ({ trades: [] as PoliticalTrade[], stats: { reports: 0, electronic: 0, paper: 0, failed: 0, unparseable: 0, error: err instanceof Error ? err.message : String(err) } })),
  ]);
  const index = indexAll
    .filter((r) => r.filingDate >= since)
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate))
    .slice(0, MAX_FILINGS_PER_RUN);

  const trades: PoliticalTrade[] = [];
  let unparseable = 0;
  let failed = 0;
  // Fetch PDFs a few at a time; a bad one shouldn't sink the batch.
  for (let i = 0; i < index.length; i += PDF_CONCURRENCY) {
    const chunk = index.slice(i, i + PDF_CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((r) => fetchPtrText(year, r.docId)));
    results.forEach((res, j) => {
      const row = chunk[j];
      if (res.status === "rejected") {
        failed++;
        return;
      }
      const parsed = parsePtrText(res.value);
      if (parsed.length === 0) {
        unparseable++; // scanned/handwritten PTR, or an asset type we don't read (options, bonds)
        return;
      }
      const member = `${row.prefix ? row.prefix + " " : ""}${row.first} ${row.last}`.trim();
      const info = members.byDistrict.get(row.district);
      for (const t of parsed) {
        trades.push({
          ticker: t.ticker,
          member,
          chamber: "House",
          district: row.district,
          party: info?.party,
          committees: info?.committees.map((c) => c.name),
          owner: t.owner,
          type: t.type,
          partial: t.partial,
          tradeDate: t.tradeDate,
          disclosureDate: row.filingDate,
          lagDays: daysBetween(t.tradeDate, row.filingDate),
          amountRange: t.amountRange,
          amended: t.amended,
          filingId: row.docId,
          filingUrl: `${CLERK}/public_disc/ptr-pdfs/${year}/${row.docId}.pdf`,
        });
      }
    });
  }

  // Senate trades: attach party, state, committees by name, then merge.
  for (const t of senate.trades) {
    const parts = t.member.replace(/^Sen\. /, "").split(" ");
    const info = members.bySenatorName.get(senatorKey(parts[0], parts[parts.length - 1]));
    if (info) {
      t.party = info.party;
      t.district = info.state;
      t.committees = info.committees.map((c) => c.name);
    }
    trades.push(t);
  }

  // Group by ticker; keep only tickers SEC knows (drops mis-parses).
  const byTicker = new Map<string, PoliticalTrade[]>();
  for (const t of trades) byTicker.set(t.ticker, [...(byTicker.get(t.ticker) ?? []), t]);
  const names = await resolveTickerNames([...byTicker.keys()]);
  const sectors = await classifySectors([...byTicker.keys()].filter((tk) => names.has(tk)));

  const knownTickers = [...byTicker.keys()].filter((tk) => names.has(tk));
  const bars = await loadBars(knownTickers, WINDOW_DAYS + 20);

  const items: Signal[] = knownTickers
    .map((ticker) => {
      const ts = byTicker.get(ticker)!;
      const signal = buildSignal(ticker, names.get(ticker)!, ts, members, sectors.get(ticker) ?? { sector: null, industry: null });
      // Price since each trade, and since the latest one for the card.
      for (const t of signal.trades ?? []) t.sincePct = sinceDate(bars.get(ticker), t.tradeDate)?.pct ?? null;
      const since = sinceDate(bars.get(ticker), signal.eventDate);
      signal.sinceTrade = since ? { pct: since.pct, from: since.from, asOf: since.asOf } : null;
      signal.conviction = scoreConviction(signal);
      return signal;
    })
    // Conviction first, then most recently disclosed.
    .sort((a, b) => (b.conviction?.score ?? 0) - (a.conviction?.score ?? 0) || latestDisclosure(b) .localeCompare(latestDisclosure(a)));

  // Amended re-filings of old trades would swamp the median; measure the
  // lag on original filings.
  const lags = trades.filter((t) => !t.amended).map((t) => t.lagDays).sort((a, b) => a - b);
  const batch: SignalBatch = {
    category: "political",
    generatedAt: now.toISOString(),
    windowDays: WINDOW_DAYS,
    items,
    stats: {
      filingsScanned: index.length,
      filingsUnparseable: unparseable,
      filingsFailed: failed,
      tradesParsed: trades.length,
      tickers: items.length,
      medianLagDays: lags.length ? lags[Math.floor(lags.length / 2)] : 0,
      medianLagHouse: medianLag(trades.filter((t) => t.chamber === "House")),
      medianLagSenate: medianLag(trades.filter((t) => t.chamber === "Senate")),
      tickersWithPrices: knownTickers.filter((t) => bars.has(t)).length,
      chambers: "House + Senate",
      senateReports: senate.stats.reports,
      senateElectronic: senate.stats.electronic,
      senatePaperSkipped: senate.stats.paper,
      senateTrades: senate.trades.length,
      houseTrades: trades.length - senate.trades.length,
      ...("error" in senate.stats ? { senateError: String(senate.stats.error) } : {}),
      membersWithCommittees: members.byDistrict.size + members.bySenatorName.size,
      tickersWithSector: [...sectors.values()].filter((c) => c.sector).length,
      withOversightOverlap: items.filter((i) => i.oversight && i.oversight.length > 0).length,
    },
  };
  await getRedis().set(KEY, batch);
  return batch;
}

export async function getPoliticalSignals(): Promise<SignalBatch | null> {
  return (await getRedis().get<SignalBatch>(KEY)) ?? null;
}

// Per-chamber, original filings only — one senator's 400-trade late filing
// shouldn't read as "Congress discloses four months late".
function medianLag(ts: PoliticalTrade[]): number {
  const lags = ts.filter((t) => !t.amended).map((t) => t.lagDays).sort((a, b) => a - b);
  return lags.length ? lags[Math.floor(lags.length / 2)] : 0;
}

function latestDisclosure(s: Signal): string {
  return (s.trades ?? []).reduce((m, t) => (t.disclosureDate > m ? t.disclosureDate : m), "");
}

// Conviction: how many distinct members bought minus how many sold, with a
// bonus for buying with no sales at all and for a committee overlap. A
// score of 3+ means several people with some connection to the industry
// independently bought the same name over the window.
function scoreConviction(s: Signal): { score: number; label: string } {
  const ts = s.trades ?? [];
  const buyers = new Set(ts.filter((t) => t.type === "buy").map((t) => t.member));
  const sellers = new Set(ts.filter((t) => t.type === "sell").map((t) => t.member));
  const overlap = (s.oversight?.length ?? 0) > 0;
  let score = buyers.size - sellers.size;
  if (buyers.size > 0 && sellers.size === 0) score += 1;
  if (sellers.size > 0 && buyers.size === 0) score -= 1;
  if (overlap) score += 2;
  const parts: string[] = [];
  if (buyers.size >= 2 && sellers.size === 0) parts.push(`${buyers.size} members buying, none selling`);
  else if (buyers.size >= 1 && sellers.size === 0) parts.push("buying only");
  else if (sellers.size >= 2 && buyers.size === 0) parts.push(`${sellers.size} members selling, none buying`);
  else if (sellers.size >= 1 && buyers.size === 0) parts.push("selling only");
  else parts.push("mixed");
  if (overlap) parts.push("committee overlap");
  return { score, label: parts.join(" · ") };
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

// The reasoning is factual and template-built: who, what, when, how late.
// No inference about motive — that's the reader's job, and the risk line
// says why the inference is usually weaker than it looks.
// Sector for the overlap check: the curated universe is classified by hand;
// everything else from SEC's industry description (one cached submissions
// fetch per ticker, a few at a time to respect SEC's rate limit).
const SECTOR_OF = new Map<string, SectorKey>();
for (const key of SECTOR_KEYS) for (const t of SECTORS[key].tickers) if (!SECTOR_OF.has(t)) SECTOR_OF.set(t, key);

type Classified = { sector: SectorKey | null; industry: string | null };

async function classifySectors(tickers: string[]): Promise<Map<string, Classified>> {
  const out = new Map<string, Classified>();
  for (let i = 0; i < tickers.length; i += 5) {
    await Promise.all(
      tickers.slice(i, i + 5).map(async (t) => {
        let industry: string | null = null;
        try {
          const company = await resolveTicker(t);
          if (company) industry = (await getCompanyProfile(company.cik)).sicDescription;
        } catch {
          // no industry text — the hand-classified sector still applies
        }
        const sector = SECTOR_OF.get(t) ?? sectorFromSic(industry);
        if (sector || industry) out.set(t, { sector, industry });
      }),
    );
  }
  return out;
}

function buildSignal(ticker: string, company: string, ts: PoliticalTrade[], members: Members, { sector, industry }: Classified): Signal {
  const buys = ts.filter((t) => t.type === "buy");
  const sells = ts.filter((t) => t.type === "sell");
  const exchanges = ts.filter((t) => t.type === "exchange");
  const latest = ts.reduce((m, t) => (t.tradeDate > m ? t.tradeDate : m), ts[0].tradeDate);
  const lead =
    buys.length === 0 && sells.length === 0
      ? "exchanges only"
      : buys.length > sells.length
        ? "net buying"
        : sells.length > buys.length
          ? "net selling"
          : "mixed buying and selling";
  const memberNames = [...new Set(ts.map((t) => t.member))];
  const who = memberNames.length === 1 ? `${memberNames[0]}${ts[0].district ? ` (${ts[0].district})` : ""}` : `${memberNames.length} members (${memberNames.slice(0, 3).join(", ")}${memberNames.length > 3 ? ", …" : ""})`;
  // Amended re-filings of old trades would swamp the average; use the
  // original filings when there are any.
  const lagPool = ts.some((t) => !t.amended) ? ts.filter((t) => !t.amended) : ts;
  const lag = Math.round(lagPool.reduce((s, t) => s + t.lagDays, 0) / lagPool.length);

  // Committee overlap: which trading members sit on a committee that
  // oversees this company's sector.
  const overlapMap = new Map<string, Set<string>>();
  const memberInfos = new Map<string, MemberInfo>();
  for (const t of ts) {
    const info =
      t.chamber === "House"
        ? members.byDistrict.get(t.district)
        : (() => {
            const parts = t.member.replace(/^Sen\. /, "").split(" ");
            return members.bySenatorName.get(senatorKey(parts[0], parts[parts.length - 1]));
          })();
    if (info) memberInfos.set(info.bioguide, info);
  }
  for (const info of memberInfos.values()) {
    for (const c of oversightOverlap(info.committees, sector, industry)) {
      overlapMap.set(c.name, (overlapMap.get(c.name) ?? new Set()).add(info.name));
    }
  }
  const oversight = [...overlapMap.entries()].map(([committee, ms]) => ({ committee, members: [...ms] }));
  const committeeNote = oversight.length
    ? ` Oversight overlap: ${oversight.map((o) => `${o.members.join(" and ")} ${o.members.length === 1 ? "sits" : "sit"} on ${o.committee}`).join("; ")}, the committee whose jurisdiction covers ${SECTORS[sector!].label.toLowerCase()}.`
    : "";

  const reasoning =
    `${who} reported ${ts.length} ${ts.length === 1 ? "transaction" : "transactions"} in ${company} (${ticker}), ` +
    `${buys.length} ${buys.length === 1 ? "buy" : "buys"}, ${sells.length} ${sells.length === 1 ? "sale" : "sales"}${exchanges.length ? `, ${exchanges.length} ${exchanges.length === 1 ? "exchange" : "exchanges"}` : ""}, ${lead}. ` +
    `Trades were made between ${ts.map((t) => t.tradeDate).sort()[0]} and ${latest} and disclosed an average of ${lag} days later${ts.some((t) => t.amended) ? " (one or more are amended re-filings of earlier reports)" : ""}. ` +
    `Amounts are reported in ranges (${[...new Set(ts.map((t) => t.amountRange))].join("; ")}); ` +
    `${ts.some((t) => t.owner !== "self") ? "some trades were in a spouse's or joint account" : "all trades were in the member's own name"}.` +
    committeeNote;

  const bullCase =
    oversight.length
      ? `A member of ${oversight[0].committee} trading a company that committee oversees is the specific pattern the STOCK Act was written about. Look for pending bills, hearings, or agency actions in that committee's jurisdiction around the trade dates.`
      : lead === "net buying"
      ? "Members sometimes sit on committees that oversee the industries they buy into, and a cluster of buys across several members has occasionally preceded strong runs. If you can find a committee link or a pending bill, that's the lead worth researching."
      : lead === "net selling"
        ? "Clustered selling by insiders-adjacent people can flag a sector others aren't worried about yet. Worth checking what changed for the business around the trade dates."
        : "Members trading both directions in the same name usually signals portfolio housekeeping; the lead is the name itself getting attention, not the direction.";
  const risk =
    "The STOCK Act allows 45 days before a trade must be disclosed, so by the time you see this the move may be over. Most congressional trades are made by advisors or spouses under managed accounts, sizes are small ranges, and studies find members as a group don't reliably beat the market. Treat this as a prompt to research the company, not as a signal in itself.";

  return {
    id: `political-${ticker}`,
    category: "political",
    ticker,
    company,
    eventDate: latest,
    reasoning,
    bullCase,
    risk,
    sources: [
      ...[...new Set(ts.map((t) => t.filingUrl))].map((url) => {
        const t = ts.find((x) => x.filingUrl === url)!;
        return { label: `PTR, ${t.member}, filed ${t.disclosureDate} (${t.chamber === "Senate" ? "official filing" : "official PDF"})`, url };
      }),
      { label: "House Clerk financial disclosures", url: `${CLERK}/FinancialDisclosure` },
      ...(ts.some((t) => t.chamber === "Senate") ? [{ label: "Senate electronic financial disclosures", url: "https://efdsearch.senate.gov/search/" }] : []),
    ],
    trades: ts.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)),
    oversight,
  };
}
