// Presidential trades: securities transactions disclosed by the President on
// OGE Form 278-T, aggregated from Open Cabinet's extraction of the official
// PDFs (open-cabinet.org — public-domain filings, credit requested).
//
// The filings run to thousands of trades in trustee-managed accounts, so
// listing them is useless; instead we take the most recent filing and rank
// tickers by estimated net dollars bought and sold, using the midpoint of
// each disclosed range. Every aggregate links to the filing it came from.
import { resolveTickerNames } from "@/lib/edgar";
import { getRedis } from "@/lib/kv";
import type { PresidentialAggregate, PresidentialBatch } from "./types";

const CSV_URL = "https://open-cabinet.org/data/all-transactions.csv";
const KEY = "signals:presidential";
const TOP_N = 15;

// Tiny CSV reader — the file has quoted fields with commas inside.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// "$15,001-$50,000" -> [15001, 50000]; "Over $50,000,000" -> [5e7, 5e7]
function parseRange(s: string): [number, number] | null {
  const nums = [...s.matchAll(/\$([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, "")));
  if (nums.length === 2) return [nums[0], nums[1]];
  if (nums.length === 1) return [nums[0], nums[0]];
  return null;
}

// Filing date lives in the PDF's filename: "Donald-J-Trump-08.12.2026-278T.pdf"
function filingDateFromUrl(url: string): string | null {
  const name = decodeURIComponent(url.split("/").pop() ?? "");
  const m = name.match(/(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString()}`;

export async function refreshPresidentialSignals(now = new Date()): Promise<PresidentialBatch> {
  const res = await fetch(CSV_URL, { headers: { "User-Agent": "finance-portfolio ethanbiancardi@gmail.com" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Open Cabinet CSV failed (${res.status})`);
  const rows = parseCsv(await res.text()).filter((r) => r.length > 5 && !r[0].startsWith("#"));
  const header = rows[0];
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Open Cabinet CSV has no "${name}" column — format changed`);
    return i;
  };
  const C = {
    title: col("official_title"),
    name: col("official_name"),
    description: col("description"),
    type: col("type"),
    date: col("date"),
    range: col("amount_range"),
    late: col("late_filing"),
    url: col("source_filing_url"),
    kind: col("source_kind"),
    ticker: col("resolved_ticker"),
    tier: col("resolution_tier"),
    instrument: col("instrument_type"),
    verification: col("verificationState"),
  };

  // The sitting President's periodic (278-T) rows, whoever that is.
  const president = rows.slice(1).filter((r) => r[C.title] === "President of the United States" && r[C.kind] === "278-T");
  if (president.length === 0) throw new Error("No presidential 278-T rows in the Open Cabinet export");
  const official = president[0][C.name];

  // Most recent filing = the latest filing date in the filenames. A date can
  // carry two PDFs (the Clerk splits big filings), so group by date.
  const byFilingDate = new Map<string, string[][]>();
  for (const r of president) {
    const d = filingDateFromUrl(r[C.url]);
    if (!d) continue;
    byFilingDate.set(d, [...(byFilingDate.get(d) ?? []), r]);
  }
  const filingDate = [...byFilingDate.keys()].sort().pop()!;
  const filing = byFilingDate.get(filingDate)!;
  const filingUrls = [...new Set(filing.map((r) => r[C.url]))];

  // Aggregate per ticker.
  type Acc = { description: string; buys: number; sells: number; buyMid: number; sellMid: number; low: number; high: number; first: string; last: string };
  const byTicker = new Map<string, Acc>();
  let unresolved = 0;
  for (const r of filing) {
    const ticker = r[C.ticker];
    const range = parseRange(r[C.range]);
    if (!ticker || !range) {
      unresolved++;
      continue;
    }
    const mid = (range[0] + range[1]) / 2;
    const isBuy = r[C.type] === "Purchase";
    const a = byTicker.get(ticker) ?? { description: r[C.description], buys: 0, sells: 0, buyMid: 0, sellMid: 0, low: 0, high: 0, first: r[C.date], last: r[C.date] };
    if (isBuy) {
      a.buys++;
      a.buyMid += mid;
      a.low += range[0];
      a.high += range[1];
    } else {
      a.sells++;
      a.sellMid += mid;
      a.low -= range[1];
      a.high -= range[0];
    }
    if (r[C.date] < a.first) a.first = r[C.date];
    if (r[C.date] > a.last) a.last = r[C.date];
    byTicker.set(ticker, a);
  }

  const names = await resolveTickerNames([...byTicker.keys()]);
  const aggregates: PresidentialAggregate[] = [...byTicker.entries()].map(([ticker, a]) => ({
    ticker,
    company: names.get(ticker) ?? titleCase(a.description),
    transactions: a.buys + a.sells,
    buys: a.buys,
    sells: a.sells,
    netMid: a.buyMid - a.sellMid,
    grossBuyMid: a.buyMid,
    grossSellMid: a.sellMid,
    // Net of the range bounds: (sum of buy lows − sum of sell highs) .. (sum of buy highs − sum of sell lows).
    netLow: a.low,
    netHigh: a.high,
    firstTradeDate: a.first,
    lastTradeDate: a.last,
    sources: filingUrls.map((url, i) => ({ label: `OGE Form 278-T, filed ${filingDate}${filingUrls.length > 1 ? ` (part ${i + 1})` : ""}`, url })),
  }));

  const netPurchases = aggregates.filter((x) => x.netMid > 0).sort((x, y) => y.netMid - x.netMid).slice(0, TOP_N);
  const netSales = aggregates.filter((x) => x.netMid < 0).sort((x, y) => x.netMid - y.netMid).slice(0, TOP_N);

  const tradeDates = filing.map((r) => r[C.date]).sort();
  const lastTrade = tradeDates[tradeDates.length - 1];
  const verification = filing.reduce<Record<string, number>>((acc, r) => ((acc[r[C.verification]] = (acc[r[C.verification]] ?? 0) + 1), acc), {});

  const batch: PresidentialBatch = {
    generatedAt: now.toISOString(),
    official,
    filingDate,
    filingUrls,
    firstTradeDate: tradeDates[0],
    lastTradeDate: lastTrade,
    lagDays: Math.round((new Date(filingDate).getTime() - new Date(lastTrade).getTime()) / 86_400_000),
    netPurchases,
    netSales,
    stats: {
      rows: filing.length,
      rowsWithTicker: filing.length - unresolved,
      rowsUnresolved: unresolved,
      tickers: byTicker.size,
      lateRows: filing.filter((r) => r[C.late] === "yes").length,
      verifiedByHuman: verification.human_verified ?? 0,
      machineChecked: verification.checked ?? 0,
      grossBuyMid: fmtUsd(aggregates.reduce((s, x) => s + x.grossBuyMid, 0)),
      grossSellMid: fmtUsd(aggregates.reduce((s, x) => s + x.grossSellMid, 0)),
      filingsOnFile: byFilingDate.size,
    },
    credit: { label: "Open Cabinet, extracted from OGE filings", url: "https://open-cabinet.org/officials/trump-donald-j" },
  };
  await getRedis().set(KEY, batch);
  return batch;
}

export async function getPresidentialSignals(): Promise<PresidentialBatch | null> {
  return (await getRedis().get<PresidentialBatch>(KEY)) ?? null;
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
