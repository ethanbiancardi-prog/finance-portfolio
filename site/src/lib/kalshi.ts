// Kalshi market data for the Calibration Tracker. Read-only public endpoints:
// no Kalshi account, no API key, no trading. Prices are in dollars per $1
// contract, so a YES price of $0.62 is the market saying 62%.
//
// Docs: docs.kalshi.com (Quick Start: Market Data). Responses are cached in
// Redis for a minute so a page load never hammers Kalshi.

import { getRedis, kvConfigured } from "./kv";

const BASE = "https://external-api.kalshi.com/trade-api/v2";
const TTL_SECONDS = 60;

export type KalshiMarket = {
  ticker: string;
  eventTicker: string;
  question: string; // the market's own title, plus its outcome label if that adds anything
  status: string; // "active", "closed", "settled", "finalized", ...
  probability: number | null; // 0-1: midpoint of the YES bid and ask, else the last trade
  closeTime: string | null; // ISO, when trading stops
  result: "yes" | "no" | null; // set once Kalshi settles it
};

export type RawMarket = {
  ticker: string;
  event_ticker: string;
  title?: string;
  yes_sub_title?: string;
  status?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price_dollars?: string;
  close_time?: string;
  open_time?: string;
  expected_expiration_time?: string;
  result?: string;
  volume_fp?: string;
  volume_24h_fp?: string;
};

// The market's price as a probability. The midpoint of the best YES bid and
// ask is the fairest single number; with no real quotes on one side (bid 0
// or ask 1), fall back to the last trade; with no trades either, unknown.
export function probability(m: RawMarket): number | null {
  const bid = Number(m.yes_bid_dollars);
  const ask = Number(m.yes_ask_dollars);
  const last = Number(m.last_price_dollars);
  if (bid > 0 && ask > 0 && ask < 1 && ask >= bid) return Math.round(((bid + ask) / 2) * 10_000) / 10_000;
  if (last > 0) return last;
  return null;
}

export function toMarket(m: RawMarket): KalshiMarket {
  const title = (m.title ?? m.ticker).trim();
  const sub = (m.yes_sub_title ?? "").trim();
  return {
    ticker: m.ticker,
    eventTicker: m.event_ticker,
    question: sub && !title.toLowerCase().includes(sub.toLowerCase()) ? `${title} (${sub})` : title,
    status: m.status ?? "",
    probability: probability(m),
    closeTime: m.close_time ?? m.expected_expiration_time ?? null,
    result: m.result === "yes" || m.result === "no" ? m.result : null,
  };
}

// Uncached GET for bulk reads (daily picks, the calibration study). Kalshi
// rate-limits public reads, so a 429 waits and retries a few times.
export async function kalshiFetch<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" }, cache: "no-store" });
    if (res.status === 429 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Kalshi answered ${res.status} for ${path.split("?")[0]}`);
    return (await res.json()) as T;
  }
}

async function get<T>(path: string): Promise<T | null> {
  const key = `kalshi:${path}`;
  if (kvConfigured()) {
    const hit = await getRedis().get<T>(key).catch(() => null);
    if (hit) return hit;
  }
  const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" }, cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Kalshi answered ${res.status}`);
  const body = (await res.json()) as T;
  if (kvConfigured()) await getRedis().set(key, body, { ex: TTL_SECONDS }).catch(() => {});
  return body;
}

// A ticker from whatever was pasted: "KXFED-26DEC-T4.00", or a kalshi.com
// link, whose last path segment is the market or event ticker.
export function tickerFrom(input: string): string | null {
  let s = input.trim();
  try {
    if (/^https?:\/\//i.test(s)) s = new URL(s).pathname.split("/").filter(Boolean).pop() ?? "";
  } catch {
    return null;
  }
  s = s.toUpperCase();
  return /^[A-Z0-9][A-Z0-9.\-_]{1,80}$/.test(s) ? s : null;
}

export async function getMarket(ticker: string): Promise<KalshiMarket | null> {
  const body = await get<{ market?: RawMarket }>(`/markets/${encodeURIComponent(ticker)}`);
  return body?.market ? toMarket(body.market) : null;
}

// Every market under an event (e.g. one per possible Fed rate), so the user
// can pick the exact one they're predicting.
export async function getEventMarkets(eventTicker: string): Promise<KalshiMarket[]> {
  const body = await get<{ markets?: RawMarket[]; event?: { markets?: RawMarket[] } }>(
    `/events/${encodeURIComponent(eventTicker)}?with_nested_markets=true`,
  );
  // With nested markets on, they arrive inside `event` and the top-level
  // list comes back empty; take whichever has them.
  const list = body?.event?.markets?.length ? body.event.markets : (body?.markets ?? []);
  return list.map(toMarket);
}

// Market ticker first; if it isn't one, treat it as an event ticker. A
// kalshi.com link usually ends in the event ticker, or the series ticker in
// lower case, which isn't enough on its own to find a market.
export async function lookup(input: string): Promise<KalshiMarket[]> {
  const ticker = tickerFrom(input);
  if (!ticker) return [];
  const market = await getMarket(ticker);
  if (market) return [market];
  return getEventMarkets(ticker);
}

// How a Kalshi-linked prediction records its source, and how it's read back
// to check settlement. The source column is locked once written, so this
// link can't drift.
export const kalshiSource = (ticker: string) => `Kalshi: ${ticker}`;
export const tickerFromSource = (source: string) => source.match(/^Kalshi: ([A-Z0-9.\-_]+)$/)?.[1] ?? null;
