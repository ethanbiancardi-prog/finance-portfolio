"use client";

// Lazy-loaded from CarbonExplorer.tsx so recharts stays out of the first load.
// One company's direct emissions per year (bars) and its carbon intensity
// (line, right axis), so you can see whether a cut in tons came from cleaner
// operations or just from selling more (intensity falls) or less (it rises).
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartAxisProps, chartGridProps, chartTooltipStyle } from "@/components/ui";

export type TrendPoint = { year: string; tons: number; intensity: number | null };

export default function CarbonTrend({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid {...chartGridProps} vertical={false} />
          <XAxis dataKey="year" {...chartAxisProps} />
          <YAxis yAxisId="t" {...chartAxisProps} width={44} tickFormatter={(v) => `${(v / 1e6).toFixed(v < 1e7 ? 1 : 0)}M`} />
          <YAxis yAxisId="i" orientation="right" {...chartAxisProps} width={40} tickFormatter={(v) => Math.round(v).toLocaleString()} />
          <Tooltip
            cursor={{ fill: "var(--border)", opacity: 0.3 }}
            contentStyle={chartTooltipStyle}
            formatter={(value, key) =>
              key === "tons"
                ? [`${(Number(value) / 1e6).toFixed(2)} million t`, "Emissions"]
                : [`${Math.round(Number(value)).toLocaleString()} t per $1M sales`, "Intensity"]
            }
          />
          <Bar yAxisId="t" dataKey="tons" fill="var(--series-3)" fillOpacity={0.55} isAnimationActive={false} />
          <Line yAxisId="i" type="monotone" dataKey="intensity" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
