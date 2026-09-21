import { NextResponse } from "next/server";
import { getAiSignals } from "@/lib/signals/aiSignals";
import { getPoliticalSignals } from "@/lib/signals/political";

// Read-only: serves whatever the daily refresh last stored. This route is
// public and never touches an upstream source or the model, so page loads
// can't be used to run up API bills or hammer the Clerk's site.
export async function GET() {
  const [political, legislation, geopolitics] = await Promise.all([
    getPoliticalSignals(),
    getAiSignals("legislation"),
    getAiSignals("geopolitics"),
  ]);
  return NextResponse.json({ political, legislation, geopolitics });
}
