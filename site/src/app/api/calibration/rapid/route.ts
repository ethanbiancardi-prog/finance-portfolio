import { NextResponse } from "next/server";
import { rowToPrediction, type PredictionRow } from "@/lib/calibration";
import { getMarket, kalshiSource, tickerFromSource } from "@/lib/kalshi";
import { getRapidPool } from "@/lib/kalshiPicks";
import { createClient, getUser } from "@/lib/supabase/server";

// Rapid mode for the Calibration Tracker.
//
// GET:  the card deck, ~50 fast-settling Kalshi markets (lib/kalshiPicks.ts)
//       minus any you've already logged.
// POST: { ticker, shift } logs one card. shift is how far you'd move the
//       crowd's price, in probability points: -0.2, -0.1, 0, 0.1 or 0.2.
//       The market price is read here, live from Kalshi, never taken from
//       the browser, and your probability is that price plus the shift
//       (kept between 1% and 99%). Signed-in only; RLS applies.

const SHIFTS = [-0.2, -0.1, 0, 0.1, 0.2];

async function loggedTickers() {
  const supabase = await createClient();
  const { data } = await supabase.from("prediction_logs").select("market_source").like("market_source", "Kalshi: %");
  return new Set((data ?? []).map((r: { market_source: string }) => tickerFromSource(r.market_source)));
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const [pool, logged] = await Promise.all([getRapidPool(), loggedTickers()]);
    return NextResponse.json({ cards: pool.filter((p) => !logged.has(p.ticker)) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").toUpperCase();
  const shift = Number(body.shift);
  if (!ticker || !SHIFTS.includes(shift)) return NextResponse.json({ error: "ticker and a shift of -0.2, -0.1, 0, 0.1 or 0.2 are required" }, { status: 400 });

  const [market, pool] = await Promise.all([getMarket(ticker).catch(() => null), getRapidPool().catch(() => [])]);
  if (!market || market.result || market.probability === null) {
    return NextResponse.json({ error: "That market has closed or has no price right now; skip it." }, { status: 409 });
  }
  const crowd = Math.round(market.probability * 10_000) / 10_000;
  const mine = Math.round(Math.min(0.99, Math.max(0.01, crowd + shift)) * 10_000) / 10_000;
  // The deck's wording (with the event's title) when it's there.
  const question = (pool.find((p) => p.ticker === ticker)?.question ?? market.question).slice(0, 300);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prediction_logs")
    .insert({
      user_id: user.id,
      question,
      my_probability: mine,
      market_probability_at_entry: crowd,
      market_source: kalshiSource(ticker),
      resolution_date: (market.settleTime ?? market.closeTime ?? new Date().toISOString()).slice(0, 10),
      reasoning: "rapid mode",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(rowToPrediction(data as PredictionRow));
}
