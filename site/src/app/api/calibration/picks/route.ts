import { NextResponse } from "next/server";
import { tickerFromSource } from "@/lib/kalshi";
import { getDailyPicks } from "@/lib/kalshiPicks";
import { createClient, getUser } from "@/lib/supabase/server";

// Today's suggested Kalshi markets to forecast (lib/kalshiPicks.ts, cached 6
// hours), minus any you've already logged. Signed-in only.
const SHOW = 5;

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const supabase = await createClient();
    const [picks, { data }] = await Promise.all([
      getDailyPicks(),
      supabase.from("prediction_logs").select("market_source").like("market_source", "Kalshi: %"),
    ]);
    const logged = new Set((data ?? []).map((r: { market_source: string }) => tickerFromSource(r.market_source)));
    return NextResponse.json({ picks: picks.filter((p) => !logged.has(p.ticker)).slice(0, SHOW) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
