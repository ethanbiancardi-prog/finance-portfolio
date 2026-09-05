import { NextResponse } from "next/server";
import { computeEfficientFrontier, MIN_TICKERS, MAX_TICKERS } from "@/lib/optimizer";
import { resolveTickerNames } from "@/lib/edgar";

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
    const [frontier, names] = await Promise.all([
      computeEfficientFrontier(symbols),
      resolveTickerNames(symbols),
    ]);
    return NextResponse.json({ ...frontier, names: Object.fromEntries(names) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build frontier" },
      { status: 400 },
    );
  }
}
