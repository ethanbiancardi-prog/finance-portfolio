import { NextResponse } from "next/server";
import { getRedis, kvConfigured } from "@/lib/kv";
import { LOG_KEY, type RunReport } from "@/lib/signalTrader";

// Read-only: the Signal Trader's recent market-hours checks, newest first,
// for the "thought process" log on /paper-trading. Redis only, never an
// upstream API, so page loads can't run anything up.
export async function GET() {
  if (!kvConfigured()) return NextResponse.json({ entries: [] });
  try {
    const entries = await getRedis().lrange<RunReport>(LOG_KEY, 0, -1);
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ entries: [] });
  }
}
