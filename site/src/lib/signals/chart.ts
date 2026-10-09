// Chart scores for the Signal Trader (lib/signalTrader.ts): each stock's own
// price behaviour, from daily closes. Two parts:
//
//   Trend (0 to +2): +1 for closing above the 200-day average (the long-run
//   trend is up), +1 more for the 50-day average sitting above the 200-day
//   with the price above both (the shorter trend agrees).
//
//   Momentum (0 to +2): the return over the last 12 months, skipping the
//   most recent month (the standard "12-1" measure; the last month tends to
//   reverse, so it's left out). Ranked against the whole universe: the top
//   fifth gets +2, the next fifth +1. A stock that's down on the year gets
//   nothing however it ranks.
//
// Closes only change once a day, so the scores are computed on the first
// call of each New York day and cached until the next.
import { getRedis, kvConfigured } from "@/lib/kv";
import { getDailyBars } from "@/lib/marketdata";
import { nyDate } from "@/lib/portfolio";

const KEY = "signals:chart:v1";
const YEAR = 252; // trading days
const MONTH = 21;

export type ChartScore = {
  trend: number; // 0-2
  momentum: number; // 0-2
  ret12_1: number | null; // the 12-1 month return, e.g. 0.34 = +34%
  percentile: number | null; // 0-1 within the universe, 1 = strongest
  trendText: string;
  momentumText: string;
};

type Cached = { date: string; symbols: string[]; scores: Record<string, ChartScore> };

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(0)}%`;

/**
 * Scores for `universe` (ranked against each other) plus `extra` symbols
 * (current holdings outside the universe, measured against the universe's
 * cut-offs rather than ranked in).
 */
export async function getChartScores(universe: string[], extra: string[] = []): Promise<Map<string, ChartScore>> {
  const today = nyDate(new Date());
  const wanted = [...new Set([...universe, ...extra])];
  if (kvConfigured()) {
    const cached = await getRedis().get<Cached>(KEY).catch(() => null);
    if (cached && cached.date === today && wanted.every((s) => cached.symbols.includes(s))) {
      return new Map(Object.entries(cached.scores));
    }
  }

  const bars = await getDailyBars(wanted, YEAR + MONTH + 10);
  const closes = new Map<string, number[]>();
  for (const s of wanted) {
    // Completed days only, so a score can't flip mid-session.
    closes.set(s, (bars.get(s) ?? []).filter((b) => b.t.slice(0, 10) < today).map((b) => b.c));
  }
  const ret12_1 = (c: number[]) => (c.length > YEAR ? c[c.length - 1 - MONTH] / c[c.length - 1 - YEAR] - 1 : null);

  // Momentum cut-offs from the universe only.
  const ranked = universe
    .map((s) => ret12_1(closes.get(s) ?? []))
    .filter((r): r is number => r !== null)
    .sort((a, b) => a - b);
  const percentileOf = (r: number) => (ranked.length ? ranked.filter((x) => x <= r).length / ranked.length : null);

  const scores: Record<string, ChartScore> = {};
  for (const s of wanted) {
    const c = closes.get(s) ?? [];
    let trend = 0;
    let trendText = "Trend: not enough price history.";
    if (c.length >= 200) {
      const last = c[c.length - 1];
      const sma50 = avg(c.slice(-50));
      const sma200 = avg(c.slice(-200));
      if (last > sma200) trend++;
      if (sma50 > sma200 && last > sma50) trend++;
      trendText =
        trend === 2
          ? "Trend: uptrend, above its 50- and 200-day averages."
          : trend === 1
            ? "Trend: above its 200-day average."
            : "Trend: below its 200-day average.";
    }
    const r = ret12_1(c);
    const p = r === null ? null : percentileOf(r);
    const momentum = r === null || p === null || r <= 0 ? 0 : p > 0.8 ? 2 : p > 0.6 ? 1 : 0;
    const momentumText =
      r === null
        ? "Momentum: not enough price history."
        : `Momentum: ${pct(r)} over 12 months${p !== null ? `, stronger than ${Math.round(p * 100)}% of the universe` : ""}.`;
    scores[s] = { trend, momentum, ret12_1: r, percentile: p, trendText, momentumText };
  }

  if (kvConfigured()) {
    await getRedis()
      .set(KEY, { date: today, symbols: wanted, scores } satisfies Cached, { ex: 60 * 60 * 26 })
      .catch(() => {});
  }
  return new Map(Object.entries(scores));
}
