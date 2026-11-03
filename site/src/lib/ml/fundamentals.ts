// Point-in-time fundamentals for the ML model, from SEC's company-facts feed
// (every number a company has ever tagged in a 10-Q or 10-K).
//
// "Point in time" is the whole job here. A backtest that uses today's
// version of 2019's numbers cheats twice: it knows them before they were
// filed, and it sees restatements made years later. So every figure is
// keyed by the date it was *first filed*, and a snapshot for any day uses
// only what had been filed by then.
//
// Flows (revenue, profit, cash flow) are rebuilt as single quarters, then
// summed into trailing-twelve-month (TTM) figures. Companies tag quarters in
// two ways: a 3-month figure, or a year-to-date one (cash flow statements in
// a 10-Q are always year-to-date, and Q4 only ever appears inside the annual
// total). A quarter missing as a 3-month figure is the difference of two
// year-to-date figures with the same start: 9 months minus 6 months = Q3,
// full year minus 9 months = Q4.

type Fact = { start?: string; end: string; val: number; form: string; filed: string };
type Quarter = { end: string; val: number; filed: string };

const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;
const FORMS = /^10-[KQ]/;

const REVENUE_TAGS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "SalesRevenueNet",
  "RevenuesNetOfInterestExpense",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function facts(companyFacts: any, tag: string, ns = "us-gaap", unit = "USD"): Fact[] {
  const rows: Fact[] = companyFacts?.facts?.[ns]?.[tag]?.units?.[unit] ?? [];
  // A figure is repeated in every later filing that shows it as a
  // comparative; keep the first filing of each period, the original.
  const first = new Map<string, Fact>();
  for (const r of rows) {
    if (!FORMS.test(r.form) || !Number.isFinite(r.val)) continue;
    const k = `${r.start ?? ""}|${r.end}`;
    const seen = first.get(k);
    if (!seen || r.filed < seen.filed) first.set(k, r);
  }
  return [...first.values()];
}

// Single quarters from 3-month and year-to-date figures (see top of file).
function quarters(points: Fact[]): Quarter[] {
  const out = new Map<string, Quarter>();
  for (const p of points) {
    if (p.start && days(p.start, p.end) >= 80 && days(p.start, p.end) <= 100) out.set(p.end, p);
  }
  const byStart = new Map<string, Fact[]>();
  for (const p of points) if (p.start) byStart.set(p.start, [...(byStart.get(p.start) ?? []), p]);
  for (const group of byStart.values()) {
    group.sort((a, b) => a.end.localeCompare(b.end));
    for (let k = 1; k < group.length; k++) {
      const [a, b] = [group[k - 1], group[k]];
      const gap = days(a.end, b.end);
      if (out.has(b.end) || gap < 80 || gap > 100) continue;
      out.set(b.end, { end: b.end, val: b.val - a.val, filed: a.filed > b.filed ? a.filed : b.filed });
    }
  }
  return [...out.values()].sort((a, b) => a.end.localeCompare(b.end));
}

// Several tags can mean "revenue" and companies switch between them; for
// each quarter, take the first tag in the list that has it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function quartersAny(companyFacts: any, tags: string[]): Quarter[] {
  const out = new Map<string, Quarter>();
  for (const tag of tags) for (const q of quarters(facts(companyFacts, tag))) if (!out.has(q.end)) out.set(q.end, q);
  return [...out.values()].sort((a, b) => a.end.localeCompare(b.end));
}

// Sum of the 4 quarters ending `back` quarters before the latest one known
// by `asOf` — `back` = 0 is the latest TTM, 4 is the TTM a year earlier.
// Null unless the 4 quarters are consecutive (a missing quarter would make
// "twelve months" really nine).
function ttm(qs: Quarter[], asOf: string, back = 0): number | null {
  const known = qs.filter((q) => q.filed <= asOf);
  const window = known.slice(known.length - 4 - back, known.length - back);
  if (window.length < 4) return null;
  if (days(window[0].end, window[3].end) < 250 || days(window[0].end, window[3].end) > 290) return null;
  return window.reduce((s, q) => s + q.val, 0);
}

// Latest value of a balance-sheet (point-in-time) figure filed by `asOf`.
function latest(points: Fact[], asOf: string): number | null {
  let best: Fact | null = null;
  for (const p of points) if (p.filed <= asOf && (!best || p.end > best.end)) best = p;
  return best?.val ?? null;
}

const ratio = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : a / b);
const growth = (now: number | null, then: number | null) =>
  now == null || then == null || then === 0 ? null : Math.max(-3, Math.min(3, (now - then) / Math.abs(then)));

export type FundamentalSnapshot = {
  known: string; // filing date: the first day these numbers were public
  revGrowth: number | null; // TTM revenue vs a year earlier
  grossMargin: number | null; // TTM gross profit / revenue
  grossMarginChg: number | null; // change in that margin over the year, in points
  opMargin: number | null;
  opMarginChg: number | null;
  netMargin: number | null;
  niGrowth: number | null; // TTM net income vs a year earlier, capped at ±300%
  fcfMargin: number | null; // (operating cash flow − capital spending) / revenue
  equityRatio: number | null; // shareholders' equity / total assets: low = more debt
  // For valuation, which needs a price (lib/ml/features.ts):
  revTtm: number | null;
  niTtm: number | null;
  fcfTtm: number | null;
  shares: number | null;
};

// One snapshot per filing date, oldest first.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fundamentalSnapshots(companyFacts: any): FundamentalSnapshot[] {
  const rev = quartersAny(companyFacts, REVENUE_TAGS);
  const gp = quartersAny(companyFacts, ["GrossProfit"]);
  const cost = quartersAny(companyFacts, ["CostOfGoodsAndServicesSold", "CostOfRevenue"]);
  const op = quartersAny(companyFacts, ["OperatingIncomeLoss"]);
  const ni = quartersAny(companyFacts, ["NetIncomeLoss"]);
  const ocf = quartersAny(companyFacts, ["NetCashProvidedByUsedInOperatingActivities"]);
  const capex = quartersAny(companyFacts, ["PaymentsToAcquirePropertyPlantAndEquipment"]);
  const assets = facts(companyFacts, "Assets");
  const equity = facts(companyFacts, "StockholdersEquity");
  const shares = facts(companyFacts, "EntityCommonStockSharesOutstanding", "dei", "shares");

  const filedDates = [...new Set([...rev, ...ni].map((q) => q.filed))].sort();
  return filedDates.map((d) => {
    const revNow = ttm(rev, d);
    const revThen = ttm(rev, d, 4);
    // Gross profit isn't always tagged; revenue minus cost of revenue is the same thing.
    const gpAt = (back: number) => ttm(gp, d, back) ?? (revNow == null ? null : subtract(ttm(rev, d, back), ttm(cost, d, back)));
    const gm = ratio(gpAt(0), revNow);
    const gmThen = ratio(gpAt(4), revThen);
    const om = ratio(ttm(op, d), revNow);
    const omThen = ratio(ttm(op, d, 4), revThen);
    const niNow = ttm(ni, d);
    const ocfNow = ttm(ocf, d);
    const capexNow = ttm(capex, d);
    const fcf = ocfNow == null ? null : ocfNow - (capexNow ?? 0);
    return {
      known: d,
      revGrowth: growth(revNow, revThen),
      grossMargin: gm,
      grossMarginChg: gm == null || gmThen == null ? null : gm - gmThen,
      opMargin: om,
      opMarginChg: om == null || omThen == null ? null : om - omThen,
      netMargin: ratio(niNow, revNow),
      niGrowth: growth(niNow, ttm(ni, d, 4)),
      fcfMargin: ratio(fcf, revNow),
      equityRatio: ratio(latest(equity, d), latest(assets, d)),
      revTtm: revNow,
      niTtm: niNow,
      fcfTtm: fcf,
      shares: latest(shares, d),
    };
  });
}

function subtract(a: number | null, b: number | null) {
  return a == null || b == null ? null : a - b;
}
