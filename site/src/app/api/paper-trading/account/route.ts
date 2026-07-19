import { NextResponse } from "next/server";
import { alpaca } from "@/lib/alpaca";

export async function GET() {
  const account = await alpaca("/account");
  return NextResponse.json(account);
}
