import { NextResponse } from "next/server";
import { getStudy } from "@/lib/kalshiStudy";
import { getUser } from "@/lib/supabase/server";

// "Is Kalshi calibrated?" (lib/kalshiStudy.ts): read from Redis, where
// api/cron/daily collects it a fifth at a time. { study: null } until the
// first slice has run. Signed-in only, like the rest of the tracker.
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    return NextResponse.json({ study: await getStudy() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
