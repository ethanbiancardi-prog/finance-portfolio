// Downloads the EPA Greenhouse Gas Reporting Program (GHGRP) data the
// Carbon Intensity page is built from, into site/.ml-cache/carbon/
// (gitignored; rerun to refresh). Free, no key: EPA's Envirofacts API.
//
// The GHGRP covers every US facility that emits 25,000+ metric tons of CO2
// equivalent a year (power plants, refineries, steel mills, cement kilns,
// chemical plants, oil and gas operations...). Each year, each facility
// reports its emissions and its highest-level US parent company with the
// ownership share, e.g. "Nucor Corporation (100%)".
//
// Two tables per year:
//   PUB_DIM_FACILITY              one row per facility: name, state, parent(s)
//   PUB_FACTS_SECTOR_GHG_EMISSION emissions per facility, split by sector and gas
//
// Only "direct emitter" sectors are kept (sector_type E): what comes out of the
// facility's own smokestacks, i.e. Scope 1. The "supplier" sectors report the
// CO2 in fuel a company SELLS (burned later by its customers), which would
// count the same emissions twice and isn't the company's own footprint.
//
// Usage, from site/:  npx tsx scripts/carbon/fetch-ghgrp.ts   (~15-20 minutes)

import { existsSync, mkdirSync, writeFileSync } from "node:fs";

export const YEARS = [2019, 2020, 2021, 2022, 2023]; // 2023 is the latest year EPA has published
const OUT = ".ml-cache/carbon";
const API = "https://data.epa.gov/efservice";

export type Facility = { id: number; name: string; state: string; naics: string; parent: string | null };
export type YearData = { year: number; facilities: Facility[]; emissions: Record<number, number> };

async function page<T>(path: string, from: number, size: number): Promise<T[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${API}/${path}/ROWS/${from}:${from + size - 1}/JSON`, { signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T[];
    } catch (err) {
      if (attempt >= 4) throw err;
      console.log(`  retry ${path} @${from}: ${err instanceof Error ? err.message : err}`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

async function all<T>(path: string, size: number): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const got = await page<T>(path, from, size);
    rows.push(...got);
    if (got.length < size) return rows;
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const sectors = await all<{ sector_id: number; sector_type: string }>("PUB_DIM_SECTOR", 100);
  const emitter = new Set(sectors.filter((s) => s.sector_type === "E").map((s) => s.sector_id));

  for (const year of YEARS) {
    const file = `${OUT}/ghgrp-${year}.json`;
    if (existsSync(file)) {
      console.log(`${year}: cached`);
      continue;
    }
    const t0 = Date.now();
    type FacRow = { facility_id: number; facility_name: string; state: string; naics_code: string; parent_company: string | null };
    const facRows = await all<FacRow>(`PUB_DIM_FACILITY/YEAR/=/${year}`, 2000);
    type EmRow = { facility_id: number; sector_id: number; co2e_emission: number | null };
    const emRows = await all<EmRow>(`PUB_FACTS_SECTOR_GHG_EMISSION/YEAR/=/${year}`, 5000);

    // A facility can appear more than once in the facility table; keep one.
    const facilities = new Map<number, Facility>();
    for (const f of facRows)
      facilities.set(f.facility_id, { id: f.facility_id, name: f.facility_name, state: f.state, naics: f.naics_code, parent: f.parent_company });
    const emissions: Record<number, number> = {};
    for (const e of emRows) {
      if (!emitter.has(e.sector_id) || !e.co2e_emission) continue;
      emissions[e.facility_id] = (emissions[e.facility_id] ?? 0) + e.co2e_emission;
    }
    const data: YearData = { year, facilities: [...facilities.values()], emissions };
    writeFileSync(file, JSON.stringify(data));
    const total = Object.values(emissions).reduce((a, b) => a + b, 0);
    console.log(`${year}: ${facilities.size} facilities, ${(total / 1e9).toFixed(2)} billion t CO2e direct, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}

if (process.argv[1]?.includes("fetch-ghgrp")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
