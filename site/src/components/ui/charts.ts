// Shared Recharts style config. Plain data objects (not components) since
// Recharts axis/tooltip props expect literal values, not JSX wrappers.

export const chartAxisProps = {
  stroke: "var(--chart-muted)",
  tick: { fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const;

export const chartGridProps = {
  stroke: "var(--chart-grid)",
} as const;

export const chartTooltipStyle = {
  background: "var(--chart-tooltip-bg)",
  border: "1px solid var(--chart-grid)",
  borderRadius: 6,
  fontSize: 12,
} as const;
