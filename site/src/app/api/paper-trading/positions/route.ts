import { NextResponse } from "next/server";
import { alpaca } from "@/lib/alpaca";

export async function GET() {
  const positions = await alpaca("/positions");
  return NextResponse.json(positions);
}
