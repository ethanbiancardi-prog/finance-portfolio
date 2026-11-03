// Downloads everything the ML model trains on into site/.ml-cache/<universe>/
// (gitignored; rerun to refresh). All sources are free:
//   Alpaca  daily bars since 2016, adjusted and raw, plus SPY
//   SEC     each company's XBRL facts (every 10-Q/10-K number, with filing dates)
//   FRED    VIX, 10-year and 2-year Treasury yields
//
// Universes:
//   core   the ~94 sector-list stocks the robots trade (default)
//   sp500  today's S&P 500 (src/lib/ml/sp500.json) plus the core stocks:
//          ~5x the rows to learn from. Takes ~10 minutes, mostly SEC.
//
// Usage, from site/:
//   npx tsx --env-file=.env.local scripts/ml/fetch-data.ts [--universe sp500]

import { mkdirSync, writeFileSync } from "node:fs";
import { getCompanyFactsWithHistory, resolveTicker } from "../../src/lib/edgar";
import { getFredSeries, getOhlcv, MACRO_SERIES } from "../../src/lib/ml/data";
import { fundamentalSnapshots } from "../../src/lib/ml/fundamentals";
import sp500 from "../../src/lib/ml/sp500.json";
import { labUniverse } from "../../src/lib/strategyLabData";

const START = "2016-01-01";
const universeArg = process.argv[process.argv.indexOf("--universe") + 1];
const UNIVERSE = process.argv.includes("--universe") ? universeArg : "core";
const DIR = `.ml-cache/${UNIVERSE}`;

async function main() {
  if (UNIVERSE !== "core" && UNIVERSE !== "sp500") throw new Error(`Unknown universe "${UNIVERSE}"`);
  mkdirSync(DIR, { recursive: true });
  const universe =
    UNIVERSE === "sp500" ? [...new Set([...sp500.stocks.map((s) => s.symbol), ...labUniverse()])] : labUniverse();
  const symbols = ["SPY", ...universe];
  const ciks = new Map(sp500.stocks.map((s) => [s.symbol, s.cik]));

  console.log(`Bars for ${symbols.length} symbols…`);
  const adjusted = await getOhlcv(symbols, START, "all");
  const raw = await getOhlcv(symbols, START, "raw");
  writeFileSync(`${DIR}/bars.json`, JSON.stringify(Object.fromEntries(adjusted)));
  writeFileSync(
    `${DIR}/raw-closes.json`,
    JSON.stringify(Object.fromEntries([...raw].map(([s, b]) => [s, Object.fromEntries(b.t.map((t, i) => [t, b.c[i]]))]))),
  );
  const noBars = universe.filter((s) => !adjusted.has(s));
  if (noBars.length) console.warn(`  no bars: ${noBars.join(", ")}`);

  console.log("FRED macro series…");
  const macro: Record<string, unknown> = {};
  for (const id of MACRO_SERIES) macro[id] = await getFredSeries(id, "2015-01-01");
  writeFileSync(`${DIR}/macro.json`, JSON.stringify(macro));

  // SEC asks for at most 10 requests a second; one at a time is well under.
  console.log("SEC company facts…");
  const fundamentals: Record<string, unknown> = {};
  for (const [k, symbol] of universe.entries()) {
    try {
      // The S&P list carries each company's SEC id; SEC's ticker file spells
      // class shares with a dash (BRK-B), Alpaca with a dot.
      const company = (await resolveTicker(symbol.replace(".", "-"))) ??
        (ciks.get(symbol) ? { cik: ciks.get(symbol)!, ticker: symbol, title: symbol } : null);
      if (!company) throw new Error("not in SEC's ticker file");
      const { facts } = await getCompanyFactsWithHistory(company);
      fundamentals[symbol] = fundamentalSnapshots(facts);
    } catch (e) {
      console.warn(`  ${symbol}: ${(e as Error).message}`);
    }
    if ((k + 1) % 50 === 0) console.log(`  ${k + 1}/${universe.length}`);
  }
  writeFileSync(`${DIR}/fundamentals.json`, JSON.stringify(fundamentals));

  console.log(
    `Done: ${adjusted.size} symbols of bars (${adjusted.get("SPY")?.t[0]} to ${adjusted.get("SPY")?.t.at(-1)}), ` +
      `${Object.keys(fundamentals).length} companies' filings.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
