// Support levels: price floors where a stock has stopped falling and bounced
// before. Shown on the Search tab of /research (SupportLevels.tsx).
//
// How it works, in four steps:
//   1. Swing lows. A day is a "swing low" when its low is the lowest of the
//      5 trading days before it and the 5 after it: the price dipped there
//      and turned back up.
//      The last few days can't have 5 days after them yet, so a recent low
//      counts once at least 2 later days have all stayed above it; it is
//      flagged "recent" because it hasn't been fully confirmed.
//   2. Group nearby swing lows into one zone. Sorted by price, a low joins
//      the zone below it when it is within 2.5% of that zone's highest low,
//      as long as the zone stays under 8% from bottom to top. So bounces at
//      $126, $128, $129, $131 and $133 make one $126–$133 zone, instead of
//      being cut in two at an arbitrary line. More bounces in a zone =
//      buyers keep stepping in there = a stronger floor.
//   3. Keep only zones below today's price, nearest first. Distance is
//      measured to the top of the zone, where a falling price meets it first.
//   4. Moving averages. The 50- and 200-day averages of closing prices are
//      the "moving" floors traders watch. Below the price they act as
//      support; once the price falls under them they often act as a
//      ceiling ("resistance") instead.
//
// A pattern, not a forecast: strong news can push a price straight through.

export type PriceBar = { t: string; h: number; l: number; c: number };

export type SupportLevel = {
  price: number; // top of the zone (the highest swing low in it)
  bottom: number; // bottom of the zone; equals price for a single bounce
  touches: number; // how many separate bounces happened here
  lastDate: string; // most recent bounce, YYYY-MM-DD
  distancePct: number; // how far below today's price, e.g. -0.052 = 5.2% below
  recent: boolean; // includes a low from the last few days, not fully confirmed
};

export type MovingAverage = { days: 50 | 200; value: number; distancePct: number; role: "support" | "resistance" };

export type SupportResult = {
  levels: SupportLevel[];
  movingAverages: MovingAverage[];
  low52w: number | null;
  high52w: number | null;
};

const SIDE = 5; // trading days on each side for a swing low
const RECENT_MIN_AFTER = 2; // later days needed to count a recent low
const GROUP_PCT = 0.025; // a low within 2.5% of a zone's top joins it
const MAX_ZONE_PCT = 0.08; // ...unless the zone would span more than 8%
const MAX_LEVELS = 3;

/** Find support levels below `price` from daily bars (oldest first). */
export function findSupportLevels(bars: PriceBar[], price: number): SupportResult {
  // Step 1: swing lows.
  const swings: { low: number; date: string; recent: boolean }[] = [];
  for (let i = SIDE; i < bars.length; i++) {
    const after = Math.min(SIDE, bars.length - 1 - i);
    if (after < RECENT_MIN_AFTER) break;
    const low = bars[i].l;
    let isSwing = true;
    for (let k = i - SIDE; k <= i + after; k++) {
      if (k !== i && bars[k].l < low) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) swings.push({ low, date: bars[i].t.slice(0, 10), recent: after < SIDE });
  }

  // Step 2: group nearby lows into zones, lowest first so each zone grows upward.
  swings.sort((a, b) => a.low - b.low);
  const groups: (typeof swings)[] = [];
  for (const s of swings) {
    const zone = groups[groups.length - 1];
    const fits =
      zone &&
      s.low <= zone[zone.length - 1].low * (1 + GROUP_PCT) && // close to the zone's top
      s.low <= zone[0].low * (1 + MAX_ZONE_PCT); // zone doesn't get too wide
    if (fits) zone.push(s);
    else groups.push([s]);
  }

  // Step 3: zones below today's price, nearest first.
  const levels: SupportLevel[] = groups
    .map((g) => {
      const top = g[g.length - 1].low;
      return {
        price: top,
        bottom: g[0].low,
        touches: g.length,
        lastDate: g.map((s) => s.date).sort().at(-1)!,
        distancePct: top / price - 1,
        recent: g.some((s) => s.recent),
      };
    })
    .filter((l) => l.price < price)
    .sort((a, b) => b.price - a.price)
    .slice(0, MAX_LEVELS);

  // Step 4: moving averages of closing prices.
  const movingAverages: MovingAverage[] = [];
  for (const days of [50, 200] as const) {
    if (bars.length < days) continue;
    const value = bars.slice(-days).reduce((sum, b) => sum + b.c, 0) / days;
    movingAverages.push({ days, value, distancePct: value / price - 1, role: value <= price ? "support" : "resistance" });
  }

  const lastYear = bars.slice(-252);
  return {
    levels,
    movingAverages,
    low52w: lastYear.length ? Math.min(...lastYear.map((b) => b.l)) : null,
    high52w: lastYear.length ? Math.max(...lastYear.map((b) => b.h)) : null,
  };
}
