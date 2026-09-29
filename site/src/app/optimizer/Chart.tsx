"use client";

// Split out from page.tsx and lazy-loaded (see the dynamic() import there) so
// recharts only downloads once a frontier has actually been built, instead of
// blocking the initial page load.
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { formatPercent } from "@/lib/format";
import { Card, chartAxisProps, chartGridProps, chartTooltipStyle } from "@/components/ui";

type SampledPortfolio = { weights: number[]; return: number; volatility: number; sharpe: number };

// Draws nothing at each point, so the frontier series renders as just its
// connecting line.
const NoDot = () => <g />;

// The portfolio the risk slider is on: an open ring so it reads as "you are
// here" on top of the line and the cloud.
const Ring = (props: { cx?: number; cy?: number }) => (
  <circle cx={props.cx} cy={props.cy} r={5} fill="none" stroke="var(--foreground)" strokeWidth={1.5} />
);

// The account's current portfolio: a red cross, so it reads as "you are
// here" and stays distinct from the ring on the frontier.
const Cross = (props: { cx?: number; cy?: number }) => {
  const x = props.cx ?? 0, y = props.cy ?? 0;
  return (
    <g stroke="var(--status-bad)" strokeWidth={2} strokeLinecap="round">
      <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} />
      <line x1={x - 5} y1={y + 5} x2={x + 5} y2={y - 5} />
    </g>
  );
};

export default function Chart({
  samples,
  frontier,
  selectedSeries,
  currentSeries = [],
  minVarianceSeries,
  maxSharpeSeries,
}: {
  samples: SampledPortfolio[];
  frontier: SampledPortfolio[];
  selectedSeries: SampledPortfolio[];
  currentSeries?: SampledPortfolio[];
  minVarianceSeries: SampledPortfolio[];
  maxSharpeSeries: SampledPortfolio[];
}) {
  return (
    <Card className="mt-3 h-72" padding="sm">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid {...chartGridProps} />
          <XAxis
            dataKey="volatility"
            type="number"
            name="Volatility"
            {...chartAxisProps}
            tickFormatter={(v) => formatPercent(v)}
          />
          <YAxis
            dataKey="return"
            type="number"
            name="Return"
            {...chartAxisProps}
            width={56}
            tickFormatter={(v) => formatPercent(v)}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }}
            formatter={(value) => formatPercent(Number(value))}
            contentStyle={chartTooltipStyle}
          />
          <Scatter data={samples} fill="var(--chart-muted)" opacity={0.3} shape="square" />
          <Scatter
            data={frontier}
            name="Efficient frontier"
            line={{ stroke: "var(--chart-line-2)", strokeWidth: 1.5 }}
            lineType="joint"
            shape={NoDot}
            isAnimationActive={false}
          />
          <Scatter data={minVarianceSeries} fill="var(--chart-line)" shape="square" />
          <Scatter data={maxSharpeSeries} fill="var(--chart-line-2)" shape="square" />
          <Scatter data={selectedSeries} shape={Ring} isAnimationActive={false} />
          <Scatter data={currentSeries} shape={Cross} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </Card>
  );
}
