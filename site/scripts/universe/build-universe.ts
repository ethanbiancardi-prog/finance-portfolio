// Builds src/lib/growthUniverse.json: the ~1,500 stocks the Growth Stocks
// screen and the Relative Price Score cover. Rule: a US-listed common stock
// on the NYSE or Nasdaq, filing with the SEC, worth at least MIN_CAP, priced
// at least MIN_PRICE. S&P 500 members are always in (src/lib/ml/sp500.json).
//
// Sources (all free):
//   SEC company_tickers_exchange.json   every SEC filer's ticker and exchange
//   SEC XBRL "frames"                    every company's shares outstanding,
//                                        from its latest 10-K/10-Q cover page
//   Alpaca snapshots                     latest price (IEX), for market value
//   SEC submissions                      each company's industry code (SIC),
//                                        mapped to the 11 standard sectors;
//                                        S&P 500 members keep their official
//                                        GICS sector from sp500.json
//
// Market value = shares outstanding x price: a filter, not a precise figure
// (a company with several share classes may count only one).
//
// Usage, from site/:  npx tsx --env-file=.env.local scripts/universe/build-universe.ts   (~10 minutes, mostly SEC)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { alpacaData } from "../../src/lib/alpaca";
import { secFetch } from "../../src/lib/edgar";
import sp500 from "../../src/lib/ml/sp500.json";

const MIN_CAP = 2e9;
const MIN_PRICE = 5;
const CACHE = ".ml-cache/universe";
const FRAMES = ["CY2026Q3I", "CY2026Q2I", "CY2026Q1I", "CY2025Q4I"]; // newest first: a company's latest reported count wins

type Stock = { symbol: string; cik: number; name: string; sector: string; marketCap: number };

// SIC industry code -> one of the 11 standard (GICS) sectors. Approximate:
// SIC is older and coarser, so a few companies land in a neighbouring sector.
function sectorOfSic(sic: number): string | null {
  const r = (a: number, b: number) => sic >= a && sic <= b;
  if (r(6770, 6770) || r(9990, 9999)) return null; // blank-check shells, non-operating
  if (r(100, 999)) return "Consumer Staples";
  if (r(1000, 1099) || r(1400, 1499)) return "Materials";
  if (r(1200, 1399)) return "Energy";
  if (r(1500, 1799)) return "Industrials";
  if (r(2000, 2199)) return "Consumer Staples";
  if (r(2200, 2399) || r(2500, 2599)) return "Consumer Discretionary";
  if (r(2400, 2499) || r(2600, 2699)) return "Materials";
  if (r(2700, 2799)) return "Communication Services";
  if (r(2830, 2836)) return "Health Care";
  if (r(2840, 2844)) return "Consumer Staples";
  if (r(2800, 2899)) return "Materials";
  if (r(2900, 2999)) return "Energy";
  if (r(3000, 3399)) return "Materials";
  if (r(3570, 3579) || r(3660, 3699)) return "Information Technology";
  if (r(3630, 3639)) return "Consumer Discretionary";
  if (r(3400, 3699)) return "Industrials";
  if (r(3710, 3716) || r(3751, 3751)) return "Consumer Discretionary";
  if (r(3700, 3799)) return "Industrials";
  if (r(3840, 3851)) return "Health Care";
  if (r(3800, 3899)) return "Information Technology";
  if (r(3900, 3999)) return "Consumer Discretionary";
  if (r(4950, 4959)) return "Industrials"; // waste management
  if (r(4000, 4799)) return "Industrials";
  if (r(4800, 4899)) return "Communication Services";
  if (r(4900, 4999)) return "Utilities";
  if (r(5122, 5122)) return "Health Care";
  if (r(5140, 5149) || r(5180, 5182)) return "Consumer Staples";
  if (r(5000, 5199)) return "Industrials";
  if (r(5400, 5499) || r(5912, 5912) || r(5331, 5331) || r(5399, 5399)) return "Consumer Staples";
  if (r(5200, 5999)) return "Consumer Discretionary";
  if (r(6500, 6599) || r(6798, 6798)) return "Real Estate";
  if (r(6000, 6799)) return "Financials";
  if (r(7370, 7379)) return "Information Technology";
  if (r(7310, 7319) || r(7800, 7899)) return "Communication Services";
  if (r(7000, 7299) || r(7900, 7999) || r(8200, 8299)) return "Consumer Discretionary";
  if (r(7300, 7399) || r(8700, 8749) || r(8900, 8999)) return "Industrials";
  if (r(8000, 8099) || r(8731, 8731)) return "Health Care";
  return "Industrials";
}

async function cached<T>(file: string, make: () => Promise<T>): Promise<T> {
  const f = `${CACHE}/${file}`;
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  const v = await make();
  writeFileSync(f, JSON.stringify(v));
  return v;
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const sp = (sp500 as { stocks: { symbol: string; cik: number; sector: string }[] }).stocks;
  const spSector = new Map(sp.map((s) => [s.symbol, s.sector]));

  // 1. Every SEC filer listed on the NYSE or Nasdaq.
  const tickers = await cached("tickers-exchange.json", async () => (await secFetch("https://www.sec.gov/files/company_tickers_exchange.json")).json());
  const listed = (tickers.data as [number, string, string, string][])
    .filter(([, , t, ex]) => (ex === "NYSE" || ex === "Nasdaq") && /^[A-Z]{1,5}$/.test(t)) // plain common stock symbols only
    .map(([cik, name, ticker]) => ({ cik, name, ticker }));
  // One ticker per company (the S&P one if it has several), preferring the shortest.
  const byCik = new Map<number, { cik: number; name: string; ticker: string }>();
  for (const l of listed) {
    const prev = byCik.get(l.cik);
    if (!prev || (spSector.has(l.ticker) && !spSector.has(prev.ticker)) || (!spSector.has(prev.ticker) && l.ticker.length < prev.ticker.length)) byCik.set(l.cik, l);
  }
  console.log(`${byCik.size} NYSE/Nasdaq companies`);

  // 2. Shares outstanding, newest frame first.
  const shares = new Map<number, number>();
  for (const p of FRAMES) {
    const frame = await cached(`frame-${p}.json`, async () => (await secFetch(`https://data.sec.gov/api/xbrl/frames/dei/EntityCommonStockSharesOutstanding/shares/${p}.json`)).json());
    for (const row of frame.data as { cik: number; val: number }[]) if (!shares.has(row.cik) && row.val > 0) shares.set(row.cik, row.val);
  }

  // 3. Latest prices, 100 symbols a request.
  const candidates = [...byCik.values()].filter((c) => shares.has(c.cik) || spSector.has(c.ticker));
  const price = await cached("prices.json", async () => {
    const out: Record<string, number> = {};
    for (let i = 0; i < candidates.length; i += 100) {
      const syms = candidates.slice(i, i + 100).map((c) => c.ticker);
      const snaps: Record<string, { latestTrade?: { p: number }; prevDailyBar?: { c: number } }> = await alpacaData(`/stocks/snapshots?symbols=${syms.join(",")}&feed=iex`);
      for (const [s, v] of Object.entries(snaps)) {
        const p = v?.prevDailyBar?.c ?? v?.latestTrade?.p;
        if (p) out[s] = p;
      }
    }
    return out;
  });

  // 4. Keep the big ones, plus every S&P 500 member.
  const keep = candidates
    .map((c) => ({ ...c, cap: (shares.get(c.cik) ?? 0) * (price[c.ticker] ?? 0) }))
    .filter((c) => spSector.has(c.ticker) || (c.cap >= MIN_CAP && (price[c.ticker] ?? 0) >= MIN_PRICE));
  console.log(`${keep.length} worth $${MIN_CAP / 1e9}B+ (or in the S&P 500)`);

  // 5. Sector: GICS for S&P members, else from the SEC industry code.
  const sics = await cached("sic.json", async () => ({}) as Record<string, number>);
  // A failed lookup (usually SEC rate-limiting) is retried, never saved as 0,
  // so a rerun only fetches what is still missing.
  const todo = keep.filter((c) => !spSector.has(c.ticker) && !sics[c.cik]);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < todo.length; i += 2) {
    await Promise.all(
      todo.slice(i, i + 2).map(async (c) => {
        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            const res = await secFetch(`https://data.sec.gov/submissions/CIK${String(c.cik).padStart(10, "0")}.json`);
            const sub = await res.json();
            if (sub.sic) sics[c.cik] = Number(sub.sic);
            return;
          } catch {
            await sleep(1500 * attempt);
          }
        }
      }),
    );
    await sleep(250); // ~8 requests a second at most, under SEC's 10
    if ((i / 2) % 100 === 0) {
      writeFileSync(`${CACHE}/sic.json`, JSON.stringify(sics)); // resumable
      console.log(`  industry codes ${Math.min(i + 4, todo.length)}/${todo.length}`);
    }
  }
  writeFileSync(`${CACHE}/sic.json`, JSON.stringify(sics));

  const stocks: Stock[] = [];
  let shells = 0;
  let unknown = 0;
  for (const c of keep) {
    const code = sics[c.cik];
    if (!spSector.has(c.ticker) && !code) {
      unknown++;
      continue; // no industry code: can't be ranked within a sector
    }
    const sector = spSector.get(c.ticker) ?? sectorOfSic(code);
    if (!sector) {
      shells++;
      continue;
    }
    stocks.push({ symbol: c.ticker, cik: c.cik, name: c.name, sector, marketCap: Math.round(c.cap) });
  }
  // S&P members missing from the exchange file (rare, e.g. class shares like BRK.B) come straight from sp500.json.
  for (const s of sp) if (!stocks.some((x) => x.symbol === s.symbol)) stocks.push({ symbol: s.symbol, cik: s.cik, name: s.symbol, sector: s.sector, marketCap: 0 });
  stocks.sort((a, b) => b.marketCap - a.marketCap);

  writeFileSync(
    "src/lib/growthUniverse.json",
    JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), rule: `NYSE/Nasdaq common stocks worth $${MIN_CAP / 1e9}B+ priced $${MIN_PRICE}+, plus the S&P 500`, stocks }),
  );
  const bySector = new Map<string, number>();
  for (const s of stocks) bySector.set(s.sector, (bySector.get(s.sector) ?? 0) + 1);
  console.log(`Wrote src/lib/growthUniverse.json: ${stocks.length} stocks (${shells} shells and ${unknown} with no industry code dropped)`);
  console.log([...bySector].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
