// Shared Recharts style config. Plain data objects (not components) since
// Recharts axis/tooltip props expect literal values, not JSX wrappers.

const mono = "var(--font-geist-mono), ui-monospace, monospace";

export const chartAxisProps = {
  stroke: "var(--chart-muted)",
  tick: { fontSize: 10, fontFamily: mono, fill: "var(--chart-muted)" },
  tickLine: false,
  axisLine: false,
} as const;

export const chartGridProps = {
  stroke: "var(--chart-grid)",
  strokeDasharray: "2 4",
} as const;

export const chartTooltipStyle = {
  background: "var(--chart-tooltip-bg)",
  border: "1px solid var(--border)",
  borderRadius: 2,
  fontSize: 11,
  fontFamily: mono,
  padding: "6px 8px",
} as const;

export const chartLegendStyle = { fontSize: 10, fontFamily: mono, letterSpacing: "0.08em" } as const;
