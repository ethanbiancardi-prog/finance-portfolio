import { NextResponse } from "next/server";
import { runRebalance } from "@/lib/rotationRun";

// Vercel Cron always sends GET requests. This route executes trades on the
// public showcase account with no human in the loop, so it's gated behind a
// shared secret. There is no public trigger: the account is view-only, and
// the strategy only trades on the monthly schedule.
export async function GET(request: Request) {
  // An unset secret would make the expected header "Bearer undefined".
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runRebalance("monthly"));
}
