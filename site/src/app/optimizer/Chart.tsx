"use client";

// Split out from page.tsx and lazy-loaded (see the dynamic() import there) so
// recharts only downloads once a frontier has actually been built, instead of
// blocking the initial page load.
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { formatPercent } from "@/lib/format";
import { Card, chartAxisProps, chartGridProps, chartTooltipStyle } from "@/components/ui";

type SampledPortfolio = { weights: number[]; return: number; volatility: number; sharpe: number };

export default function Chart({
  samples,
  minVarianceSeries,
  maxSharpeSeries,
}: {
  samples: SampledPortfolio[];
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
          <Scatter data={minVarianceSeries} fill="var(--chart-line)" shape="square" />
          <Scatter data={maxSharpeSeries} fill="var(--chart-line-2)" shape="square" />
        </ScatterChart>
      </ResponsiveContainer>
    </Card>
  );
}
