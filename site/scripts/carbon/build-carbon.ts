// Builds public/data/carbon.json for the Carbon Intensity page from:
//   .ml-cache/carbon/ghgrp-YYYY.json   EPA facility emissions (scripts/carbon/fetch-ghgrp.ts)
//   .ml-cache/sp500/fundamentals.json  revenue + operating margin per company
//                                      (scripts/ml/fetch-data.ts --universe sp500)
//   SEC's ticker file                  company names, to match EPA parent names
//
// Steps:
//   1. Each facility's emissions are split between its parent companies by
//      ownership share ("Duke Energy (60%); Xcel (40%)") and added up per parent.
//   2. Parent names are matched to S&P 500 companies: by normalised name
//      ("NUCOR CORPORATION" -> "NUCOR"), else by the ALIASES table below.
//   3. Each company gets its revenue and operating income for the same year.
//
// Carbon intensity (computed on the page) = metric tons CO2e / $1M revenue.
// What it covers: US facilities only, 25,000+ t/yr, direct (Scope 1)
// emissions only. Not the electricity a company buys (Scope 2) or what its
// customers emit using its products (Scope 3).
//
// Usage, from site/:  npx tsx scripts/carbon/build-carbon.ts [--unmatched]
//   --unmatched  list the biggest parent companies that matched no ticker

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolveTickerNames } from "../../src/lib/edgar";
import sp500 from "../../src/lib/ml/sp500.json";
import { YEARS, type YearData } from "./fetch-ghgrp";

// EPA parent name (normalised) -> ticker, where the names don't line up on
// their own. Checked by hand against each company's 10-K.
// Only companies that owned the facilities in that year: Marathon Oil's 2023
// emissions are not ConocoPhillips' (bought in 2024), nor WestRock's Smurfit
// WestRock's (merged 2024).
const ALIASES: Record<string, string> = {
  "VISTRA ENERGY": "VST", // renamed Vistra Corp in 2020
  "EXXON MOBIL": "XOM", // SEC lists the parent as ExxonMobil Holdings Corp
  PRAXAIR: "LIN", // merged into Linde plc in 2018
  "LINDE GAS NORTH AMERICA": "LIN",
  "SEMPRA ENERGY": "SRE", // renamed Sempra in 2023
  "LYONDELLBASELL INDUSTRIES": "LYB",
  MPLX: "MPC", // Marathon Petroleum controls and consolidates MPLX
  "CRH AMERICAS": "CRH", // CRH plc's US arm
  APACHE: "APA", // Apache became a subsidiary of the new APA Corp holding company in 2021
  VECTREN: "CNP", // bought by CenterPoint in Feb 2019; EPA still listed Vectren for 2019
};

// Upper case, no punctuation, no legal suffixes or SEC state tags ("/TX"),
// "COS" and "COMPANIES" dropped, so "THE WILLIAMS COS INC" and "WILLIAMS
// COMPANIES, INC." both become "WILLIAMS".
const norm = (s: string) =>
  ` ${s.toUpperCase().replace(/\/[A-Z]{2,3}\b/g, " ").replace(/&/g, " AND ").replace(/[^A-Z0-9 ]/g, " ")} `
    .replace(/ (THE|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LLC|LP|L P|LTD|PLC|HOLDINGS?|GROUP|NV|SA|AG|DE|NEW|COS|COMPANIES)(?= )/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// "A (74.3%); B (14%)" -> [["A", 0.743], ["B", 0.14]]; no % means 100%.
function parents(field: string | null): [string, number][] {
  if (!field) return [];
  const parts = field.split(";").map((p) => p.trim()).filter(Boolean);
  return parts.map((p) => {
    const m = p.match(/^(.*?)\s*\(\s*([\d.]+)\s*%\s*\)\s*$/);
    return m ? [m[1].trim(), Number(m[2]) / 100] : [p, 1 / parts.length];
  });
}

type Snapshot = { known: string; revTtm: number | null; opMargin: number | null };

async function main() {
  const years = YEARS.filter((y) => existsSync(`.ml-cache/carbon/ghgrp-${y}.json`));
  if (!years.length) throw new Error("No EPA data yet: run scripts/carbon/fetch-ghgrp.ts first.");
  const data: YearData[] = years.map((y) => JSON.parse(readFileSync(`.ml-cache/carbon/ghgrp-${y}.json`, "utf8")));
  const latest = years[years.length - 1];

  // S&P 500 companies by normalised SEC name (one ticker per company).
  const stocks = (sp500 as { stocks: { symbol: string; cik: number; sector: string }[] }).stocks;
  const seenCik = new Set<number>();
  const universe = stocks.filter((s) => !seenCik.has(s.cik) && seenCik.add(s.cik));
  // SEC writes class shares with a dash (BRK-B); the S&P list uses a dot.
  const secNames = await resolveTickerNames(universe.map((s) => s.symbol.replace(".", "-")));
  const names = new Map(universe.map((s) => [s.symbol, secNames.get(s.symbol.replace(".", "-")) ?? ""] as const).filter(([, n]) => n));
  const byName = new Map<string, string>();
  for (const s of universe) {
    const n = names.get(s.symbol);
    if (n) byName.set(norm(n), s.symbol);
  }
  const tickerFor = (parent: string) => ALIASES[norm(parent)] ?? byName.get(norm(parent));

  // Emissions per parent per year, plus each matched company's facilities.
  const perParent = new Map<string, Record<number, number>>();
  const facilitiesOf = new Map<string, Map<number, { name: string; state: string; t: number }>>();
  for (const d of data) {
    for (const f of d.facilities) {
      const t = d.emissions[f.id];
      if (!t) continue;
      for (const [p, share] of parents(f.parent)) {
        const rec = perParent.get(p) ?? {};
        rec[d.year] = (rec[d.year] ?? 0) + t * share;
        perParent.set(p, rec);
        const ticker = tickerFor(p);
        if (ticker && d.year === latest) {
          const m = facilitiesOf.get(ticker) ?? new Map();
          const prev = m.get(f.id);
          m.set(f.id, { name: f.name, state: f.state, t: (prev?.t ?? 0) + t * share });
          facilitiesOf.set(ticker, m);
        }
      }
    }
  }

  // Roll parents up to tickers (several EPA spellings can map to one company).
  const emissions = new Map<string, Record<number, number>>();
  const unmatched: [string, number][] = [];
  for (const [p, rec] of perParent) {
    const ticker = tickerFor(p);
    if (!ticker) {
      unmatched.push([p, Math.max(...Object.values(rec))]);
      continue;
    }
    const e = emissions.get(ticker) ?? {};
    for (const [y, t] of Object.entries(rec)) e[Number(y)] = (e[Number(y)] ?? 0) + t;
    emissions.set(ticker, e);
  }

  if (process.argv.includes("--unmatched")) {
    unmatched.sort((a, b) => b[1] - a[1]);
    console.log("Biggest unmatched parents (largest year, million t):");
    for (const [p, t] of unmatched.slice(0, 400)) console.log(`${(t / 1e6).toFixed(2).padStart(7)}  ${p}  [${norm(p)}]`);
  }

  // Revenue and operating income for the 12 months ending around each year's
  // end: the latest snapshot known by mid-April of the next year, which for a
  // December fiscal year is that year's 10-K.
  const fundamentals: Record<string, Snapshot[]> = JSON.parse(readFileSync(".ml-cache/sp500/fundamentals.json", "utf8"));
  const yearFigures = (ticker: string, y: number) => {
    const snaps = (fundamentals[ticker] ?? []).filter((s) => s.known <= `${y + 1}-04-15` && s.known >= `${y}-10-01` && s.revTtm);
    const s = snaps[snaps.length - 1];
    // Every S&P 500 company sells well over $1B a year, so less than that is
    // a mis-tagged sub-total in the XBRL data, not real revenue (APA files
    // its total only split by segment, which the free XBRL API leaves out).
    // Better "no sales data" than an intensity that's 40x too high.
    if (!s || s.revTtm! < 1e9) return null;
    return { revenue: s.revTtm!, opIncome: s.opMargin !== null ? s.opMargin * s.revTtm! : null };
  };

  const sector = new Map(universe.map((s) => [s.symbol, s.sector]));
  const companies = [...emissions]
    .filter(([, e]) => (e[latest] ?? 0) > 0)
    .map(([ticker, e]) => {
      const figures = Object.fromEntries(years.map((y) => [y, yearFigures(ticker, y)]));
      const facilities = [...(facilitiesOf.get(ticker)?.values() ?? [])].sort((a, b) => b.t - a.t);
      return {
        ticker,
        name: names.get(ticker) ?? ticker,
        sector: sector.get(ticker) ?? "Other",
        facilityCount: facilities.length,
        topFacilities: facilities.slice(0, 3).map((f) => ({ name: f.name, state: f.state, tons: Math.round(f.t) })),
        emissions: Object.fromEntries(years.map((y) => [y, Math.round(e[y] ?? 0)])),
        revenue: Object.fromEntries(years.map((y) => [y, figures[y] ? Math.round(figures[y]!.revenue) : null])),
        opIncome: Object.fromEntries(years.map((y) => [y, figures[y]?.opIncome != null ? Math.round(figures[y]!.opIncome!) : null])),
      };
    })
    .sort((a, b) => b.emissions[latest] - a.emissions[latest]);

  const out = {
    generated: new Date().toISOString().slice(0, 10),
    years,
    source: "EPA Greenhouse Gas Reporting Program (direct emitters, Scope 1, US facilities over 25,000 t/yr); revenue and operating income from SEC 10-K/10-Q filings",
    companies,
  };
  writeFileSync("public/data/carbon.json", JSON.stringify(out));
  const total = companies.reduce((s, c) => s + c.emissions[latest], 0);
  const allTotal = [...perParent.values()].reduce((s, r) => s + (r[latest] ?? 0), 0);
  console.log(
    `Wrote public/data/carbon.json: ${companies.length} S&P 500 companies, ${(total / 1e6).toFixed(0)}M t in ${latest} ` +
      `(${((total / allTotal) * 100).toFixed(0)}% of all reported direct emissions), ${companies.filter((c) => c.revenue[latest]).length} with revenue`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
