"use client";

// Split out from page.tsx and lazy-loaded (see the dynamic() import there) so
// recharts — the heaviest dependency on this page — only downloads once a
// simulation has actually run, instead of blocking the initial page load.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { Card, chartAxisProps, chartGridProps, chartTooltipStyle } from "@/components/ui";

type YearlyBand = { year: number; p10: number; p50: number; p90: number };

export default function Chart({ bands }: { bands: YearlyBand[] }) {
  return (
    <Card className="mt-3 h-64" padding="sm">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={bands}>
          <CartesianGrid {...chartGridProps} vertical={false} />
          <XAxis dataKey="year" {...chartAxisProps} />
          <YAxis {...chartAxisProps} width={52} tickFormatter={(value) => formatCurrencyCompact(value)} />
          <Tooltip cursor={{ stroke: "var(--border)" }} formatter={(value) => formatCurrency(Number(value))} contentStyle={chartTooltipStyle} />
          <Line
            type="monotone"
            dataKey="p90"
            stroke="var(--chart-muted)"
            strokeDasharray="4 4"
            strokeWidth={1}
            dot={false}
            name="90th percentile"
          />
          <Line
            type="monotone"
            dataKey="p50"
            stroke="var(--chart-line)"
            strokeWidth={1.5}
            dot={false}
            name="Median"
          />
          <Line
            type="monotone"
            dataKey="p10"
            stroke="var(--chart-muted)"
            strokeDasharray="4 4"
            strokeWidth={1}
            dot={false}
            name="10th percentile"
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
