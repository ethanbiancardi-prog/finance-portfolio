import { NextResponse } from "next/server";
import { getAiSignals } from "@/lib/signals/aiSignals";
import { getFinancialSignals } from "@/lib/signals/financial";
import { getPoliticalSignals } from "@/lib/signals/political";
import { getPresidentialSignals } from "@/lib/signals/presidential";

// Read-only: serves whatever the daily refresh last stored. This route is
// public and never touches an upstream source or the model, so page loads
// can't be used to run up API bills or hammer the Clerk's site.
export async function GET() {
  const [political, legislation, geopolitics, financial, presidential] = await Promise.all([
    getPoliticalSignals(),
    getAiSignals("legislation"),
    getAiSignals("geopolitics"),
    getFinancialSignals(),
    getPresidentialSignals(),
  ]);
  return NextResponse.json({ political, legislation, geopolitics, financial, presidential });
}
