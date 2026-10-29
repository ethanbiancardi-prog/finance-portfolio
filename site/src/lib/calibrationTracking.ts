// Calibration Tracker automation, server-side only:
//   - auto-resolve: an open prediction logged from a Kalshi market is
//     resolved to match once Kalshi settles that market (yes/no);
//   - price tracker: one point per day of the market's probability, in
//     prediction_prices (0008_prediction_prices.sql).
//
// Runs two ways with the same code: on page load with the user's own session
// (RLS limits it to their rows), and from api/cron/daily with the server key
// for everyone, so prices are recorded even on days nobody opens the page.
// The lock-in trigger on prediction_logs still applies either way: only an
// open prediction can be resolved, and only its outcome changes.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getMarket, tickerFromSource, type KalshiMarket } from "./kalshi";

type OpenRow = { id: string; user_id: string; market_source: string };

// Today in New York, so a point recorded at 9pm Eastern lands on that day.
const nyToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

export type TrackResult = { checked: number; resolved: number; recorded: number; errors: string[] };

export async function trackKalshiPredictions(db: SupabaseClient, rows?: OpenRow[]): Promise<TrackResult & { markets: Map<string, KalshiMarket> }> {
  const out = { checked: 0, resolved: 0, recorded: 0, errors: [] as string[], markets: new Map<string, KalshiMarket>() };
  let open = rows;
  if (!open) {
    const { data, error } = await db
      .from("prediction_logs")
      .select("id, user_id, market_source")
      .is("outcome", null)
      .like("market_source", "Kalshi: %");
    if (error) throw new Error(error.message);
    open = data as OpenRow[];
  }

  const today = nyToday();
  const points: { prediction_id: string; user_id: string; observed_on: string; probability: number }[] = [];
  await Promise.all(
    open.map(async (p) => {
      const ticker = tickerFromSource(p.market_source);
      if (!ticker) return;
      const m = await getMarket(ticker).catch(() => null);
      if (!m) return;
      out.checked++;
      out.markets.set(p.id, m);
      if (m.result) {
        // Same update as a manual resolve; the trigger stamps resolved_at.
        const { error } = await db
          .from("prediction_logs")
          .update({ outcome: m.result === "yes", resolved_at: new Date().toISOString() })
          .eq("id", p.id)
          .is("outcome", null);
        if (error) out.errors.push(`${ticker}: ${error.message}`);
        else out.resolved++;
      }
      // The last price is recorded even on the settling day (it'll be ~0 or
      // ~1), so the chart ends where the market did.
      if (m.probability !== null) points.push({ prediction_id: p.id, user_id: p.user_id, observed_on: today, probability: m.probability });
    }),
  );

  if (points.length) {
    // One point per prediction per day: the first one recorded today wins.
    const { error } = await db.from("prediction_prices").upsert(points, { onConflict: "prediction_id,observed_on", ignoreDuplicates: true });
    if (error) out.errors.push(`prices: ${error.message}`);
    else out.recorded = points.length;
  }
  return out;
}
