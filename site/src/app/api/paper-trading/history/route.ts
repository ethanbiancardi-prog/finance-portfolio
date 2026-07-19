import { NextResponse } from "next/server";
import { alpaca } from "@/lib/alpaca";

export async function GET() {
  const history = await alpaca(
    "/account/portfolio/history?period=1M&timeframe=1D",
  );
  return NextResponse.json(history);
}
