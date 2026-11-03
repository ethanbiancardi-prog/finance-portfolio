// Chart patterns, as the ML model sees them (lib/ml/features.ts). Each
// detector turns a named pattern into a yes/no "it happened on day i" event,
// looking only at bars up to and including day i, so nothing peeks at the
// future. The feature the model gets is "did this fire in the last N days".
//
// The definitions follow the usual textbook (William O'Neil's) versions,
// with the fuzzy words ("roughly equal", "shallow") pinned to numbers. The
// numbers are judgement calls; the model decides whether the patterns are
// worth anything.

import type { Bars } from "./data";

const maxOf = (a: number[], from: number, to: number) => {
  let m = -Infinity;
  for (let k = from; k <= to; k++) if (a[k] > m) m = a[k];
  return m;
};
const argMin = (a: number[], from: number, to: number) => {
  let j = from;
  for (let k = from + 1; k <= to; k++) if (a[k] < a[j]) j = k;
  return j;
};
const argMax = (a: number[], from: number, to: number) => {
  let j = from;
  for (let k = from + 1; k <= to; k++) if (a[k] > a[j]) j = k;
  return j;
};
const avg = (a: number[], from: number, to: number) => {
  let s = 0;
  for (let k = from; k <= to; k++) s += a[k];
  return s / (to - from + 1);
};

// Double bottom (a "W"): the price falls to a low, bounces at least 10%,
// falls back to about the same low (within 4% either way) at least two weeks
// later, then closes above the bounce's high. The event is that breakout day.
export function doubleBottom(b: Bars, i: number): boolean {
  if (i < 70) return false;
  const first = argMin(b.l, i - 65, i - 25);
  const second = argMin(b.l, first + 10, i - 1);
  const low1 = b.l[first];
  const low2 = b.l[second];
  if (low2 < low1 * 0.96 || low2 > low1 * 1.04) return false;
  const middle = maxOf(b.h, first + 1, second - 1);
  if (middle < Math.min(low1, low2) * 1.1) return false;
  return b.c[i] > middle && b.c[i - 1] <= middle;
}

// Flat base breakout (a "sound base"): after a run up of at least 20%, the
// stock moves sideways for six weeks in a range no wider than 15%, then
// closes above the top of that range on volume at least 40% above normal.
export function baseBreakout(b: Bars, i: number): boolean {
  if (i < 160) return false;
  const top = maxOf(b.h, i - 30, i - 1);
  const bottom = Math.min(...b.l.slice(i - 30, i));
  if ((top - bottom) / top > 0.15) return false;
  const priorLow = Math.min(...b.c.slice(i - 150, i - 30));
  if (b.c[i - 30] < priorLow * 1.2) return false;
  return b.c[i] > top && b.v[i] >= 1.4 * avg(b.v, i - 50, i - 1);
}

// Cup with handle: a high (the left lip), a rounded 12–35% decline, a climb
// back to within 5% of that high (the right lip), then a short, shallow dip
// (the handle: at least a week, no more than 12% deep, staying in the cup's
// upper half), and a close above the handle's high.
export function cupWithHandle(b: Bars, i: number): boolean {
  if (i < 210) return false;
  const left = argMax(b.h, i - 200, i - 40);
  const bottom = argMin(b.l, left + 1, i - 6);
  const lip = b.h[left];
  const depth = 1 - b.l[bottom] / lip;
  if (depth < 0.12 || depth > 0.35 || bottom - left < 15) return false;
  const right = argMax(b.h, bottom + 1, i - 1);
  if (b.h[right] < lip * 0.95 || i - right < 5 || i - right > 25) return false;
  const handleLow = Math.min(...b.l.slice(right + 1, i));
  if (handleLow < b.h[right] * 0.88) return false;
  if (handleLow < b.l[bottom] + (lip - b.l[bottom]) / 2) return false;
  return b.c[i] > b.h[right] && b.c[i - 1] <= b.h[right];
}

// Bear trap (a "shakeout"): the price breaks at least 2% below its lowest
// low of the previous two months, which tempts sellers out, then closes back
// above that support within five days. The event is the close back above.
export function bearTrap(b: Bars, i: number): boolean {
  if (i < 70) return false;
  const support = Math.min(...b.l.slice(i - 65, i - 5));
  const undercut = Math.min(...b.l.slice(i - 5, i)) < support * 0.98;
  return undercut && b.c[i] > support && b.c[i - 1] <= support;
}

// New 52-week closing high.
export function newHigh(b: Bars, i: number): boolean {
  return i >= 252 && b.c[i] > maxOf(b.c, i - 252, i - 1);
}

// Market-wide patterns, read off SPY.
//
// Market bottom (O'Neil's "follow-through day"): after SPY falls at least
// 10% from its 52-week high, a rally attempt starts on the first up day
// after the lowest low. On day 4 or later of that attempt, a gain of at
// least 1.25% on more volume than the day before confirms the bottom.
// Undercutting the low resets the count. Returns one flag per bar.
export function followThroughDays(spy: Bars): boolean[] {
  const out = spy.c.map(() => false);
  let low = Infinity; // lowest low of the current correction
  let rallyDay = 0; // 0 = no rally attempt under way
  for (let i = 252; i < spy.c.length; i++) {
    const high = maxOf(spy.c, i - 252, i - 1);
    if (spy.c[i] >= high) {
      low = Infinity; // back at a high without a follow-through: correction over
      rallyDay = 0;
      continue;
    }
    const inCorrection = spy.l[i] < high * 0.9 || low < Infinity;
    if (!inCorrection) continue;
    if (spy.l[i] < low) {
      low = spy.l[i];
      rallyDay = 0;
      continue;
    }
    if (rallyDay === 0 && spy.c[i] > spy.c[i - 1]) rallyDay = 1;
    else if (rallyDay > 0) rallyDay++;
    const gain = spy.c[i] / spy.c[i - 1] - 1;
    if (rallyDay >= 4 && rallyDay <= 25 && gain >= 0.0125 && spy.v[i] > spy.v[i - 1]) {
      out[i] = true;
      low = Infinity; // bottom confirmed; wait for the next correction
      rallyDay = 0;
    }
  }
  return out;
}

// Distribution days: SPY down at least 0.2% on more volume than the day
// before, the sign of big funds selling. Five or more in 25 days is the
// classic warning. Returns the count over the last 25 days, per bar.
export function distributionDays(spy: Bars): number[] {
  const flag = spy.c.map((c, i) => (i > 0 && c / spy.c[i - 1] - 1 <= -0.002 && spy.v[i] > spy.v[i - 1] ? 1 : 0));
  return flag.map((_, i) => {
    let n = 0;
    for (let k = Math.max(0, i - 24); k <= i; k++) n += flag[k];
    return n;
  });
}

// Turns a per-day event detector into "fired in the last `days` days" for
// every bar: 1 if so, else 0.
export function recentEvents(b: Bars, detect: (b: Bars, i: number) => boolean, days: number): number[] {
  const out = b.c.map(() => 0);
  let last = -Infinity;
  for (let i = 0; i < b.c.length; i++) {
    if (detect(b, i)) last = i;
    out[i] = i - last < days ? 1 : 0;
  }
  return out;
}
