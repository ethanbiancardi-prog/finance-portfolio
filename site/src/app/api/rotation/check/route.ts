import { NextResponse } from "next/server";
import { runRegimeCheck } from "@/lib/regimeCheck";

// Kept for manual testing; the schedule now runs /api/cron/daily.
export async function GET(request: Request) {
  // An unset secret would make the expected header "Bearer undefined".
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runRegimeCheck());
}
