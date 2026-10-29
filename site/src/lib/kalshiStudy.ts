// "Is Kalshi calibrated?" — a study of the market itself, for the
// Calibration Tracker. Over the last year of settled Kalshi markets, what
// was each market's price some time before it closed, and how often did it
// actually resolve YES? If markets priced at ~70% happened ~70% of the time,
// the crowd is well calibrated; where they don't, there's a known bias to
// learn about (classically: long shots overpriced, favourites underpriced).
//
// Which markets: every weekly, monthly and quarterly Kalshi series (skipping
// the flood of 15-minute and daily markets), settled YES/NO in the last 365
// days, with real trading (volume >= 1,000 contracts) and open long enough
// for the horizon being measured. Prices come from Kalshi's daily
// candlesticks: the midpoint of the closing YES bid and ask, or the day's
// last trade when there was no two-sided quote.
//
// Heavy (~1,000 API calls, ~4 minutes in all), so it's collected in five
// slices: each weekday api/cron/daily refreshes one fifth of the series and
// stores their points in a Redis hash, so every series is refreshed weekly
// and no single run takes long. The page aggregates whatever is stored
// (cheap) and caches that for 6 hours. Public data only, no account.

import { calibrationBins, type CalibrationBin } from "./calibration";
import { kalshiFetch, type RawMarket } from "./kalshi";
import { getRedis, kvConfigured } from "./kv";

const POINTS_KEY = "kalshi:study:points:v1"; // hash: series ticker -> Point[]
const META_KEY = "kalshi:study:meta:v1"; // { at, lastSlice }
const CACHE_KEY = "kalshi:study:v1"; // the aggregated KalshiStudy
const CACHE_SECONDS = 6 * 60 * 60;
const SLICES = 5;
const LOOKBACK_DAYS = 365;
const MIN_VOLUME = 1_000;
const CONCURRENCY = 6;

export type HorizonKey = "1d" | "7d"; // price 1 day / 7 days before close

export type BetSummary = { count: number; avgPrice: number; hitRate: number; returnPerDollar: number };

export type HorizonResult = {
  markets: number;
  bins: CalibrationBin[];
  // Buying YES on every market at the horizon price, the same dollars each:
  // average profit per $1 spent, before fees. Negative = overpriced.
  longshots: BetSummary | null; // priced under 20%
  favourites: BetSummary | null; // priced over 80%
};

export type KalshiStudy = {
  generatedAt: string; // when the newest slice was collected
  from: string;
  to: string;
  seriesScanned: number;
  horizons: Record<HorizonKey, HorizonResult>;
};

type Settled = { ticker: string; series: string; open: number; close: number; yes: boolean };
// One settled market: close time, outcome, and its prices 1 and 7 days
// before close (null where unknown). Kept small: thousands are stored.
type Point = { c: number; y: boolean; p1: number | null; p7: number | null };
type Candle = {
  end_period_ts: number;
  yes_bid?: { close_dollars?: string };
  yes_ask?: { close_dollars?: string };
  price?: { close_dollars?: string };
};

// Run tasks with at most `n` in flight, so Kalshi isn't hit all at once.
async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function candlePrice(c: Candle): number | null {
  const bid = Number(c.yes_bid?.close_dollars);
  const ask = Number(c.yes_ask?.close_dollars);
  if (bid > 0 && ask > 0 && ask < 1 && ask >= bid) return (bid + ask) / 2;
  const last = Number(c.price?.close_dollars);
  return last > 0 && last < 1 ? last : null;
}

function summary(points: { p: number; outcome: boolean }[]): BetSummary | null {
  if (!points.length) return null;
  const avgPrice = points.reduce((s, x) => s + x.p, 0) / points.length;
  const hitRate = points.filter((x) => x.outcome).length / points.length;
  // $1 at price p buys 1/p contracts paying $1 each if YES.
  const payout = points.reduce((s, x) => s + (x.outcome ? 1 / x.p : 0), 0) / points.length;
  return { count: points.length, avgPrice, hitRate, returnPerDollar: payout - 1 };
}

// Which fifth of the series a ticker belongs to: a stable hash of its name.
function sliceOf(ticker: string): number {
  let h = 0;
  for (const ch of ticker) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % SLICES;
}

async function longRunningSeries(): Promise<string[]> {
  const { series = [] } = await kalshiFetch<{ series?: { ticker: string; frequency: string }[] }>("/series");
  return series.filter((s) => ["weekly", "monthly", "quarterly"].includes(s.frequency)).map((s) => s.ticker);
}

// Settled markets and their pre-close prices, for some series.
async function collect(seriesTickers: string[]): Promise<Map<string, Point[]>> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - LOOKBACK_DAYS * 86_400;

  const perSeries = await pool(seriesTickers, CONCURRENCY, async (t) => {
    const out: Settled[] = [];
    let cursor = "";
    for (let page = 0; page < 5; page++) {
      const q = `/markets?series_ticker=${encodeURIComponent(t)}&status=settled&limit=1000&min_close_ts=${from}`;
      const body = await kalshiFetch<{ markets?: RawMarket[]; cursor?: string }>(
        cursor ? `${q}&cursor=${encodeURIComponent(cursor)}` : q,
      ).catch(() => ({ markets: [] as RawMarket[], cursor: "" }));
      for (const m of body.markets ?? []) {
        if ((m.result !== "yes" && m.result !== "no") || Number(m.volume_fp) < MIN_VOLUME || !m.open_time || !m.close_time) continue;
        const open = Math.floor(new Date(m.open_time).getTime() / 1000);
        const close = Math.floor(new Date(m.close_time).getTime() / 1000);
        if (close - open >= 2 * 86_400) out.push({ ticker: m.ticker, series: t, open, close, yes: m.result === "yes" });
      }
      cursor = body.cursor ?? "";
      if (!cursor) break;
    }
    return out;
  });
  const markets = perSeries.flat().sort((a, b) => a.close - b.close);

  // Daily candles. One batch call covers many markets but at most 10,000
  // candles and one shared time window, so batch markets that closed in the
  // same week and ask only for the 9 days before each close.
  const batches: Settled[][] = [];
  for (const m of markets) {
    const last = batches[batches.length - 1];
    if (last && last.length < 100 && m.close - last[0].close < 7 * 86_400) last.push(m);
    else batches.push([m]);
  }
  const candles = new Map<string, Candle[]>();
  await pool(batches, CONCURRENCY, async (batch) => {
    const start = batch[0].close - 9 * 86_400;
    const end = batch[batch.length - 1].close;
    const tickers = batch.map((m) => encodeURIComponent(m.ticker)).join(",");
    const body = await kalshiFetch<{ markets?: { market_ticker: string; candlesticks: Candle[] }[] }>(
      `/markets/candlesticks?market_tickers=${tickers}&start_ts=${start}&end_ts=${end}&period_interval=1440`,
    ).catch(() => ({ markets: [] }));
    for (const m of body.markets ?? []) candles.set(m.market_ticker, m.candlesticks ?? []);
  });

  // The price some days before close: the last daily candle ending by then,
  // no more than 2 days stale, and only if the market had been open a full
  // day by then.
  const priceAt = (m: Settled, days: number) => {
    const at = m.close - days * 86_400;
    if (at - m.open < 86_400) return null;
    const c = (candles.get(m.ticker) ?? []).filter((x) => x.end_period_ts <= at && x.end_period_ts > at - 2 * 86_400).pop();
    return c ? candlePrice(c) : null;
  };

  const out = new Map<string, Point[]>(seriesTickers.map((t) => [t, []]));
  for (const m of markets) {
    const point: Point = { c: m.close, y: m.yes, p1: priceAt(m, 1), p7: priceAt(m, 7) };
    if (point.p1 !== null || point.p7 !== null) out.get(m.series)!.push(point);
  }
  return out;
}

// For api/cron/daily: refresh one fifth of the series. By default the
// slice is picked by weekday, so all five are refreshed every week.
export async function refreshStudySlice(slice = new Date().getUTCDay() % SLICES) {
  if (!kvConfigured()) throw new Error("Redis is not configured");
  const mine = (await longRunningSeries()).filter((t) => sliceOf(t) === slice);
  const points = await collect(mine);
  const redis = getRedis();
  // Every scanned series is written, empty ones too, so it counts as done.
  if (mine.length) await redis.hset(POINTS_KEY, Object.fromEntries([...points].map(([t, list]) => [t, JSON.stringify(list)])));
  await redis.set(META_KEY, { at: new Date().toISOString(), lastSlice: slice });
  await redis.del(CACHE_KEY); // re-aggregate on the next view
  return { slice, series: mine.length, markets: [...points.values()].reduce((s, l) => s + l.length, 0) };
}

function aggregate(points: Point[], key: "p1" | "p7"): HorizonResult {
  const pts = points.filter((x) => x[key] !== null).map((x) => ({ p: x[key] as number, outcome: x.y }));
  return {
    markets: pts.length,
    bins: calibrationBins(pts),
    longshots: summary(pts.filter((x) => x.p < 0.2)),
    favourites: summary(pts.filter((x) => x.p > 0.8)),
  };
}

// The study from whatever slices have been collected; null before the first.
export async function getStudy(): Promise<KalshiStudy | null> {
  if (!kvConfigured()) return null;
  const redis = getRedis();
  const hit = await redis.get<KalshiStudy>(CACHE_KEY).catch(() => null);
  if (hit) return hit;

  const [raw, meta] = await Promise.all([
    redis.hgetall<Record<string, Point[] | string>>(POINTS_KEY),
    redis.get<{ at: string }>(META_KEY),
  ]);
  if (!raw || !meta) return null;
  const cutoff = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86_400;
  // Upstash may hand back the stored JSON already parsed.
  const points = Object.values(raw)
    .flatMap((v) => (typeof v === "string" ? (JSON.parse(v) as Point[]) : v))
    .filter((p) => p.c >= cutoff);
  const study: KalshiStudy = {
    generatedAt: meta.at,
    from: new Date(cutoff * 1000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    seriesScanned: Object.keys(raw).length,
    horizons: { "1d": aggregate(points, "p1"), "7d": aggregate(points, "p7") },
  };
  await redis.set(CACHE_KEY, study, { ex: CACHE_SECONDS }).catch(() => {});
  return study;
}
