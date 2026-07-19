import { NextResponse } from "next/server";
import { getCompaniesBySic, INDUSTRY_CATEGORIES } from "@/lib/edgar";

export async function GET(request: Request) {
  const category = new URL(request.url).searchParams.get("category");
  const config = category ? INDUSTRY_CATEGORIES[category] : null;
  if (!config) {
    return NextResponse.json({ error: "unknown category" }, { status: 400 });
  }

  const companies = await getCompaniesBySic(config.sic);
  return NextResponse.json({ companies });
}
