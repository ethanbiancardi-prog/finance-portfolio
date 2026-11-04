// Types and labels for public/data/diffusion.json, the information-diffusion
// study built offline by scripts/diffusion/. Pure, so the page can import it.

export type DiffusionCheckpoint = { key: string; label: string; kind: "pre" | "news" | "minute" | "day" };
export type DiffusionCategory = { key: string; label: string; what: string; items: string[]; events: number };
export type Drift = { mean: number; t: number; n: number } | null;

export type DiffusionGroup = {
  category: string;
  direction: "up" | "down" | "flat" | "all";
  timing: "all" | "intraday" | "overnight";
  size: "all" | "large" | "small";
  n: number;
  path: (number | null)[]; // average abnormal return at each checkpoint (0.02 = +2%)
  counts: number[]; // events with a value at each checkpoint
  drift20: Drift; // average move from day-1 close to day 20
  drift60: Drift; // ...to day 60
  halfLife: string | null; // checkpoint key where the path first reached half its 60-day level
};

export type DiffusionData = {
  generated: string;
  period: { from: string; to: string };
  events: number;
  companies: number;
  moveThreshold: number;
  checkpoints: DiffusionCheckpoint[];
  categories: DiffusionCategory[];
  groups: DiffusionGroup[];
  sources: string[];
};

// "d20" -> "20 trading days", "5m" -> "5 minutes"
export function checkpointWords(key: string | null): string {
  if (!key) return "never clearly";
  const words: Record<string, string> = {
    "1m": "1 minute", "5m": "5 minutes", "15m": "15 minutes", "30m": "30 minutes", "1h": "1 hour", "2h": "2 hours", "4h": "4 hours",
    d1: "day 1", d2: "2 trading days", d3: "3 trading days", d5: "5 trading days", d10: "10 trading days", d20: "20 trading days", d40: "40 trading days", d60: "60 trading days",
  };
  return words[key] ?? key;
}

// A t-statistic in words. Around 2 is the usual bar for "probably not luck";
// see the caveat on the page about events bunching up in earnings season.
export function tWords(t: number): string {
  const a = Math.abs(t);
  return a >= 3 ? "strong evidence" : a >= 2 ? "probably real" : a >= 1 ? "weak, could be luck" : "no evidence";
}
