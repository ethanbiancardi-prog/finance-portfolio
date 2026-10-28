// Shared Recharts style config. Plain data objects (not components) since
// Recharts axis/tooltip props expect literal values, not JSX wrappers.

// Chart text matches the rest of the site.
const mono = '"Times New Roman", Times, serif';

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

// A % axis on round steps (0.5%, 1%, 2%...) giving about four to six
// gridlines, with bounds on those steps that always include 0%. Values are
// decimals: 0.05 = +5%.
export function percentAxis(values: number[]) {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const steps = [0.0025, 0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5];
  const step = steps.find((s) => (hi - lo) / s <= 5) ?? 10;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step || step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 10_000) / 10_000);
  return { domain: [min, max] as [number, number], ticks, decimals: step < 0.01 ? 1 : 0 };
}
