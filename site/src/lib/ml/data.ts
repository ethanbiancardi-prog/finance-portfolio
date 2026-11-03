// Raw inputs for the ML model (lib/ml/features.ts): full daily bars (open,
// high, low, close, volume) from Alpaca, and a few macro series from FRED.
// Used by the training scripts (scripts/ml/) and, later, by the live robot,
// so both read the market through exactly the same code.
//
// lib/marketdata.ts's getDailyBars keeps only the close; chart patterns need
// the highs, lows and volume too, so this fetches the whole bar.

import { alpacaData } from "../alpaca";

export type Bars = { t: string[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] };

const MAX_SYMBOLS_PER_REQUEST = 50;

export async function getOhlcv(
  symbols: string[],
  start: string,
  adjustment: "all" | "raw" = "all",
): Promise<Map<string, Bars>> {
  // The free plan can't read the last 15 minutes of SIP data, so stop short.
  const end = new Date(Date.now() - 20 * 60_000).toISOString();
  const out = new Map<string, Bars>();
  for (let i = 0; i < symbols.length; i += MAX_SYMBOLS_PER_REQUEST) {
    const batch = symbols.slice(i, i + MAX_SYMBOLS_PER_REQUEST);
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        symbols: batch.join(","),
        timeframe: "1Day",
        start,
        end,
        feed: "sip",
        adjustment, // "all": splits and dividends, so returns are total returns
        limit: "10000",
        ...(pageToken ? { page_token: pageToken } : {}),
      });
      const page = await alpacaData(`/stocks/bars?${params}`);
      for (const [symbol, rows] of Object.entries(page.bars ?? {})) {
        const b = out.get(symbol) ?? { t: [], o: [], h: [], l: [], c: [], v: [] };
        for (const r of rows as { t: string; o: number; h: number; l: number; c: number; v: number }[]) {
          b.t.push(r.t.slice(0, 10));
          b.o.push(r.o);
          b.h.push(r.h);
          b.l.push(r.l);
          b.c.push(r.c);
          b.v.push(r.v);
        }
        out.set(symbol, b);
      }
      pageToken = page.next_page_token ?? undefined;
    } while (pageToken);
  }
  return out;
}

// FRED (the St. Louis Fed's data service) serves any series as a CSV with no
// key. Missing days come through as "." and are skipped.
//   VIXCLS  the VIX: how much volatility options traders expect
//   DGS10   10-year Treasury yield, %
//   DGS2    2-year Treasury yield, %  (10y minus 2y = the yield curve)
export const MACRO_SERIES = ["VIXCLS", "DGS10", "DGS2"] as const;
export type MacroKey = (typeof MACRO_SERIES)[number];
export type MacroSeries = { t: string[]; v: number[] };

export async function getFredSeries(id: string, start: string): Promise<MacroSeries> {
  const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}`);
  if (!res.ok) throw new Error(`FRED ${id} failed (${res.status})`);
  const out: MacroSeries = { t: [], v: [] };
  for (const line of (await res.text()).split(/\r?\n/).slice(1)) {
    const [date, value] = line.split(",");
    const v = Number(value);
    if (date && value && value !== "." && Number.isFinite(v)) {
      out.t.push(date);
      out.v.push(v);
    }
  }
  return out;
}
