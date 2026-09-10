import { searchTickers, type TickerMatch } from "./tickerSearch";

const BASE_URL = "https://paper-api.alpaca.markets/v2";
const DATA_BASE_URL = "https://data.alpaca.markets/v2";

// Server-only: reads keys from .env.local, never sent to the browser.
export async function alpaca(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "APCA-API-KEY-ID": process.env.APCA_API_KEY_ID ?? "",
      "APCA-API-SECRET-KEY": process.env.APCA_API_SECRET_KEY ?? "",
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Alpaca ${path} failed (${res.status}): ${body}`);
  }

  return res.json();
}

// Alpaca's market-data API lives on a separate host from the trading API
// above, but authenticates with the same key pair.
export async function alpacaData(path: string) {
  const res = await fetch(`${DATA_BASE_URL}${path}`, {
    headers: {
      "APCA-API-KEY-ID": process.env.APCA_API_KEY_ID ?? "",
      "APCA-API-SECRET-KEY": process.env.APCA_API_SECRET_KEY ?? "",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Alpaca data ${path} failed (${res.status}): ${body}`);
  }

  return res.json();
}

type AlpacaAsset = { symbol: string; name: string; exchange: string; tradable: boolean };

// The full active-equity asset list is ~10k rows and changes rarely, so
// cache it in memory and refresh at most hourly. On failure the cache is
// cleared so the next request retries instead of pinning the error.
const ASSETS_TTL_MS = 60 * 60 * 1000;
let assetsCache: { promise: Promise<TickerMatch[]>; fetchedAt: number } | null = null;

export function getTradableAssets(): Promise<TickerMatch[]> {
  if (!assetsCache || Date.now() - assetsCache.fetchedAt > ASSETS_TTL_MS) {
    const promise = alpaca("/assets?status=active&asset_class=us_equity")
      .then((assets: AlpacaAsset[]) =>
        assets
          .filter((a) => a.tradable)
          .map((a) => ({ symbol: a.symbol, name: a.name, exchange: a.exchange })),
      )
      .catch((err) => {
        assetsCache = null;
        throw err;
      });
    assetsCache = { promise, fetchedAt: Date.now() };
  }
  return assetsCache.promise;
}

export async function searchAssets(query: string, limit = 8): Promise<TickerMatch[]> {
  return searchTickers(await getTradableAssets(), query, limit);
}

export async function placeMarketOrder(
  symbol: string,
  qty: number,
  side: "buy" | "sell",
  clientOrderId?: string,
) {
  return alpaca("/orders", {
    method: "POST",
    body: JSON.stringify({
      symbol,
      qty,
      side,
      type: "market", // Phase 1 only supports market orders (fill at current price).
      time_in_force: "day", // order expires if unfilled by market close.
      ...(clientOrderId ? { client_order_id: clientOrderId } : {}),
    }),
  });
}
