import { NextResponse } from "next/server";
import { getPoliticalSignals } from "@/lib/signals/political";

// Read-only: serves whatever the daily refresh last stored. This route is
// public and never touches an upstream source, so page loads can't be used
// to hammer the Clerk's site.
export async function GET() {
  const political = await getPoliticalSignals();
  return NextResponse.json({ political });
}
