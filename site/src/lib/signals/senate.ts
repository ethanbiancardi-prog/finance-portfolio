// Senate periodic transaction reports, from the official Electronic
// Financial Disclosure site (efdsearch.senate.gov). Unlike the House Clerk,
// the Senate site has no bulk index: each visit must accept its access
// agreement (which sets a session cookie), then query the search endpoint
// the site's own page uses, then open each report. Electronic PTRs are
// HTML tables and parse cleanly; paper filings are scanned images and are
// counted but skipped.
import type { PoliticalTrade } from "./types";

const BASE = "https://efdsearch.senate.gov";
const USER_AGENT = "finance-portfolio ethanbiancardi@gmail.com";
const MAX_REPORTS_PER_RUN = 60;

// Minimal cookie jar: the site needs csrftoken + sessionid carried across
// the agreement POST, the search POST, and each report GET.
class Session {
  private jar = new Map<string, string>();
  private absorb(res: Response) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      this.jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
    }
  }
  cookie(name: string) {
    return this.jar.get(name);
  }
  private headers(extra: Record<string, string> = {}) {
    return { "User-Agent": USER_AGENT, Cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "), ...extra };
  }
  async get(path: string): Promise<Response> {
    const res = await fetch(BASE + path, { headers: this.headers(), redirect: "manual", cache: "no-store" });
    this.absorb(res);
    return res;
  }
  async post(path: string, body: URLSearchParams, extra: Record<string, string> = {}): Promise<Response> {
    const res = await fetch(BASE + path, {
      method: "POST",
      body,
      headers: this.headers({ "Content-Type": "application/x-www-form-urlencoded", Referer: `${BASE}/search/home/`, ...extra }),
      redirect: "manual",
      cache: "no-store",
    });
    this.absorb(res);
    return res;
  }
}

async function openSession(): Promise<Session> {
  const s = new Session();
  const home = await s.get("/search/home/");
  const csrf = (await home.text()).match(/name="csrfmiddlewaretoken" value="([^"]+)"/)?.[1];
  if (!csrf) throw new Error("Senate EFD: no CSRF token on the agreement page");
  const agree = await s.post("/search/home/", new URLSearchParams({ csrfmiddlewaretoken: csrf, prohibition_agreement: "1" }));
  if (agree.status !== 302 || !s.cookie("sessionid")) throw new Error(`Senate EFD: agreement not accepted (${agree.status})`);
  return s;
}

type Report = { first: string; last: string; href: string; filedDate: string; title: string };

// The DataTables endpoint behind the search page. report_types 11 = PTR,
// filer_types 1 = Senator.
async function listPtrs(s: Session, since: Date): Promise<Report[]> {
  const mdy = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()} 00:00:00`;
  const form = new URLSearchParams({
    draw: "1",
    "columns[0][data]": "0",
    "order[0][column]": "4",
    "order[0][dir]": "desc",
    start: "0",
    length: String(MAX_REPORTS_PER_RUN),
    "search[value]": "",
    report_types: "[11]",
    filer_types: "[1]",
    submitted_start_date: mdy(since),
    submitted_end_date: "",
    candidate_state: "",
    senator_state: "",
    office_id: "",
    first_name: "",
    last_name: "",
  });
  const res = await s.post("/search/report/data/", form, {
    "X-CSRFToken": s.cookie("csrftoken") ?? "",
    "X-Requested-With": "XMLHttpRequest",
    Accept: "application/json",
  });
  if (!res.ok) throw new Error(`Senate EFD search failed (${res.status})`);
  const json = (await res.json()) as { data?: string[][] };
  return (json.data ?? []).map((r) => ({
    first: r[0].trim(),
    last: r[1].trim(),
    href: r[3].match(/href="([^"]+)"/)?.[1] ?? "",
    title: r[3].replace(/<[^>]+>/g, "").trim(),
    filedDate: toIso(r[4].trim()),
  }));
}

function toIso(mdy: string): string {
  const m = mdy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : "";
}

const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#35;/g, "#").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// Electronic PTR page: one table with
//   # | Transaction Date | Owner | Ticker | Asset Name | Asset Type | Type | Amount | Comment
export function parseSenatePtrHtml(html: string): { ticker: string; owner: PoliticalTrade["owner"]; type: PoliticalTrade["type"]; partial: boolean; tradeDate: string; amountRange: string; assetType: string }[] {
  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0];
  if (!table) return [];
  const out = [];
  for (const m of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => strip(c[1]));
    if (cells.length < 8) continue;
    const [, date, owner, tickerCell, asset, assetType, type, amount] = cells;
    // Ticker column is often "--" with the symbol only in the asset name.
    const ticker = (tickerCell !== "--" ? tickerCell : asset.match(/\(([A-Z][A-Z.\-]{0,6})\)/)?.[1] ?? "").toUpperCase();
    if (!ticker || !/^[A-Z][A-Z.\-]{0,6}$/.test(ticker)) continue;
    if (!/^Stock$/i.test(assetType)) continue; // options, bonds, funds: not what the section is about
    out.push({
      ticker,
      owner: /spouse/i.test(owner) ? "spouse" : /joint/i.test(owner) ? "joint" : /child/i.test(owner) ? "child" : "self",
      type: /^Purchase/i.test(type) ? "buy" : /^Sale/i.test(type) ? "sell" : "exchange",
      partial: /Partial/i.test(type),
      tradeDate: toIso(date),
      amountRange: amount.replace(/\s+/g, " "),
      assetType,
    } as const);
  }
  return out;
}

export type SenateResult = { trades: PoliticalTrade[]; stats: { reports: number; electronic: number; paper: number; failed: number; unparseable: number } };

export async function fetchSenateTrades(since: string): Promise<SenateResult> {
  const s = await openSession();
  const reports = await listPtrs(s, new Date(since));
  const stats = { reports: reports.length, electronic: 0, paper: 0, failed: 0, unparseable: 0 };
  const trades: PoliticalTrade[] = [];

  for (const r of reports) {
    if (!r.href.includes("/ptr/")) {
      stats.paper++; // /search/view/paper/... — scanned, no table
      continue;
    }
    stats.electronic++;
    let html: string;
    try {
      const res = await s.get(r.href);
      if (!res.ok) throw new Error(String(res.status));
      html = await res.text();
    } catch {
      stats.failed++;
      continue;
    }
    const rows = parseSenatePtrHtml(html);
    if (rows.length === 0) {
      stats.unparseable++;
      continue;
    }
    const member = `Sen. ${r.first} ${r.last}`;
    const filingId = r.href.match(/\/ptr\/([0-9a-f-]+)\//)?.[1] ?? r.href;
    for (const t of rows) {
      trades.push({
        ticker: t.ticker,
        member,
        chamber: "Senate",
        district: "", // filled in from the legislators dataset (state)
        owner: t.owner,
        type: t.type,
        partial: t.partial,
        tradeDate: t.tradeDate,
        disclosureDate: r.filedDate,
        lagDays: Math.round((new Date(r.filedDate).getTime() - new Date(t.tradeDate).getTime()) / 86_400_000),
        amountRange: t.amountRange,
        amended: /amend/i.test(r.title),
        filingId,
        filingUrl: BASE + r.href,
      });
    }
  }
  return { trades, stats };
}
