import { NextResponse } from "next/server";
import { getAlgoPortfolios } from "@/lib/algoPortfolios";

// Read-only: the four algo portfolios for the Strategy Lab's Live tab.
// Cached two minutes in lib/algoPortfolios.ts.
export async function GET() {
  try {
    return NextResponse.json(await getAlgoPortfolios());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
