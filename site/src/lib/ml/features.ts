// The ML model's inputs ("features"): every driver it may learn from, turned
// into one number per stock per day. Built from data up to that day's close
// only, so training rows look exactly like what the live robot will see.
//
// Missing values are NaN (a bank has no gross margin, a stock listed in 2020
// has no 2019 momentum); the model (lib/ml/gbm.ts) handles them itself.

import type { Bars, MacroKey, MacroSeries } from "./data";
import type { FundamentalSnapshot } from "./fundamentals";
import {
  baseBreakout,
  bearTrap,
  cupWithHandle,
  distributionDays,
  doubleBottom,
  followThroughDays,
  newHigh,
  recentEvents,
} from "./patterns";
import { SECTOR_KEYS, SECTORS } from "../sectors";
import sp500 from "./sp500.json";

export const FEATURES = [
  // Price & volume
  { key: "ret5", group: "Price", label: "1-week return" },
  { key: "ret20", group: "Price", label: "1-month return" },
  { key: "ret60", group: "Price", label: "3-month return" },
  { key: "ret120", group: "Price", label: "6-month return" },
  { key: "mom12_1", group: "Price", label: "12-month momentum (skipping the last month)" },
  { key: "distSma50", group: "Price", label: "Distance from 50-day average" },
  { key: "distSma200", group: "Price", label: "Distance from 200-day average" },
  { key: "sma50vs200", group: "Price", label: "50-day average vs 200-day" },
  { key: "distHigh52", group: "Price", label: "Distance from 52-week high" },
  { key: "distLow52", group: "Price", label: "Distance from 52-week low" },
  { key: "rsi14", group: "Price", label: "RSI (14-day)" },
  { key: "relStr60", group: "Price", label: "3-month return minus SPY's" },
  { key: "vol20", group: "Volatility", label: "1-month volatility" },
  { key: "volRatio", group: "Volatility", label: "1-month vs 6-month volatility" },
  { key: "beta", group: "Volatility", label: "Beta to SPY (1 year)" },
  { key: "volSurge", group: "Volume", label: "1-week vs 10-week average volume" },
  { key: "upDownVol", group: "Volume", label: "Up-day vs down-day volume (10 weeks)" },
  // Chart patterns (1 = fired recently)
  { key: "patDoubleBottom", group: "Pattern", label: "Double bottom breakout (10 days)" },
  { key: "patBaseBreakout", group: "Pattern", label: "Flat base breakout (10 days)" },
  { key: "patCupHandle", group: "Pattern", label: "Cup with handle breakout (10 days)" },
  { key: "patBearTrap", group: "Pattern", label: "Bear trap / shakeout (10 days)" },
  { key: "patNewHigh", group: "Pattern", label: "New 52-week high (5 days)" },
  { key: "patGoldenCross", group: "Pattern", label: "Golden cross: 50-day crossed above 200-day (20 days)" },
  // Fundamentals (latest 10-Q / 10-K as filed)
  { key: "revGrowth", group: "Fundamental", label: "Revenue growth (TTM, year on year)" },
  { key: "grossMargin", group: "Fundamental", label: "Gross margin" },
  { key: "grossMarginChg", group: "Fundamental", label: "Gross margin change (1 year)" },
  { key: "opMargin", group: "Fundamental", label: "Operating margin" },
  { key: "opMarginChg", group: "Fundamental", label: "Operating margin change (1 year)" },
  { key: "netMargin", group: "Fundamental", label: "Net margin" },
  { key: "niGrowth", group: "Fundamental", label: "Net income growth (TTM)" },
  { key: "fcfMargin", group: "Fundamental", label: "Free cash flow margin" },
  { key: "equityRatio", group: "Fundamental", label: "Equity / assets (low = more debt)" },
  { key: "earningsYield", group: "Fundamental", label: "Earnings yield (inverse P/E)" },
  { key: "salesYield", group: "Fundamental", label: "Sales yield (inverse P/S)" },
  { key: "fcfYield", group: "Fundamental", label: "Free cash flow yield" },
  { key: "daysSinceFiling", group: "Fundamental", label: "Days since the last 10-Q/10-K" },
  // Market regime (the same for every stock on a day)
  { key: "mktVix", group: "Macro", label: "VIX level" },
  { key: "mktVixChg", group: "Macro", label: "VIX change (1 month)" },
  { key: "mktRate10y", group: "Macro", label: "10-year Treasury yield" },
  { key: "mktRateChg", group: "Macro", label: "10-year yield change (3 months)" },
  { key: "mktCurve", group: "Macro", label: "Yield curve (10-year minus 2-year)" },
  { key: "mktSpyTrend", group: "Macro", label: "SPY distance from its 200-day average" },
  { key: "mktSpyRet60", group: "Macro", label: "SPY 3-month return" },
  { key: "mktCorrection", group: "Macro", label: "SPY 10%+ below its 52-week high" },
  { key: "mktFtd", group: "Macro", label: "Market bottom: follow-through day (25 days)" },
  { key: "mktDistDays", group: "Macro", label: "Distribution days (25 days)" },
  // Compared across the universe on the same day
  { key: "rankMom", group: "Cross-section", label: "Momentum rank in the universe" },
  { key: "rankRet60", group: "Cross-section", label: "3-month return rank in the universe" },
  { key: "rankVol", group: "Cross-section", label: "Volatility rank in the universe" },
  { key: "sectorRel60", group: "Cross-section", label: "3-month return vs its sector" },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];
export const FEATURE_KEYS = FEATURES.map((f) => f.key) as FeatureKey[];

export const HORIZON = 20; // trading days ahead the model predicts (~1 month)

// A stock's sector, as S&P labels it (GICS). S&P 500 members carry it in
// sp500.json; the five core stocks outside the index (SPOT, WBD, RBLX, ENSG,
// RGLD) take the sector they're listed under here, translated to the same
// labels. Sustainability is a cross-industry screen, so it's skipped.
const GICS_NAME: Partial<Record<string, string>> = {
  communications: "Communication Services",
  consumer: "Consumer Discretionary",
  energy: "Energy",
  financials: "Financials",
  healthcare: "Health Care",
  industrials: "Industrials",
  technology: "Information Technology",
};
const GICS = new Map(sp500.stocks.map((s) => [s.symbol, s.sector]));
export function sectorOf(symbol: string): string {
  const home = SECTOR_KEYS.find((k) => k !== "sustainability" && (SECTORS[k].tickers as readonly string[]).includes(symbol));
  return GICS.get(symbol) ?? (home && GICS_NAME[home]) ?? "Other";
}

export type PanelInput = {
  bars: Map<string, Bars>; // split- and dividend-adjusted, incl. SPY
  rawCloses: Map<string, Map<string, number>>; // unadjusted closes by date, for market caps
  fundamentals: Map<string, FundamentalSnapshot[]>;
  macro: Record<MacroKey, MacroSeries>;
};
export type PanelRow = {
  symbol: string;
  date: string;
  day: number; // index into SPY's trading days
  x: Float64Array; // in FEATURE_KEYS order
  fwd: number; // next-HORIZON-day return minus SPY's; NaN when not yet known
};

// --- small helpers ---------------------------------------------------------

function rollingMean(a: number[], n: number): number[] {
  const out = a.map(() => NaN);
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i];
    if (i >= n) s -= a[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}
const std = (a: number[]) => {
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};
// Latest value dated strictly before `date` (macro data for a day is
// published after it, so the model only gets yesterday's).
function asOf(series: MacroSeries, date: string): number {
  let lo = 0;
  let hi = series.t.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series.t[mid] < date) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best < 0 ? NaN : series.v[best];
}
const n = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? NaN : v);

export function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

// Percentile rank (0 = lowest, 1 = highest) of each value; NaNs stay NaN.
export function percentileRanks(values: number[]): number[] {
  const idx = values.map((v, i) => [v, i] as const).filter(([v]) => Number.isFinite(v));
  idx.sort((a, b) => a[0] - b[0]);
  const out = values.map(() => NaN);
  idx.forEach(([, i], r) => (out[i] = idx.length > 1 ? r / (idx.length - 1) : 0.5));
  return out;
}

// --- the panel ------------------------------------------------------------

// Builds one row per stock for each SPY trading-day index in `days`.
export function buildPanel(input: PanelInput, symbols: string[], days: number[]): PanelRow[] {
  const spy = input.bars.get("SPY");
  if (!spy) throw new Error("SPY bars are required");
  const F = FEATURE_KEYS.length;
  const col = Object.fromEntries(FEATURE_KEYS.map((k, i) => [k, i])) as Record<FeatureKey, number>;

  // Market features, once per SPY day.
  const spySma200 = rollingMean(spy.c, 200);
  const ftdFlags = followThroughDays(spy);
  const ftd = recentEvents(spy, (_, i) => ftdFlags[i], 25);
  const distDays = distributionDays(spy);
  const spyRet = spy.c.map((c, i) => (i > 0 ? c / spy.c[i - 1] - 1 : 0));
  const market = (d: number) => {
    const date = spy.t[d];
    const vix = asOf(input.macro.VIXCLS, date);
    const y10 = asOf(input.macro.DGS10, date);
    const dayMs = Date.parse(date);
    const back = (calendarDays: number) => new Date(dayMs - calendarDays * 86_400_000).toISOString().slice(0, 10);
    let high = -Infinity;
    for (let k = Math.max(0, d - 251); k <= d; k++) high = Math.max(high, spy.c[k]);
    return {
      mktVix: vix,
      mktVixChg: vix - asOf(input.macro.VIXCLS, back(30)),
      mktRate10y: y10,
      mktRateChg: y10 - asOf(input.macro.DGS10, back(91)),
      mktCurve: y10 - asOf(input.macro.DGS2, date),
      mktSpyTrend: spy.c[d] / spySma200[d] - 1,
      mktSpyRet60: d >= 60 ? spy.c[d] / spy.c[d - 60] - 1 : NaN,
      mktCorrection: spy.c[d] < high * 0.9 ? 1 : 0,
      mktFtd: ftd[d],
      mktDistDays: distDays[d],
    };
  };

  const rows: PanelRow[] = [];
  const wanted = new Set(days);
  for (const symbol of symbols) {
    const b = input.bars.get(symbol);
    if (!b || b.c.length < 260) continue;
    const at = new Map(b.t.map((t, i) => [t, i]));
    const sma50 = rollingMean(b.c, 50);
    const sma200 = rollingMean(b.c, 200);
    const avgVol5 = rollingMean(b.v, 5);
    const avgVol50 = rollingMean(b.v, 50);
    const rets = b.c.map((c, i) => (i > 0 ? c / b.c[i - 1] - 1 : 0));
    const pats = {
      patDoubleBottom: recentEvents(b, doubleBottom, 10),
      patBaseBreakout: recentEvents(b, baseBreakout, 10),
      patCupHandle: recentEvents(b, cupWithHandle, 10),
      patBearTrap: recentEvents(b, bearTrap, 10),
      patNewHigh: recentEvents(b, newHigh, 5),
      patGoldenCross: recentEvents(b, (_, i) => i > 200 && sma50[i] > sma200[i] && sma50[i - 1] <= sma200[i - 1], 20),
    };
    const snaps = input.fundamentals.get(symbol) ?? [];
    const raw = input.rawCloses.get(symbol);
    const filingDay = new Map<string, number>(); // filing date -> first bar on or after it

    for (const d of days) {
      if (!wanted.has(d)) continue;
      const i = at.get(spy.t[d]);
      if (i == null || i < 252) continue;
      const x = new Float64Array(F).fill(NaN);
      const set = (k: FeatureKey, v: number) => (x[col[k]] = v);
      const c = b.c[i];
      const ret = (k: number) => c / b.c[i - k] - 1;

      set("ret5", ret(5));
      set("ret20", ret(20));
      set("ret60", ret(60));
      set("ret120", ret(120));
      set("mom12_1", b.c[i - 21] / b.c[i - 252] - 1);
      set("distSma50", c / sma50[i] - 1);
      set("distSma200", c / sma200[i] - 1);
      set("sma50vs200", sma50[i] / sma200[i] - 1);
      let hi = -Infinity;
      let lo = Infinity;
      for (let k = i - 251; k <= i; k++) {
        hi = Math.max(hi, b.h[k]);
        lo = Math.min(lo, b.l[k]);
      }
      set("distHigh52", c / hi - 1);
      set("distLow52", c / lo - 1);
      set("relStr60", ret(60) - (spy.c[d] / spy.c[d - 60] - 1));

      // RSI: average gain / average loss over 14 days, scaled 0–100.
      let gain = 0;
      let loss = 0;
      for (let k = i - 13; k <= i; k++) {
        if (rets[k] > 0) gain += rets[k];
        else loss -= rets[k];
      }
      set("rsi14", loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));

      // Volatility: standard deviation of daily returns, annualised (×√252).
      const v20 = std(rets.slice(i - 19, i + 1)) * Math.sqrt(252);
      set("vol20", v20);
      set("volRatio", v20 / (std(rets.slice(i - 119, i + 1)) * Math.sqrt(252)));
      // Beta: how much the stock moves per 1% move in SPY, over a year.
      let sxy = 0;
      let sxx = 0;
      for (let k = 0; k < 252; k++) {
        const m = spyRet[d - k];
        sxy += m * rets[i - k];
        sxx += m * m;
      }
      set("beta", sxx ? sxy / sxx : NaN);

      set("volSurge", avgVol5[i] / avgVol50[i]);
      let up = 0;
      let down = 0;
      for (let k = i - 49; k <= i; k++) {
        if (rets[k] > 0) up += b.v[k];
        else down += b.v[k];
      }
      set("upDownVol", down ? Math.log(up / down) : NaN);

      for (const [k, series] of Object.entries(pats)) set(k as FeatureKey, series[i]);

      // Fundamentals: the latest snapshot filed before this day.
      let snap: FundamentalSnapshot | undefined;
      for (const s of snaps) if (s.known < b.t[i]) snap = s;
      if (snap) {
        set("revGrowth", n(snap.revGrowth));
        set("grossMargin", n(snap.grossMargin));
        set("grossMarginChg", n(snap.grossMarginChg));
        set("opMargin", n(snap.opMargin));
        set("opMarginChg", n(snap.opMarginChg));
        set("netMargin", n(snap.netMargin));
        set("niGrowth", n(snap.niGrowth));
        set("fcfMargin", n(snap.fcfMargin));
        set("equityRatio", n(snap.equityRatio));
        set("daysSinceFiling", (Date.parse(b.t[i]) - Date.parse(snap.known)) / 86_400_000);
        // Market cap today = shares × the unadjusted price on the filing
        // day × the stock's return since. (Share counts are as filed, so
        // they'd be wrong against a split-adjusted price.)
        const known = snap.known;
        if (!filingDay.has(known)) filingDay.set(known, b.t.findIndex((t) => t >= known));
        const fi = filingDay.get(known)!;
        const rawThen = fi >= 0 ? raw?.get(b.t[fi]) : undefined;
        const cap = snap.shares && rawThen && fi <= i ? snap.shares * rawThen * (c / b.c[fi]) : NaN;
        // Every stock here is worth billions. A cap under $2B means the
        // share count is one class of several (Palantir), so skip valuation.
        if (cap >= 2e9) {
          set("earningsYield", n(snap.niTtm) / cap);
          set("salesYield", n(snap.revTtm) / cap);
          set("fcfYield", n(snap.fcfTtm) / cap);
        }
      }

      for (const [k, v] of Object.entries(market(d))) set(k as FeatureKey, v);

      // The label: what happened next, relative to the market.
      const fwd =
        i + HORIZON < b.c.length && d + HORIZON < spy.c.length
          ? b.c[i + HORIZON] / c - 1 - (spy.c[d + HORIZON] / spy.c[d] - 1)
          : NaN;
      rows.push({ symbol, date: b.t[i], day: d, x, fwd });
    }
  }

  // Cross-sectional features: each stock against the others on the same day.
  const byDay = groupBy(rows, (r) => r.day);
  for (const group of byDay.values()) {
    const rank = (src: FeatureKey, dst: FeatureKey) =>
      percentileRanks(group.map((r) => r.x[col[src]])).forEach((v, k) => (group[k].x[col[dst]] = v));
    rank("mom12_1", "rankMom");
    rank("ret60", "rankRet60");
    rank("vol20", "rankVol");
    const sectors = groupBy(group, (r) => sectorOf(r.symbol));
    for (const r of group) {
      const peers = sectors.get(sectorOf(r.symbol))!;
      r.x[col.sectorRel60] = r.x[col.ret60] - peers.reduce((s, p) => s + p.x[col.ret60], 0) / peers.length;
    }
  }
  return rows;
}
