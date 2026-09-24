"use client";

// Lazy-loaded from Portfolio.tsx so recharts stays out of the dashboard's
// first load, same as the paper-trading chart.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { Card, chartAxisProps, chartGridProps, chartTooltipStyle } from "@/components/ui";
import type { HistoryPoint } from "@/lib/portfolio";

const tick = (p: HistoryPoint) =>
  p.label === "opened"
    ? "Opened"
    : p.label === "now"
      ? "Now"
      : new Date(`${p.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function PortfolioChart({ history }: { history: HistoryPoint[] }) {
  const data = history.map((p) => ({ ...p, x: tick(p) }));
  return (
    <Card className="mt-3" padding="sm">
      <div className="mb-2 flex gap-4 text-[10px] caps text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-4 bg-[var(--accent)]" /> Your account
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed border-[var(--chart-muted)]" /> Same $ in SPY
        </span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid {...chartGridProps} vertical={false} />
            <XAxis dataKey="x" {...chartAxisProps} minTickGap={30} />
            <YAxis
              {...chartAxisProps}
              width={52}
              domain={["auto", "auto"]}
              tickFormatter={(value) => formatCurrencyCompact(value)}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              formatter={(value) => formatCurrency(String(value))}
              contentStyle={chartTooltipStyle}
            />
            <Line
              type="monotone"
              dataKey="spy"
              name="SPY"
              stroke="var(--chart-muted)"
              strokeDasharray="4 4"
              strokeWidth={1}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="equity"
              name="Your account"
              stroke="var(--accent)"
              strokeWidth={1.5}
              dot={data.length < 3 ? { r: 2, fill: "var(--accent)", stroke: "none" } : false}
              activeDot={{ r: 3, fill: "var(--accent)", stroke: "none" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
