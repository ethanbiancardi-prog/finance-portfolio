import { alpacaData } from "@/lib/alpaca";

export type DailyBar = { t: string; c: number };

const MAX_SYMBOLS_PER_REQUEST = 50; // keeps the query string small; batches if the universe ever grows past this

// Fetches daily closing prices for many symbols in as few requests as
// possible (Alpaca's bars endpoint accepts a comma-separated symbol list),
// covering roughly `lookbackTradingDays` of trading history per symbol.
export async function getDailyBars(
  symbols: string[],
  lookbackTradingDays: number,
): Promise<Map<string, DailyBar[]>> {
  const end = new Date();
  const start = new Date(end);
  // Trading days are ~5/7 of calendar days; pad further for holidays.
  start.setDate(start.getDate() - Math.ceil(lookbackTradingDays * 1.6) - 10);

  const bars = new Map<string, DailyBar[]>();

  for (let i = 0; i < symbols.length; i += MAX_SYMBOLS_PER_REQUEST) {
    const batch = symbols.slice(i, i + MAX_SYMBOLS_PER_REQUEST);
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        symbols: batch.join(","),
        timeframe: "1Day",
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
        feed: "iex",
        limit: "10000",
        ...(pageToken ? { page_token: pageToken } : {}),
      });

      const page = await alpacaData(`/stocks/bars?${params}`);

      for (const [symbol, symbolBars] of Object.entries(page.bars ?? {})) {
        const existing = bars.get(symbol) ?? [];
        bars.set(
          symbol,
          existing.concat((symbolBars as { t: string; c: number }[]).map((b) => ({ t: b.t, c: b.c }))),
        );
      }

      pageToken = page.next_page_token ?? undefined;
    } while (pageToken);
  }

  return bars;
}
