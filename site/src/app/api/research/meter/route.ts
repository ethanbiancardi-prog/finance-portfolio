import { NextResponse } from "next/server";
import { getRedis, kvConfigured } from "@/lib/kv";
import { getDailyBars } from "@/lib/marketdata";
import { getPoliticalSignals } from "@/lib/signals/political";
import type { MeterMarketInputs } from "@/lib/stockMeter";

// The Bull/Bear Meter's free inputs for one ticker: its price trend from
// Alpaca daily bars, and any congressional trades in it from the political
// signals the daily cron already stored. No AI, cached for an hour per ticker.
// The meter's other inputs (ratios, playbook, red flags) are already on the
// research page, so the browser combines everything in lib/stockMeter.ts.

const TTL_SECONDS = 60 * 60;
const SMA_DAYS = 200; // same 200-day rule the strategy uses for SPY
const MOMENTUM_DAYS = 63; // ~3 months of trading days

export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get("ticker")?.toUpperCase().trim();
  if (!ticker || !/^[A-Z.\-]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: "Missing or invalid ticker" }, { status: 400 });
  }

  const key = `research-meter:v1:${ticker}`;
  if (kvConfigured()) {
    try {
      const cached = await getRedis().get<MeterMarketInputs>(key);
      if (cached) return NextResponse.json(cached);
    } catch {
      // Cache read failed — compute it live this once.
    }
  }

  const [bars, political] = await Promise.all([
    getDailyBars([ticker], SMA_DAYS + 30).catch(() => null),
    getPoliticalSignals().catch(() => null),
  ]);
  const closes = bars?.get(ticker)?.map((b) => b.c) ?? [];
  const asOf = bars?.get(ticker)?.at(-1)?.t.slice(0, 10) ?? null;
  const last = closes[closes.length - 1];

  // Trend: last close vs. the average close of the last 200 trading days.
  const sma = closes.length >= SMA_DAYS ? closes.slice(-SMA_DAYS).reduce((s, c) => s + c, 0) / SMA_DAYS : null;
  // Momentum: price change over the last ~3 months.
  const past = closes.length > MOMENTUM_DAYS ? closes[closes.length - 1 - MOMENTUM_DAYS] : null;

  const trades =
    political?.items
      .filter((s) => s.ticker.toUpperCase() === ticker)
      .flatMap((s) => s.trades ?? [])
      .filter((t) => t.type === "buy" || t.type === "sell") ?? [];

  const inputs: MeterMarketInputs = {
    ticker,
    trendGap: sma ? last / sma - 1 : null,
    momentum: past ? last / past - 1 : null,
    priceAsOf: asOf,
    congress: trades.length
      ? {
          buys: trades.filter((t) => t.type === "buy").length,
          sells: trades.filter((t) => t.type === "sell").length,
          windowDays: political!.windowDays,
          asOf: political!.generatedAt.slice(0, 10),
        }
      : null,
  };

  // Don't cache a failed price fetch, so a brief outage doesn't stick for an hour.
  if (inputs.trendGap !== null && kvConfigured()) {
    await getRedis().set(key, inputs, { ex: TTL_SECONDS }).catch(() => {});
  }
  return NextResponse.json(inputs);
}
