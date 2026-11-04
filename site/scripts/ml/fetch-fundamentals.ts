// Refreshes only the SEC part of the ML cache: .ml-cache/<universe>/fundamentals.json
// (every filing's numbers, dated by when they became public), leaving the
// cached price bars and macro series from fetch-data.ts alone. Use it after
// adding a field to lib/ml/fundamentals.ts.
//
// Usage, from site/:
//   npx tsx --env-file=.env.local scripts/ml/fetch-fundamentals.ts [--universe sp500]   (~5-10 minutes for sp500)

import { writeFileSync } from "node:fs";
import { getCompanyFactsWithHistory, resolveTicker } from "../../src/lib/edgar";
import { fundamentalSnapshots } from "../../src/lib/ml/fundamentals";
import sp500 from "../../src/lib/ml/sp500.json";
import { labUniverse } from "../../src/lib/strategyLabData";

const UNIVERSE = process.argv.includes("--universe") ? process.argv[process.argv.indexOf("--universe") + 1] : "core";

async function main() {
  if (UNIVERSE !== "core" && UNIVERSE !== "sp500") throw new Error(`Unknown universe "${UNIVERSE}"`);
  // Same company list as fetch-data.ts.
  const universe = UNIVERSE === "sp500" ? [...new Set([...sp500.stocks.map((s) => s.symbol), ...labUniverse()])] : labUniverse();
  const ciks = new Map(sp500.stocks.map((s) => [s.symbol, s.cik]));
  const fundamentals: Record<string, unknown> = {};
  // SEC asks for at most 10 requests a second; one at a time is well under.
  for (const [k, symbol] of universe.entries()) {
    try {
      const company =
        (await resolveTicker(symbol.replace(".", "-"))) ?? (ciks.get(symbol) ? { cik: ciks.get(symbol)!, ticker: symbol, title: symbol } : null);
      if (!company) throw new Error("not in SEC's ticker file");
      const { facts } = await getCompanyFactsWithHistory(company);
      fundamentals[symbol] = fundamentalSnapshots(facts);
    } catch (e) {
      console.warn(`  ${symbol}: ${(e as Error).message}`);
    }
    if ((k + 1) % 100 === 0) console.log(`  ${k + 1}/${universe.length}`);
  }
  writeFileSync(`.ml-cache/${UNIVERSE}/fundamentals.json`, JSON.stringify(fundamentals));
  console.log(`Done: ${Object.keys(fundamentals).length} companies' filings.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
