import { NextResponse } from "next/server";
import { alpaca, placeMarketOrder } from "@/lib/alpaca";

export async function GET(request: Request) {
  const limit = new URL(request.url).searchParams.get("limit") ?? "10";
  const orders = await alpaca(`/orders?status=all&limit=${limit}&direction=desc`);
  return NextResponse.json(orders);
}

export async function POST(request: Request) {
  const { symbol, qty, side } = await request.json();
  const order = await placeMarketOrder(symbol, qty, side);
  return NextResponse.json(order);
}
