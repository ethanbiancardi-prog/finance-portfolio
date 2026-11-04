// Information diffusion, step 3 of 3: how fast 8-K news gets into the price.
// Reads .ml-cache/diffusion/ (steps 1 and 2) and writes
// public/data/diffusion.json for /quant/diffusion.
//
// For every 8-K: the stock's ABNORMAL return (its return minus SPY's over
// the same stretch, so a market-wide rally doesn't count as a reaction),
// measured from the last price before the news could trade:
//   - filed in market hours:  the last minute's price at the moment of filing
//   - filed outside them:     the previous session's close
// at checkpoints: 10, 5 and 1 trading days before (a run-up shows as a
// move before "news"), 1-240 minutes into the first session that could
// trade it, that session's close ("day 1"), then 2-60 trading days out.
//
// Events are grouped by what the 8-K was about and by which way the stock
// moved on day 1 (no analyst-forecast data, so the day-1 reaction stands in
// for "good" or "bad" news, as in Chan, Jegadeesh & Lakonishok 1996). For
// each group: the average path, the "drift" after day 1 (did the move keep
// going?) with a t-statistic, and the half-life (when the average path first
// reached half of where it ended up at 60 days).
//
// Usage, from site/:  npx tsx scripts/diffusion/build-diffusion.ts

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { OUT, START, type FilingEvent } from "./fetch-events";
import type { Daily, Minutes } from "./fetch-prices";
import { nyParts, reactionSession } from "./sessions";

// --- What each 8-K is about ---------------------------------------------------
// One category per filing, by priority: an 8-K with earnings AND an executive
// change counts as earnings.
export const CATEGORIES = [
  { key: "earnings", label: "Earnings results", items: ["2.02"], what: "Quarterly or annual results (item 2.02)" },
  { key: "restructuring", label: "Layoffs, write-downs, restatements", items: ["2.05", "2.06", "4.02", "3.01", "1.03"], what: "Restructuring and layoffs, asset impairments, restated accounts, delisting notices, bankruptcy" },
  { key: "deals", label: "Deals and major contracts", items: ["1.01", "1.02", "2.01"], what: "Signing or ending a major agreement, completing an acquisition or sale" },
  { key: "leadership", label: "Executive and board changes", items: ["5.02"], what: "A director or senior officer leaving, joining, or getting a new pay deal" },
  { key: "financing", label: "Debt and stock issuance", items: ["2.03", "2.04", "3.02", "3.03"], what: "New bonds or loans, triggered debt terms, unregistered share sales, changes to shareholder rights" },
  { key: "other", label: "Other announcements", items: ["7.01", "8.01", "5.03", "5.05", "5.08", "1.05", "5.01", "5.04", "1.04"], what: "Investor presentations, press releases, bylaw changes, cybersecurity incidents and the rest" },
  { key: "votes", label: "Shareholder vote results (control)", items: ["5.07"], what: "Annual meeting results: almost always expected, so the price shouldn't react. A check on the method." },
] as const;
type CategoryKey = (typeof CATEGORIES)[number]["key"];

function categoryOf(items: string[]): CategoryKey | null {
  for (const c of CATEGORIES) if (c.items.some((i) => items.includes(i))) return c.key;
  return null; // only exhibits (9.01) or an unlisted item
}

// --- Checkpoints ----------------------------------------------------------------
export const CHECKPOINTS = [
  { key: "-10d", label: "−10d", kind: "pre", days: -10 },
  { key: "-5d", label: "−5d", kind: "pre", days: -5 },
  { key: "-1d", label: "−1d", kind: "pre", days: -1 },
  { key: "news", label: "News", kind: "news" },
  { key: "1m", label: "1m", kind: "minute", minutes: 1 },
  { key: "5m", label: "5m", kind: "minute", minutes: 5 },
  { key: "15m", label: "15m", kind: "minute", minutes: 15 },
  { key: "30m", label: "30m", kind: "minute", minutes: 30 },
  { key: "1h", label: "1h", kind: "minute", minutes: 60 },
  { key: "2h", label: "2h", kind: "minute", minutes: 120 },
  { key: "4h", label: "4h", kind: "minute", minutes: 240 },
  { key: "d1", label: "Day 1", kind: "day", days: 0 },
  { key: "d2", label: "2d", kind: "day", days: 1 },
  { key: "d3", label: "3d", kind: "day", days: 2 },
  { key: "d5", label: "5d", kind: "day", days: 4 },
  { key: "d10", label: "10d", kind: "day", days: 9 },
  { key: "d20", label: "20d", kind: "day", days: 19 },
  { key: "d40", label: "40d", kind: "day", days: 39 },
  { key: "d60", label: "60d", kind: "day", days: 59 },
] as const;
const IDX = Object.fromEntries(CHECKPOINTS.map((c, i) => [c.key, i])) as Record<(typeof CHECKPOINTS)[number]["key"], number>;

// A day-1 move this size or more counts as up/down news; smaller is "flat".
const MOVE = 0.01;

type Row = { ticker: string; category: CategoryKey; intraday: boolean; size: "large" | "mid" | "small" | null; path: (number | null)[] };

// Last price at or before a minute of the day, from sorted [minute, close].
function priceAt(bars: [number, number][] | undefined, minute: number): number | null {
  if (!bars) return null;
  let p: number | null = null;
  for (const [m, c] of bars) {
    if (m > minute) break;
    p = c;
  }
  return p;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
};

function main() {
  const events: FilingEvent[] = JSON.parse(readFileSync(`${OUT}/events.json`, "utf8"));
  const daily: Daily = JSON.parse(readFileSync(`${OUT}/daily.json`, "utf8"));
  const calendar = daily.SPY.map(([d]) => d);
  const dayIdx = new Map(calendar.map((d, i) => [d, i]));
  const close = new Map<string, Map<string, number>>(Object.entries(daily).map(([s, rows]) => [s, new Map(rows)]));
  const minuteCache = new Map<string, Minutes>();
  const minutes = (day: string): Minutes | null => {
    if (!minuteCache.has(day)) {
      const f = `${OUT}/min/${day}.json`;
      minuteCache.set(day, existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {});
    }
    return minuteCache.get(day)!;
  };

  // Company size, by revenue thirds (the Green Score build cached it).
  const revFile = ".ml-cache/green/revenue.json";
  const revenue: Record<string, { revenue: number }> = existsSync(revFile) ? JSON.parse(readFileSync(revFile, "utf8")) : {};
  const ranked = Object.entries(revenue).sort((a, b) => a[1].revenue - b[1].revenue).map(([t]) => t);
  const sizeOf = (t: string) => {
    const i = ranked.indexOf(t);
    return i < 0 ? null : i < ranked.length / 3 ? "small" : i < (2 * ranked.length) / 3 ? "mid" : "large";
  };

  // One event per company per reaction session, the most important category.
  const priority = new Map(CATEGORIES.map((c, i) => [c.key as CategoryKey, i]));
  const chosen = new Map<string, { e: FilingEvent; category: CategoryKey; day: string; intraday: boolean }>();
  for (const e of events) {
    const category = categoryOf(e.items);
    const s = reactionSession(e.accepted, calendar);
    // The newest session may still be trading (and the free data plan can't
    // read its last minutes), so its events wait for the next rebuild.
    if (!category || !s || s.day === calendar[calendar.length - 1]) continue;
    const key = `${e.ticker}|${s.day}`;
    const prev = chosen.get(key);
    if (!prev || priority.get(category)! < priority.get(prev.category)!) chosen.set(key, { e, category, day: s.day, intraday: s.intraday });
  }

  const rows: Row[] = [];
  let dropped = 0;
  for (const { e, category, day, intraday } of chosen.values()) {
    const d = dayIdx.get(day)!;
    const S = close.get(e.ticker);
    const M = close.get("SPY")!;
    const prevDay = calendar[d - 1];
    if (!S || !prevDay) {
      dropped++;
      continue;
    }
    const mins = minutes(day) ?? {};
    const acceptMinute = nyParts(e.accepted).minute;
    // Starting prices (stock, SPY).
    let s0 = S.get(prevDay) ?? null;
    let m0 = M.get(prevDay) ?? null;
    let firstMinute = 9 * 60 + 30; // first minute bar of the session
    if (intraday) {
      const sp = priceAt(mins[e.ticker], acceptMinute);
      const mp = priceAt(mins.SPY, acceptMinute);
      if (sp != null && mp != null) {
        s0 = sp;
        m0 = mp;
      }
      firstMinute = acceptMinute + 1;
    }
    if (s0 == null || m0 == null) {
      dropped++;
      continue;
    }
    const ar = (s: number | null | undefined, m: number | null | undefined) => (s != null && m != null ? s / s0! - 1 - (m / m0! - 1) : null);

    const path: (number | null)[] = CHECKPOINTS.map((c) => {
      if (c.kind === "news") return 0;
      if (c.kind === "pre") {
        const pd = calendar[d - 1 + c.days]; // trading days before the starting close
        return pd ? ar(S.get(pd), M.get(pd)) : null;
      }
      if (c.kind === "minute") {
        // Bars are stamped at their start, so the bar at minute m closes at m+1.
        const at = firstMinute + c.minutes - 1;
        if (at >= 16 * 60) return null; // past the close: not measured in minutes
        return ar(priceAt(mins[e.ticker], at), priceAt(mins.SPY, at));
      }
      const td = calendar[d + c.days];
      return td ? ar(S.get(td), M.get(td)) : null;
    });
    const d1 = path[IDX.d1];
    if (d1 == null || Math.abs(d1) > 0.5) {
      dropped++; // no day-1 price, or a move so large it's probably bad data
      continue;
    }
    rows.push({ ticker: e.ticker, category, intraday, size: sizeOf(e.ticker), path });
  }

  // --- Aggregate ----------------------------------------------------------------
  const halfLife = (avg: (number | null)[]) => {
    const final = avg[IDX.d60];
    if (final == null || Math.abs(final) < 0.002) return null; // nothing to halve
    for (let i = IDX.news + 1; i < CHECKPOINTS.length; i++) {
      const v = avg[i];
      if (v != null && v / final >= 0.5) return CHECKPOINTS[i].key;
    }
    return null;
  };
  const summarize = (rs: Row[]) => {
    const avg = CHECKPOINTS.map((_, i) => {
      const xs = rs.map((r) => r.path[i]).filter((x): x is number => x != null);
      return xs.length ? Math.round(mean(xs) * 1e5) / 1e5 : null;
    });
    const counts = CHECKPOINTS.map((_, i) => rs.filter((r) => r.path[i] != null).length);
    const driftTo = (k: number) => {
      const xs = rs.filter((r) => r.path[k] != null).map((r) => r.path[k]! - r.path[IDX.d1]!);
      return xs.length >= 10 ? { mean: Math.round(mean(xs) * 1e5) / 1e5, t: Math.round((mean(xs) / (sd(xs) / Math.sqrt(xs.length))) * 100) / 100, n: xs.length } : null;
    };
    return { n: rs.length, path: avg, counts, drift20: driftTo(IDX.d20), drift60: driftTo(IDX.d60), halfLife: halfLife(avg) };
  };

  const dirOf = (r: Row) => (r.path[IDX.d1]! >= MOVE ? "up" : r.path[IDX.d1]! <= -MOVE ? "down" : "flat");
  const groups = [];
  for (const c of CATEGORIES) {
    const inCat = rows.filter((r) => r.category === c.key);
    for (const direction of ["up", "down", "flat", "all"] as const) {
      const dRows = direction === "all" ? inCat : inCat.filter((r) => dirOf(r) === direction);
      for (const timing of ["all", "intraday", "overnight"] as const) {
        const tRows = timing === "all" ? dRows : dRows.filter((r) => r.intraday === (timing === "intraday"));
        for (const size of ["all", "large", "small"] as const) {
          if (size !== "all" && timing !== "all") continue; // size splits only across all timings
          const sRows = size === "all" ? tRows : tRows.filter((r) => r.size === size);
          if (sRows.length < 15) continue; // too few to say anything
          groups.push({ category: c.key, direction, timing, size, ...summarize(sRows) });
        }
      }
    }
  }

  const minFiles = readdirSync(`${OUT}/min`).length;
  const out = {
    generated: new Date().toISOString().slice(0, 10),
    period: { from: START, to: calendar[calendar.length - 1] },
    events: rows.length,
    companies: new Set(rows.map((r) => r.ticker)).size,
    moveThreshold: MOVE,
    checkpoints: CHECKPOINTS.map(({ key, label, kind }) => ({ key, label, kind })),
    categories: CATEGORIES.map(({ key, label, what, items }) => ({ key, label, what, items, events: rows.filter((r) => r.category === key).length })),
    groups,
    sources: [
      "SEC EDGAR filing index: every 8-K and the second SEC accepted it",
      "Alpaca market data: minute and daily prices (consolidated SIP feed, adjusted for splits and dividends)",
    ],
  };
  writeFileSync("public/data/diffusion.json", JSON.stringify(out));
  console.log(`Wrote public/data/diffusion.json: ${rows.length} events (${dropped} dropped), ${groups.length} groups, ${minFiles} minute-files read`);
  for (const c of CATEGORIES) {
    for (const dir of ["up", "down"]) {
      const g = groups.find((x) => x.category === c.key && x.direction === dir && x.timing === "all" && x.size === "all");
      if (!g) continue;
      const p = (k: keyof typeof IDX) => (g.path[IDX[k]] == null ? "  n/a" : `${(g.path[IDX[k]]! * 100).toFixed(2).padStart(6)}%`);
      console.log(
        `${c.key.padEnd(13)} ${dir.padEnd(4)} n=${String(g.n).padStart(5)}  5m ${p("5m")}  day1 ${p("d1")}  20d ${p("d20")}  60d ${p("d60")}  ` +
          `drift60 ${g.drift60 ? `${(g.drift60.mean * 100).toFixed(2)}% (t ${g.drift60.t})` : "n/a"}  half-life ${g.halfLife ?? "-"}`,
      );
    }
  }
}

main();
