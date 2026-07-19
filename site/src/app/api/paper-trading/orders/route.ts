import { NextResponse } from "next/server";
import { alpaca } from "@/lib/alpaca";

export async function GET() {
  const orders = await alpaca("/orders?status=all&limit=10&direction=desc");
  return NextResponse.json(orders);
}

export async function POST(request: Request) {
  const { symbol, qty, side } = await request.json();

  const order = await alpaca("/orders", {
    method: "POST",
    body: JSON.stringify({
      symbol,
      qty,
      side, // "buy" or "sell"
      type: "market", // Phase 1 only supports market orders (fill at current price).
      time_in_force: "day", // order expires if unfilled by market close.
    }),
  });

  return NextResponse.json(order);
}
