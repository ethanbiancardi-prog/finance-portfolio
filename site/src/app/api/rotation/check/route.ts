import { NextResponse } from "next/server";
import { runRegimeCheck } from "@/lib/regimeCheck";

// Kept for manual testing; the schedule now runs /api/cron/daily.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runRegimeCheck());
}
