import { NextResponse } from "next/server";
import { alpacaData, isMarketOpen } from "@/lib/alpaca";
import { getQuote } from "@/lib/marketdata";

// Price history for the research page's chart.
//
//   GET /api/research/chart?symbol=AAPL&range=1D|5D|1M|6M|1Y|5Y
//   → { range, points: [{ t, c }], baseline, marketOpen }
//
// `baseline` is what the change is measured from: the previous session's
// close for 1D (how every quote screen reports "today"), otherwise the first
// point in the range. Free Alpaca data (IEX feed), split-adjusted.
//
// While the market is open, 1D and 5D end with a live point from the latest
// trade, so the line moves between 5-minute bars; the page re-polls every
// 30 seconds.

const RANGES = {
  // Intraday ranges pull a few extra calendar days, then keep only the most
  // recent trading sessions, so weekends and holidays don't leave gaps.
  "1D": { timeframe: "5Min", days: 6, sessions: 1 },
  "5D": { timeframe: "30Min", days: 12, sessions: 5 },
  "1M": { timeframe: "1Day", days: 31 },
  "6M": { timeframe: "1Day", days: 183 },
  "1Y": { timeframe: "1Day", days: 366 },
  "5Y": { timeframe: "1Week", days: 5 * 366 },
} as const;
type Range = keyof typeof RANGES;

const ny = (iso: string) => {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
    minutes: Number(d.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false })) * 60 + d.getUTCMinutes(),
  };
};

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = (params.get("symbol") ?? "").trim().toUpperCase();
  const range = (params.get("range") ?? "1Y") as Range;
  if (!/^[A-Z.\-]{1,10}$/.test(symbol)) return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  if (!(range in RANGES)) return NextResponse.json({ error: "Invalid range" }, { status: 400 });

  const cfg = RANGES[range];
  const start = new Date(Date.now() - cfg.days * 86_400_000).toISOString();
  const query = new URLSearchParams({
    timeframe: cfg.timeframe,
    start,
    feed: "iex",
    adjustment: "split",
    limit: "10000",
  });

  let bars: { t: string; c: number }[];
  try {
    const page = await alpacaData(`/stocks/${encodeURIComponent(symbol)}/bars?${query}`);
    bars = (page.bars ?? []).map((b: { t: string; c: number }) => ({ t: b.t, c: b.c }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Chart fetch failed" }, { status: 502 });
  }
  if (bars.length === 0) return NextResponse.json({ error: "No price history for this range" }, { status: 404 });

  let points = bars;
  let baseline = bars[0].c;

  if ("sessions" in cfg) {
    // Regular hours only (9:30 to 16:00 New York): IEX also prints thin
    // pre- and post-market trades that make the line jump.
    const regular = bars.filter((b) => {
      const { minutes } = ny(b.t);
      return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
    });
    const dates = [...new Set(regular.map((b) => ny(b.t).date))];
    const keep = new Set(dates.slice(-cfg.sessions));
    points = regular.filter((b) => keep.has(ny(b.t).date));
    const before = regular.filter((b) => ny(b.t).date < dates[dates.length - cfg.sessions]);
    // 1D measures from the previous session's last price, like a quote does.
    baseline = range === "1D" && before.length ? before[before.length - 1].c : points[0]?.c ?? baseline;
  }

  const intraday = "sessions" in cfg;
  const marketOpen = await isMarketOpen().catch(() => false);
  if (intraday && marketOpen && points.length) {
    const quote = await getQuote(symbol).catch(() => null);
    const lastBar = points[points.length - 1];
    // Only if it's newer than the last bar and from the same session.
    if (quote && quote.asOf > lastBar.t && ny(quote.asOf).date === ny(lastBar.t).date) {
      points = [...points, { t: quote.asOf, c: quote.price }];
    }
  }

  return NextResponse.json(
    { range, points, baseline, marketOpen },
    // Live ranges are re-polled every 30s, so share for 15s across viewers;
    // daily ranges barely change within a few minutes.
    {
      headers: {
        "Cache-Control": intraday && marketOpen
          ? "public, s-maxage=15, stale-while-revalidate=15"
          : "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
