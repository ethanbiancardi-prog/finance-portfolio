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
        // Split-adjusted: without this a 2-for-1 split reads as a 50% crash
        // in every return, momentum score, and "since trade" figure.
        adjustment: "split",
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

export type Quote = {
  price: number;
  // Day change vs. the previous session's close — what a quote widget
  // usually shows as "+1.23 (+0.85%)".
  change: number | null;
  changePercent: number | null;
  prevClose: number | null;
  asOf: string; // ISO timestamp of the last trade we priced from
};

// Latest trade price for several symbols in one call. Symbols with no recent
// trade are left out of the map rather than throwing, so one thin ticker
// can't blank a whole portfolio; callers fall back to the last close.
export async function getLatestPrices(
  symbols: string[],
): Promise<Map<string, { price: number; asOf: string }>> {
  const out = new Map<string, { price: number; asOf: string }>();
  if (symbols.length === 0) return out;
  const params = new URLSearchParams({ symbols: symbols.join(","), feed: "iex" });
  const snaps: Record<string, { latestTrade?: { p: number; t: string } }> = await alpacaData(
    `/stocks/snapshots?${params}`,
  );
  for (const [symbol, snap] of Object.entries(snaps)) {
    if (snap?.latestTrade?.p) out.set(symbol, { price: snap.latestTrade.p, asOf: snap.latestTrade.t });
  }
  return out;
}

// Latest price for one symbol. Alpaca's snapshot bundles the last trade
// with today's and yesterday's daily bars in a single call. The free IEX
// feed only sees IEX's slice of volume, so the last trade can lag the
// consolidated tape by a few minutes — asOf makes that visible instead of
// hiding it.
export async function getQuote(symbol: string): Promise<Quote> {
  const snap = await alpacaData(`/stocks/${encodeURIComponent(symbol)}/snapshot?feed=iex`);
  const trade = snap.latestTrade;
  if (!trade?.p) throw new Error(`No recent trade for ${symbol}`);
  const prevClose: number | null = snap.prevDailyBar?.c ?? null;
  const change = prevClose == null ? null : trade.p - prevClose;
  return {
    price: trade.p,
    change,
    changePercent: change == null || !prevClose ? null : change / prevClose,
    prevClose,
    asOf: trade.t,
  };
}
