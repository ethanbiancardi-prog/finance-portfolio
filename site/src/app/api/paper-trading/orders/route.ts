import { NextResponse } from "next/server";
import { alpaca } from "@/lib/alpaca";
import { resolveTickerNames } from "@/lib/edgar";

type AlpacaOrder = { symbol: string };

// Read-only: the showcase account is view-only, so there is no POST here.
// Only the monthly rebalance (api/rotation/run, secret-gated) places orders;
// visitors trade their own accounts via /dashboard (api/portfolio/trade).
export async function GET(request: Request) {
  const limit = new URL(request.url).searchParams.get("limit") ?? "10";
  const orders: AlpacaOrder[] = await alpaca(`/orders?status=all&limit=${limit}&direction=desc`);
  const names = await resolveTickerNames(orders.map((o) => o.symbol));

  return NextResponse.json(orders.map((o) => ({ ...o, name: names.get(o.symbol.toUpperCase()) })));
}
