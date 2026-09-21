// "What happened since?" — the honest companion to any disclosure that
// arrives weeks late. Given tickers and dates, returns the price change
// from the first close on or after each date to the latest close, from
// Alpaca's daily bars (one batched request per 50 symbols).
import { getDailyBars, type DailyBar } from "@/lib/marketdata";

export type SinceTrade = { pct: number; from: string; asOf: string; fromClose: number; lastClose: number };

export async function loadBars(symbols: string[], calendarDays: number): Promise<Map<string, DailyBar[]>> {
  // getDailyBars takes trading days and pads for weekends/holidays itself.
  const tradingDays = Math.ceil((calendarDays * 5) / 7) + 5;
  try {
    return await getDailyBars([...new Set(symbols)], tradingDays);
  } catch {
    return new Map(); // performance is an enrichment; never fail the batch
  }
}

export function sinceDate(bars: DailyBar[] | undefined, date: string): SinceTrade | null {
  if (!bars || bars.length === 0) return null;
  const start = bars.find((b) => b.t.slice(0, 10) >= date);
  const last = bars[bars.length - 1];
  if (!start || !last || start === last || !start.c) return null;
  return { pct: last.c / start.c - 1, from: start.t.slice(0, 10), asOf: last.t.slice(0, 10), fromClose: start.c, lastClose: last.c };
}
