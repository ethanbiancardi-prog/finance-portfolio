// Downloads the two extra sources the Green Score is built from, into
// site/.ml-cache/green/ (gitignored; rerun to refresh). Both free, no key.
//
//   tri-YEAR.csv   EPA Toxics Release Inventory (TRI), one row per facility
//                  per chemical: pounds released to air, water and land, with
//                  the facility's standardized parent company. Every US
//                  facility in a covered industry with 10+ employees that
//                  handles a listed chemical above a threshold must report.
//   sbti.xlsx      Science Based Targets initiative's public target dashboard:
//                  every company that has had its emissions-cut target checked
//                  and approved ("Targets set") or has promised to set one.
//
// Usage, from site/:  npx tsx scripts/green/fetch-green.ts   (~1 minute)

import { mkdirSync, writeFileSync } from "node:fs";

export const TRI_YEAR = 2024; // latest TRI year EPA has published (checked Nov 2026)
export const OUT = ".ml-cache/green";

const SOURCES = [
  { file: `tri-${TRI_YEAR}.csv`, url: `https://data.epa.gov/efservice/downloads/tri/mv_tri_basic_download/${TRI_YEAR}_US/csv` },
  { file: "sbti.xlsx", url: "https://files.sciencebasedtargets.org/production/files/companies-excel.xlsx" },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const s of SOURCES) {
    const res = await fetch(s.url, { signal: AbortSignal.timeout(300_000) });
    if (!res.ok) throw new Error(`${s.file}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(`${OUT}/${s.file}`, buf);
    console.log(`${s.file}: ${(buf.length / 1e6).toFixed(1)} MB`);
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/green/fetch-green.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
