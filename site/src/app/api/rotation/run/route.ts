import { NextResponse } from "next/server";
import { runRebalance } from "@/lib/rotationRun";

// Vercel Cron always sends GET requests. This is the one route on the site
// that executes trades with no human in the loop, so — unlike every other
// route here — it's worth gating behind a shared secret.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runRebalance("monthly"));
}

// Manual trigger for the "Run Rebalance Now" demo button — no secret check,
// consistent with every other mutating route on this site having none.
export async function POST() {
  return NextResponse.json(await runRebalance("manual"));
}
