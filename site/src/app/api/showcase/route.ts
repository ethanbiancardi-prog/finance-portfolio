import { NextResponse } from "next/server";
import { getShowcase } from "@/lib/showcase";

// Read-only: Ethan's dashboard paper portfolio for the public /paper-trading
// page. Cached two minutes in lib/showcase.ts.
export async function GET() {
  const showcase = await getShowcase();
  if (!showcase) return NextResponse.json({ error: "Portfolio unavailable" }, { status: 503 });
  return NextResponse.json(showcase);
}
