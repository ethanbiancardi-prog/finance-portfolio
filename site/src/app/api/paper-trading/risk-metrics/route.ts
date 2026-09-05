import { NextResponse } from "next/server";
import { alpaca } from "@/lib/alpaca";
import { getDailyBars } from "@/lib/marketdata";
import { computeRiskMetrics, type EquityPoint } from "@/lib/riskMetrics";

// Separate from /api/paper-trading/history (which the 1-month equity chart
// depends on as-is) — 3 months gives Sharpe/volatility/beta more days to
// work with than the chart's 1-month window, so it's fetched independently.
const PERIOD = "3M";

export async function GET() {
  const history = await alpaca(`/account/portfolio/history?period=${PERIOD}&timeframe=1D`);

  const equityHistory: EquityPoint[] = history.timestamp
    .map((t: number, i: number) => ({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      equity: history.equity[i],
    }))
    // Alpaca returns 0 (not null) for days before the account existed —
    // filter those out too, or they'd poison every return calculation
    // (0/x - 1 = -1, x/0 - 1 = Infinity).
    .filter((p: EquityPoint) => p.equity != null && p.equity > 0);

  const spyBars = (await getDailyBars(["SPY"], 70)).get("SPY") ?? [];

  return NextResponse.json(computeRiskMetrics(equityHistory, spyBars));
}
