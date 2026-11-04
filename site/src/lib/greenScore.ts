// Types and labels for public/data/green.json, the Green Score built offline
// by scripts/green/build-green.ts. Pure, so client components can import it.
//
// The score compares each company only with its own industry: each pillar is
// a 0-100 percentile among industry peers (100 = cleanest in the industry),
// and the Green Score is their weighted average. 50 is the middle of the
// industry, not a pass mark.

export type PillarKey = "carbonIntensity" | "carbonTrend" | "toxics" | "target";

export type GreenPillar = {
  value: number | null; // raw measure (t/$1M, % change, lb/$1M, or target points)
  score: number | null; // 0-100 within the industry; null if it doesn't count there
  counts: boolean; // part of this company's score
  note: string; // plain-English reading of the raw value
};

export type GreenCompany = {
  ticker: string;
  name: string;
  industry: string;
  score: number | null;
  rank: number | null; // 1 = greenest in its industry
  of: number;
  pillars: Record<PillarKey, GreenPillar>;
};

export type GreenData = {
  generated: string;
  weights: Record<PillarKey, number>;
  years: { carbon: number; carbonFrom: number; toxics: number };
  sources: string[];
  industries: Record<string, { label: string; count: number; pillarsCounted: PillarKey[] }>;
  companies: GreenCompany[];
};

export const PILLARS: { key: PillarKey; label: string; short: string; what: string }[] = [
  { key: "carbonIntensity", label: "Carbon intensity", short: "CO₂", what: "Greenhouse gas per $1M of sales from its own US sites. Lower is greener." },
  { key: "carbonTrend", label: "Carbon trend", short: "Trend", what: "How that intensity has changed since 2019. Falling is greener." },
  { key: "toxics", label: "Toxic releases", short: "Toxic", what: "Pounds of toxic chemicals released per $1M of sales (EPA). Lower is greener." },
  { key: "target", label: "Climate target", short: "Target", what: "Has an outside group (SBTi) checked and approved its plan to cut emissions?" },
];

// A colour for a 0-100 score: red at the bottom of the industry, amber in the
// middle, green at the top. Uses the status tokens, so it works in any theme.
export function scoreColor(score: number | null): string {
  if (score == null) return "var(--chart-muted)";
  return score >= 60 ? "var(--status-good)" : score >= 40 ? "var(--status-average)" : "var(--status-bad)";
}

// Display names come from SEC filings ("NUCOR CORP"); tidy them for the page.
export function tidyName(n: string, ticker: string): string {
  if (n === ticker) return ticker;
  return n
    .replace(/\s*\/[A-Z]{2,3}\/?$/, "")
    .split(" ")
    .map((w) => (w === w.toUpperCase() && w.length > 3 && !w.includes("&") ? w.charAt(0) + w.slice(1).toLowerCase() : w))
    .join(" ")
    .replace(/,?\s+(Inc|Corp|Co|Plc|Ltd|Llc|Lp|Corporation|Incorporated)\.?$/i, "");
}
