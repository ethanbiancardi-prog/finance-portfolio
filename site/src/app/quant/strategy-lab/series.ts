import type { StrategyKey } from "@/lib/strategyLab";

// One fixed color per strategy, so a strategy keeps its color whichever
// lines are switched on. Buy-and-hold is the benchmark and is drawn the way
// the site always draws SPY: dashed and muted.
export const SERIES: Record<StrategyKey, { color: string; dashed?: boolean }> = {
  buyhold: { color: "var(--chart-muted)", dashed: true },
  trend: { color: "var(--series-1)" },
  momentum: { color: "var(--series-2)" },
  meanrev: { color: "var(--series-3)" },
  breakout: { color: "var(--series-4)" },
};
