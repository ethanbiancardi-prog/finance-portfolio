import { NextResponse } from "next/server";
import { runRebalance } from "@/lib/rotationRun";

// Vercel Cron always sends GET requests. This route executes trades on the
// public showcase account with no human in the loop, so it's gated behind a
// shared secret. There is no public trigger: the account is view-only, and
// the strategy only trades on the monthly schedule.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runRebalance("monthly"));
}
