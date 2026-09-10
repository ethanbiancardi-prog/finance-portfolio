"use client";

// Split out from page.tsx and lazy-loaded per-chart (see the dynamic()
// imports there) so recharts doesn't block the initial page load — this
// page renders its inputs/table immediately, then streams the charts in.
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatMoneyMillions } from "@/lib/format";
import {
  type Rating,
  chartAxisProps,
  chartGridProps,
  chartLegendStyle,
  chartTooltipStyle,
} from "@/components/ui";

const tooltipCursor = { fill: "color-mix(in srgb, var(--foreground) 4%, transparent)" };

export function FcfChart({ data }: { data: { year: string; fcf: number; pvFcf: number }[] }) {
  return (
    <div className="mt-4 h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={2} barCategoryGap="30%">
          <CartesianGrid {...chartGridProps} vertical={false} />
          <XAxis dataKey="year" {...chartAxisProps} />
          <YAxis {...chartAxisProps} width={52} tickFormatter={(value) => formatMoneyMillions(Number(value))} />
          <Tooltip
            cursor={tooltipCursor}
            formatter={(value) => formatMoneyMillions(Number(value))}
            contentStyle={chartTooltipStyle}
          />
          <Legend wrapperStyle={chartLegendStyle} iconType="square" iconSize={8} />
          <Bar dataKey="fcf" name="FCF" fill="var(--chart-line)" fillOpacity={0.35} />
          <Bar dataKey="pvFcf" name="PV of FCF" fill="var(--chart-line-2)" />
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
    <div className="mt-3 h-28">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8 }}>
          <CartesianGrid {...chartGridProps} horizontal={false} />
          <XAxis type="number" {...chartAxisProps} tickFormatter={(value) => formatCurrency(Number(value))} />
          <YAxis type="category" dataKey="name" {...chartAxisProps} width={96} />
          <Tooltip
            cursor={tooltipCursor}
            formatter={(value) => formatCurrency(Number(value))}
            contentStyle={chartTooltipStyle}
          />
          <Bar dataKey="value" barSize={18}>
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
    <div className="mt-3 h-28">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8 }}>
          <XAxis type="number" {...chartAxisProps} tickFormatter={(value) => formatMoneyMillions(Number(value))} />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            cursor={tooltipCursor}
            formatter={(value) => formatMoneyMillions(Number(value))}
            contentStyle={chartTooltipStyle}
          />
          <Legend wrapperStyle={chartLegendStyle} iconType="square" iconSize={8} />
          <Bar dataKey="PV of Y1-Y5 FCF" stackId="ev" fill="var(--chart-line)" fillOpacity={0.35} barSize={18} />
          <Bar dataKey="PV of Terminal Value" stackId="ev" fill="var(--chart-line-2)" barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
