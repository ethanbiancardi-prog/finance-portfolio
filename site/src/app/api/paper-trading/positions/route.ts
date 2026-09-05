import { NextResponse } from "next/server";
import { alpaca } from "@/lib/alpaca";
import { resolveTickerNames } from "@/lib/edgar";

type AlpacaPosition = { symbol: string };

export async function GET() {
  const positions: AlpacaPosition[] = await alpaca("/positions");
  const names = await resolveTickerNames(positions.map((p) => p.symbol));

  return NextResponse.json(
    positions.map((p) => ({ ...p, name: names.get(p.symbol.toUpperCase()) })),
  );
}
