// Short company names for tickers ("INTC" -> "Intel"), so trade lists and
// journals can say what a stock is. Server side only; pages get them through
// /api/company-names and the <Ticker> component (components/Ticker.tsx).
//
// Source: Alpaca's asset list (already cached by getTradableAssets, and it
// covers ETFs like SPY too), falling back to SEC's ticker file for anything
// Alpaca no longer lists, such as a stock that was acquired.
import { getTradableAssets } from "./alpaca";
import { resolveTickerNames } from "./edgar";

// "Palantir Technologies Inc. Class A Common Stock" -> "Palantir Technologies"
// "Takeda Pharmaceutical Company Limited American Depositary Shares (...)" -> "Takeda Pharmaceutical"
// "BERKSHIRE HATHAWAY Class B" -> "Berkshire Hathaway"
export function shortCompanyName(raw: string): string {
  let n = raw.split(/\s+(?:American Depositary|Ordinary Shares|Common Stock|Class [A-Z]\b|\()/i)[0].trim();
  const SUFFIX = /(?:,?\s+(?:Inc\.?|Incorporated|Corporation|Corp\.?|Company|Co\.?|Limited|Ltd\.?|plc|N\.V\.|S\.A\.|Holdings|and|&))+,?$/i;
  const stripped = n.replace(SUFFIX, "").trim();
  if (stripped) n = stripped;
  // All-caps filings ("ABBVIE INC.") read better in title case; short
  // all-caps names are usually brands ("VISA") and stay as they are.
  if (n.length > 5 && n === n.toUpperCase()) {
    n = n.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  return n;
}

export async function getCompanyNames(symbols: string[]): Promise<Record<string, string>> {
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const out: Record<string, string> = {};
  const assets = await getTradableAssets().catch(() => []);
  const bySymbol = new Map(assets.map((a) => [a.symbol, a.name]));
  const missing: string[] = [];
  for (const s of wanted) {
    const name = bySymbol.get(s);
    if (name) out[s] = shortCompanyName(name);
    else missing.push(s);
  }
  if (missing.length) {
    // SEC writes share classes with a dash (BRK-B).
    const sec = await resolveTickerNames(missing.flatMap((s) => [s, s.replace(".", "-")])).catch(() => new Map<string, string>());
    for (const s of missing) {
      const name = sec.get(s) ?? sec.get(s.replace(".", "-"));
      if (name) out[s] = shortCompanyName(name);
    }
  }
  return out;
}
