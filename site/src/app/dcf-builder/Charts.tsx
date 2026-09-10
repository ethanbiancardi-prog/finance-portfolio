"use client";

// Split out from page.tsx and lazy-loaded per-chart (see the dynamic()
// imports there) so recharts doesn't block the initial page load — this
// page renders its inputs/table immediately, then streams the charts in.
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatMoneyMillions } from "@/lib/format";
import { type Rating, chartAxisProps, chartGridProps, chartTooltipStyle } from "@/components/ui";

export function FcfChart({ data }: { data: { year: string; fcf: number; pvFcf: number }[] }) {
  return (
    <div className="mt-6 h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid {...chartGridProps} vertical={false} />
          <XAxis dataKey="year" {...chartAxisProps} />
          <YAxis {...chartAxisProps} width={56} tickFormatter={(value) => formatMoneyMillions(Number(value))} />
          <Tooltip formatter={(value) => formatMoneyMillions(Number(value))} contentStyle={chartTooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="fcf" name="FCF" fill="var(--chart-line)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="pvFcf" name="PV of FCF" fill="var(--chart-line-2)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ValueComparisonChart({
  data,
}: {
  data: { name: string; value: number; rating: Rating | null }[];
}) {
  return (
    <div className="mt-4 h-32">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
          <CartesianGrid {...chartGridProps} horizontal={false} />
          <XAxis type="number" {...chartAxisProps} tickFormatter={(value) => formatCurrency(Number(value))} />
          <YAxis type="category" dataKey="name" {...chartAxisProps} width={100} />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={chartTooltipStyle} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={28}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.rating ? `var(--status-${entry.rating})` : "var(--chart-muted)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EvCompositionChart({
  data,
}: {
  data: { name: string; "PV of Y1-Y5 FCF": number; "PV of Terminal Value": number }[];
}) {
  return (
    <div className="mt-4 h-24">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
          <XAxis type="number" {...chartAxisProps} tickFormatter={(value) => formatMoneyMillions(Number(value))} />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip formatter={(value) => formatMoneyMillions(Number(value))} contentStyle={chartTooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="PV of Y1-Y5 FCF" stackId="ev" fill="var(--chart-line)" radius={[3, 0, 0, 3]} barSize={28} />
          <Bar
            dataKey="PV of Terminal Value"
            stackId="ev"
            fill="var(--chart-line-2)"
            radius={[0, 3, 3, 0]}
            barSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
