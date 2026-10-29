import { NextResponse } from "next/server";
import { lookup } from "@/lib/kalshi";
import { getUser } from "@/lib/supabase/server";

// Read-only Kalshi lookup for the Calibration Tracker's form:
// /api/calibration/kalshi?q=<kalshi.com link, market ticker or event ticker>.
// Public market data only (lib/kalshi.ts); signed-in only so it isn't an
// open proxy to Kalshi.
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    const markets = await lookup(q);
    if (!markets.length) {
      return NextResponse.json(
        { error: "No Kalshi market found. Paste the market's link from kalshi.com, or its ticker (e.g. KXFED-26DEC)." },
        { status: 404 },
      );
    }
    return NextResponse.json({ markets });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
