"use client";

// Split out from page.tsx and lazy-loaded (see the dynamic() import there) so
// recharts doesn't block the initial page load — this page already does six
// parallel API calls on mount, so trimming the JS it has to parse first helps.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { Card, chartAxisProps, chartGridProps, chartTooltipStyle } from "@/components/ui";

export default function Chart({ equityHistory }: { equityHistory: { date: string; equity: number }[] }) {
  return (
    <Card className="mt-4 h-64" padding="sm">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={equityHistory}>
          <CartesianGrid {...chartGridProps} vertical={false} />
          <XAxis dataKey="date" {...chartAxisProps} minTickGap={30} />
          <YAxis
            {...chartAxisProps}
            width={56}
            domain={["auto", "auto"]}
            tickFormatter={(value) => formatCurrencyCompact(value)}
          />
          <Tooltip formatter={(value) => formatCurrency(String(value))} contentStyle={chartTooltipStyle} />
          <Line
            type="monotone"
            dataKey="equity"
            stroke="var(--chart-line)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
