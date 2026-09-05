import { NextResponse } from "next/server";
import { alpaca, placeMarketOrder } from "@/lib/alpaca";
import { resolveTickerNames } from "@/lib/edgar";

type AlpacaOrder = { symbol: string };

export async function GET(request: Request) {
  const limit = new URL(request.url).searchParams.get("limit") ?? "10";
  const orders: AlpacaOrder[] = await alpaca(`/orders?status=all&limit=${limit}&direction=desc`);
  const names = await resolveTickerNames(orders.map((o) => o.symbol));

  return NextResponse.json(orders.map((o) => ({ ...o, name: names.get(o.symbol.toUpperCase()) })));
}

export async function POST(request: Request) {
  const { symbol, qty, side } = await request.json();
  const order = await placeMarketOrder(symbol, qty, side);
  return NextResponse.json(order);
}
