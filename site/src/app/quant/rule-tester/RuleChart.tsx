"use client";

// Lazy-loaded from RuleTester.tsx so recharts stays out of the first load.
// A normal (not log) scale: the page is for people new to this, and over
// these years nothing grows so much that the market line gets squashed.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartAxisProps, chartGridProps, chartTooltipStyle } from "@/components/ui";
import { formatCurrencyCompact } from "@/lib/format";

export type ChartPoint = { date: string; rules: number; spy: number };

const NAMES: Record<string, string> = { rules: "Your rules", spy: "S&P 500 (SPY)" };

export default function RuleChart({ data }: { data: ChartPoint[] }) {
  // One tick per year, on its first week, so a year label never repeats.
  const ticks = data.filter((p, i) => i > 0 && p.date.slice(0, 4) !== data[i - 1].date.slice(0, 4)).map((p) => p.date);
  return (
    <div className="h-64 sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...chartGridProps} vertical={false} />
          <XAxis dataKey="date" {...chartAxisProps} ticks={ticks} minTickGap={20} tickFormatter={(d: string) => d.slice(0, 4)} />
          <YAxis {...chartAxisProps} width={52} domain={["auto", "auto"]} tickFormatter={(v) => formatCurrencyCompact(v)} />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={chartTooltipStyle}
            labelFormatter={(d) =>
              new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            }
            formatter={(value, key) => [`$${Math.round(Number(value)).toLocaleString()}`, NAMES[key as string] ?? key]}
          />
          <Line type="monotone" dataKey="spy" stroke="var(--chart-muted)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="rules"
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "var(--series-1)", stroke: "var(--panel)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
