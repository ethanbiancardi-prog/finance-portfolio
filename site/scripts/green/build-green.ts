// Builds public/data/green.json: a Green Score for every stock on the research
// list (lib/researchUniverse.ts), comparing each company only with the other
// companies in its own industry ("best-in-class", the way ESG funds screen).
//
// Inputs (all free, all offline):
//   public/data/carbon.json        EPA greenhouse gas, Scope 1 (scripts/carbon/)
//   .ml-cache/green/tri-YEAR.csv   EPA Toxics Release Inventory  (scripts/green/fetch-green.ts)
//   .ml-cache/green/sbti.xlsx      Science Based Targets initiative dashboard (same)
//   SEC company facts              latest annual revenue, for "per $1M of sales"
//
// Four pillars, each turned into a 0-100 percentile among industry peers
// (100 = best in the industry), then averaged with these weights:
//   Carbon intensity   35%  tons CO2e per $1M of sales (lower is better)
//   Carbon trend       15%  change in that intensity since 2019 (falling is better)
//   Toxic releases     25%  pounds of toxic chemicals released per $1M of sales
//   Climate target     25%  SBTi: approved target + net zero > approved target
//                           > promised one > none
// A pillar only counts in an industry where companies actually differ on it
// (every software company releases zero toxics, so toxics don't count there)
// and where at least 3 companies have a value. A company's score averages the
// pillars that count for it, re-weighted to add to 100%.
//
// Usage, from site/:  npx tsx scripts/green/build-green.ts [--unmatched]
//   --unmatched  list the biggest TRI parents and SBTi names that matched no
//                ticker, to check by hand

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { computeRatios, getCompanyFacts, resolveTicker } from "../../src/lib/edgar";
import sp500 from "../../src/lib/ml/sp500.json";
import { RESEARCH_SECTOR_KEYS, RESEARCH_SECTORS, RESEARCH_UNIVERSE } from "../../src/lib/researchUniverse";
import { OUT, TRI_YEAR } from "./fetch-green";
import { readXlsx } from "./xlsx";

export const WEIGHTS = { carbonIntensity: 35, carbonTrend: 15, toxics: 25, target: 25 } as const;
type PillarKey = keyof typeof WEIGHTS;

// Same normaliser as scripts/carbon/build-carbon.ts: "THE WILLIAMS COS INC"
// and "Williams Companies, Inc." both become "WILLIAMS".
const norm = (s: string) =>
  ` ${s.toUpperCase().replace(/\/[A-Z]{2,3}\b/g, " ").replace(/&/g, " AND ").replace(/[^A-Z0-9 ]/g, " ")} `
    .replace(/ (THE|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LLC|LP|L P|LTD|PLC|HOLDINGS?|GROUP|NV|SA|AG|DE|NEW|COS|COMPANIES)(?= )/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Names that don't line up on their own, checked by hand.
// TRI "standardized parent" name (normalised) -> ticker.
const TRI_ALIASES: Record<string, string> = {
  "EXXON MOBIL": "XOM",
  "LINDE": "LIN",
  "SEMPRA ENERGY": "SRE",
  MPLX: "MPC",
  APACHE: "APA",
  "3M": "MMM",
  "NEWMONT MINING": "NEM",
  "XCEL ENERGY": "XEL",
};
// SBTi company name (as SBTi writes it) -> ticker. Only US parents: Merck
// KGaA and the Coca-Cola bottlers are different companies from MRK and KO.
const SBTI_ALIASES_RAW: Record<string, string> = {
  Verizon: "VZ",
  "T-Mobile USA, Inc.": "TMUS",
  Amazon: "AMZN",
  "McDonald's Corporation": "MCD",
  "Merck & Co., Inc., Rahway, NJ USA, which is known as MSD outside the U.S. and Canada": "MRK",
  Abbott: "ABT",
  "Salesforce.com, Inc.": "CRM",
  onsemi: "ON",
  "NXP Semiconductors": "NXPI",
  "Digital Realty": "DLR",
  "Public Service Enterprise Group Inc. (PSEG)": "PEG",
};
const SBTI_ALIASES = Object.fromEntries(Object.entries(SBTI_ALIASES_RAW).map(([k, v]) => [norm(k), v]));

// Sustainability-only names need a real industry to be compared in.
const HOME_OVERRIDES: Record<string, string> = {
  KEYS: "technology", CI: "healthcare", ENSG: "healthcare", DGX: "healthcare",
  DOV: "industrials", RSG: "industrials", RGLD: "materials",
};
// The research list's "Consumer" mixes manufacturers (P&G's factories) with
// retailers and restaurants that own none, so it's split the way the S&P
// does: Staples (what people buy every week) and Discretionary.
const gicsSector = new Map((sp500 as { stocks: { symbol: string; sector: string }[] }).stocks.map((s) => [s.symbol, s.sector]));
function homeOf(ticker: string): string {
  for (const k of RESEARCH_SECTOR_KEYS) {
    if (k === "sustainability") continue;
    if (RESEARCH_SECTORS[k].tickers.includes(ticker)) {
      if (k === "consumer") return gicsSector.get(ticker) === "Consumer Staples" ? "consumerStaples" : "consumerDiscretionary";
      return k;
    }
  }
  return HOME_OVERRIDES[ticker] ?? "other";
}
const INDUSTRY_LABELS: Record<string, string> = {
  consumerStaples: "Consumer Staples",
  consumerDiscretionary: "Consumer Discretionary",
  other: "Other",
};

// Below these, a difference is too small to mean anything (Google's 0.05 t
// per $1M vs a peer's zero), so they count as zero, i.e. tied with peers.
const NEGLIGIBLE = { carbonIntensity: 1, toxics: 0.1 }; // t CO2e and lb, per $1M of sales

// A CSV line parser that handles quoted fields with commas in them.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// Percentile among peers, 0-100, 100 = best. Ties share the average rank, so
// three companies tied for best all get the same score.
function percentiles(values: Map<string, number>, higherIsBetter: boolean): Map<string, number> {
  const entries = [...values];
  const out = new Map<string, number>();
  if (entries.length < 2) return out;
  for (const [t, v] of entries) {
    let worse = 0;
    let tied = 0;
    for (const [u, w] of entries) {
      if (u === t) continue;
      if (w === v) tied++;
      else if (higherIsBetter ? w < v : w > v) worse++;
    }
    out.set(t, Math.round(((worse + tied / 2) / (entries.length - 1)) * 100));
  }
  return out;
}

async function revenues(tickers: string[]): Promise<Map<string, { revenue: number; name: string }>> {
  const cacheFile = `${OUT}/revenue.json`;
  const cached: Record<string, { revenue: number; name: string }> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
  const todo = tickers.filter((t) => !cached[t]);
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(
      todo.slice(i, i + 4).map(async (t) => {
        const c = await resolveTicker(t);
        if (!c) return;
        const d = computeRatios(await getCompanyFacts(c.cik).catch(() => null));
        if (d?.revenue && d.revenue > 0) cached[t] = { revenue: d.revenue, name: c.title };
      }),
    );
  }
  writeFileSync(cacheFile, JSON.stringify(cached));
  return new Map(Object.entries(cached));
}

type Pillar = { value: number | null; score: number | null; counts: boolean; note: string };

async function main() {
  const tickers = RESEARCH_UNIVERSE;
  const rev = await revenues(tickers);
  const nameOf = (t: string) => rev.get(t)?.name ?? t;
  const byName = new Map<string, string>();
  for (const t of tickers) if (rev.get(t)) byName.set(norm(rev.get(t)!.name), t);

  // --- Carbon (from the Carbon Intensity page's data) ---
  const carbon = JSON.parse(readFileSync("public/data/carbon.json", "utf8")) as {
    years: number[];
    companies: { ticker: string; emissions: Record<string, number>; revenue: Record<string, number | null> }[];
  };
  const cy = carbon.years[carbon.years.length - 1];
  const cFirst = carbon.years[0];
  const carbonBy = new Map(carbon.companies.map((c) => [c.ticker, c]));
  // The carbon build only matched S&P 500 companies. For those, "not in the
  // EPA data" means no US site big enough to report: near-zero direct
  // emissions. Anyone else simply wasn't checked.
  const inSp500 = new Set((sp500 as { stocks: { symbol: string }[] }).stocks.map((s) => s.symbol));
  // Outside the S&P 500, check EPA's raw facility list by parent name: if the
  // company owns no reporting site, its direct emissions are low too.
  const ghgrpParents = new Set<string>();
  const ghgrpFile = `.ml-cache/carbon/ghgrp-${cy}.json`;
  if (existsSync(ghgrpFile)) {
    const g = JSON.parse(readFileSync(ghgrpFile, "utf8")) as { facilities: { parent: string | null }[] };
    for (const f of g.facilities) for (const p of (f.parent ?? "").split(";")) ghgrpParents.add(norm(p.replace(/\(.*?\)/g, "")));
  }
  const checkedNoSites = (t: string) => existsSync(ghgrpFile) && rev.get(t) != null && !ghgrpParents.has(norm(rev.get(t)!.name));
  // Revenue for the same year as the emissions; if the carbon build has none
  // (PepsiCo's is missing in its source), the latest SEC annual revenue.
  const intensity = (t: string, y: number) => {
    const c = carbonBy.get(t);
    const r = c?.revenue[y] ?? (y === cy ? rev.get(t)?.revenue : null);
    return c && r ? c.emissions[y] / (r / 1e6) : null;
  };

  // --- Toxic releases (TRI), summed by standardized parent company ---
  const lines = readFileSync(`${OUT}/tri-${TRI_YEAR}.csv`, "utf8").split(/\r?\n/);
  const head = parseCsvLine(lines[0]).map((h) => h.replace(/^\d+\.\s*/, ""));
  const col = (n: string) => head.indexOf(n);
  const iStd = col("STANDARD PARENT CO NAME"), iPar = col("PARENT CO NAME"), iUnit = col("UNIT OF MEASURE"), iTot = col("TOTAL RELEASES");
  if ([iStd, iPar, iUnit, iTot].some((i) => i < 0)) throw new Error("TRI columns changed: " + head.slice(0, 20).join("|"));
  const triByParent = new Map<string, number>();
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const r = parseCsvLine(line);
    const parent = r[iStd] || r[iPar];
    if (!parent || parent === "NA") continue;
    // Dioxins are reported in grams; everything else in pounds.
    const lbs = Number(r[iTot]) * (/gram/i.test(r[iUnit]) ? 1 / 453.592 : 1);
    if (lbs > 0) triByParent.set(parent, (triByParent.get(parent) ?? 0) + lbs);
  }
  const toxicLbs = new Map<string, number>();
  const triUnmatched: [string, number][] = [];
  for (const [p, lbs] of triByParent) {
    const t = TRI_ALIASES[norm(p)] ?? byName.get(norm(p));
    if (t) toxicLbs.set(t, (toxicLbs.get(t) ?? 0) + lbs);
    else triUnmatched.push([p, lbs]);
  }

  // --- Climate targets (SBTi) ---
  const sbtiRows = readXlsx(`${OUT}/sbti.xlsx`);
  const sh = sbtiRows[0];
  const sIdx = (n: string) => sh.indexOf(n);
  const [iName, iNear, iNz, iNzYear] = ["company_name", "near_term_status", "net_zero_status", "net_zero_year"].map(sIdx);
  type Target = { near: string; netZero: string; netZeroYear: string; sbtiName: string };
  const targets = new Map<string, Target>();
  const rank = (x: Target) => (x.near === "Validated Targets" ? 2 : x.near === "Commitment to Set Targets" ? 1 : 0) * 2 + (x.netZero === "Validated Targets" ? 1 : 0);
  for (const r of sbtiRows.slice(1)) {
    const t = SBTI_ALIASES[norm(r[iName])] ?? byName.get(norm(r[iName]));
    if (!t) continue;
    const x: Target = { near: r[iNear], netZero: r[iNz], netZeroYear: r[iNzYear]?.replace(/\.0$/, ""), sbtiName: r[iName] };
    const prev = targets.get(t);
    if (!prev || rank(x) > rank(prev)) targets.set(t, x);
  }
  // Points for the target pillar, before the industry comparison.
  const targetPoints = (x: Target | undefined) =>
    !x ? 0 : x.near === "Validated Targets" ? (x.netZero === "Validated Targets" ? 100 : 75) : x.near === "Commitment to Set Targets" || x.netZero === "Commitment to Set Targets" ? 40 : 0;
  const targetNote = (x: Target | undefined) =>
    !x
      ? "No target with the SBTi"
      : x.near === "Validated Targets"
        ? `SBTi-approved emissions target${x.netZero === "Validated Targets" ? `, and an approved net-zero target${x.netZeroYear ? ` for ${x.netZeroYear}` : ""}` : ""}`
        : x.near === "Commitment to Set Targets"
          ? "Has promised the SBTi a target, not yet approved"
          : x.near === "Commitment Removed"
            ? "Promised a target, then the commitment was removed (missed the deadline)"
            : "No approved target";

  // --- Raw pillar values per company ---
  const raw = new Map<string, Record<PillarKey, number | null>>();
  const notes = new Map<string, Record<PillarKey, string>>();
  for (const t of tickers) {
    const r = rev.get(t)?.revenue ?? null;
    const covered = inSp500.has(t) || checkedNoSites(t);
    const inEpa = carbonBy.has(t);
    const ci = inEpa ? intensity(t, cy) : covered ? 0 : null;
    const i0 = intensity(t, cFirst);
    const trend = inEpa && ci != null && i0 ? ci / i0 - 1 : null;
    const lbs = toxicLbs.get(t) ?? 0;
    raw.set(t, {
      carbonIntensity: ci == null ? null : ci < NEGLIGIBLE.carbonIntensity ? 0 : ci,
      carbonTrend: ci != null && ci < NEGLIGIBLE.carbonIntensity ? null : trend,
      toxics: r ? (lbs / (r / 1e6) < NEGLIGIBLE.toxics ? 0 : lbs / (r / 1e6)) : null,
      target: targetPoints(targets.get(t)),
    });
    notes.set(t, {
      carbonIntensity: ci == null
        ? inEpa ? "EPA-reported emissions, but no sales figure to divide by" : "Not checked against EPA data (not in the S&P 500)"
        : inEpa
          ? ci < NEGLIGIBLE.carbonIntensity
            ? `${ci.toFixed(2)} t CO₂e per $1M of sales (${cy}): negligible, counts as zero`
            : `${Math.round(ci).toLocaleString()} t CO₂e per $1M of sales (${cy})`
          : "No US site big enough to report to the EPA: low direct emissions",
      carbonTrend: trend == null ? "No emissions history to compare" : `${trend <= 0 ? "Down" : "Up"} ${Math.abs(trend * 100).toFixed(0)}% per $1M of sales since ${cFirst}`,
      toxics: r == null ? "No sales figure" : lbs > 0 ? `${(lbs / (r / 1e6)).toFixed(lbs / (r / 1e6) < 10 ? 1 : 0)} lb per $1M of sales (${Math.round(lbs).toLocaleString()} lb in ${TRI_YEAR})` : `No toxic releases reported to the EPA in ${TRI_YEAR}`,
      target: targetNote(targets.get(t)),
    });
  }

  // --- Compare within each industry ---
  const industries = new Map<string, string[]>();
  for (const t of tickers) {
    const h = homeOf(t);
    industries.set(h, [...(industries.get(h) ?? []), t]);
  }
  const better: Record<PillarKey, boolean> = { carbonIntensity: false, carbonTrend: false, toxics: false, target: true };
  const companies = [];
  const industryInfo: Record<string, { label: string; count: number; pillarsCounted: PillarKey[] }> = {};
  for (const [ind, members] of industries) {
    const counted: PillarKey[] = [];
    const pct = {} as Record<PillarKey, Map<string, number>>;
    for (const k of Object.keys(WEIGHTS) as PillarKey[]) {
      const vals = new Map(members.flatMap((t) => (raw.get(t)![k] != null ? [[t, raw.get(t)![k]!] as const] : [])));
      const distinct = new Set(vals.values()).size;
      pct[k] = percentiles(vals, better[k]);
      if (vals.size >= 3 && distinct > 1) counted.push(k);
    }
    const scored = members.map((t) => {
      const pillars = {} as Record<PillarKey, Pillar>;
      let sum = 0;
      let w = 0;
      for (const k of Object.keys(WEIGHTS) as PillarKey[]) {
        const s = pct[k].get(t) ?? null;
        const counts = counted.includes(k) && s != null;
        if (counts) {
          sum += s! * WEIGHTS[k];
          w += WEIGHTS[k];
        }
        pillars[k] = { value: raw.get(t)![k], score: counted.includes(k) ? s : null, counts, note: notes.get(t)![k] };
      }
      return { ticker: t, name: nameOf(t), industry: ind, score: w ? Math.round(sum / w) : null, pillars };
    });
    // Rank within the industry, best first.
    const ranked = [...scored].filter((c) => c.score != null).sort((a, b) => b.score! - a.score!);
    for (const c of scored) companies.push({ ...c, rank: c.score == null ? null : ranked.findIndex((x) => x.ticker === c.ticker) + 1, of: ranked.length });
    industryInfo[ind] = {
      label: INDUSTRY_LABELS[ind] ?? RESEARCH_SECTORS[ind as keyof typeof RESEARCH_SECTORS].label,
      count: members.length,
      pillarsCounted: counted,
    };
  }

  companies.sort((a, b) => a.industry.localeCompare(b.industry) || (a.rank ?? 999) - (b.rank ?? 999));
  const out = {
    generated: new Date().toISOString().slice(0, 10),
    weights: WEIGHTS,
    years: { carbon: cy, carbonFrom: cFirst, toxics: TRI_YEAR },
    sources: [
      `EPA Greenhouse Gas Reporting Program, ${cFirst}–${cy} (direct emissions from US sites over 25,000 t/yr)`,
      `EPA Toxics Release Inventory, ${TRI_YEAR} (total on- and off-site releases)`,
      `Science Based Targets initiative target dashboard, downloaded ${new Date().toISOString().slice(0, 10)}`,
      "Revenue: latest annual figure from SEC filings",
    ],
    industries: industryInfo,
    companies,
  };
  writeFileSync("public/data/green.json", JSON.stringify(out));

  const withScore = companies.filter((c) => c.score != null).length;
  console.log(`Wrote public/data/green.json: ${companies.length} companies, ${withScore} scored, ${targets.size} matched to SBTi, ${toxicLbs.size} with TRI releases`);
  for (const info of Object.values(industryInfo)) console.log(`  ${info.label.padEnd(16)} ${String(info.count).padStart(2)} cos  counts: ${info.pillarsCounted.join(", ") || "nothing"}`);

  if (process.argv.includes("--unmatched")) {
    triUnmatched.sort((a, b) => b[1] - a[1]);
    console.log("\nBiggest unmatched TRI parents (million lb):");
    for (const [p, lbs] of triUnmatched.slice(0, 60)) console.log(`${(lbs / 1e6).toFixed(2).padStart(8)}  ${p}  [${norm(p)}]`);
    console.log("\nSBTi matches (check these are the same company):");
    console.log([...targets].map(([t, x]) => `${t}=${x.sbtiName}`).join("; "));
    console.log("\nResearch stocks with no SBTi match:");
    console.log(tickers.filter((t) => !targets.has(t)).map((t) => `${t} (${nameOf(t)})`).join("; "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
