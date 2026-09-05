import { NextResponse } from "next/server";
import { computeEfficientFrontier, MIN_TICKERS, MAX_TICKERS } from "@/lib/optimizer";

export async function POST(request: Request) {
  const { tickers }: { tickers: string[] } = await request.json();

  const symbols = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()))).filter(Boolean);

  if (symbols.length < MIN_TICKERS || symbols.length > MAX_TICKERS) {
    return NextResponse.json(
      { error: `Enter between ${MIN_TICKERS} and ${MAX_TICKERS} tickers.` },
      { status: 400 },
    );
  }

  try {
    const frontier = await computeEfficientFrontier(symbols);
    return NextResponse.json(frontier);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build frontier" },
      { status: 400 },
    );
  }
}
