import { NextResponse } from "next/server";
import { getLab } from "@/lib/strategyLabData";

// Read-only Strategy Lab results (lib/strategyLabData.ts). Served from the
// daily cache; only an empty cache makes this compute, which can take a
// while, hence the long limit.
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json(await getLab());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
