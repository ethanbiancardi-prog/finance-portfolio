"use client";

// Lazy-loaded from StrategyLab.tsx so recharts stays out of the first load.
// Log scale: over ten years the best strategy ends ~19x up and the worst ~2x,
// and on a normal scale everything but the leader would be squashed flat.
// On a log scale the same % move is the same height anywhere on the chart.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { chartAxisProps, chartGridProps, chartTooltipStyle } from "@/components/ui";
import type { LabResult, StrategyKey } from "@/lib/strategyLab";
import { SERIES } from "./series";

export default function LabChart({
  curve,
  names,
  visible,
}: {
  curve: LabResult["curve"];
  names: Record<StrategyKey, string>;
  visible: StrategyKey[];
}) {
  return (
    <div className="h-72 sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={curve} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...chartGridProps} vertical={false} />
          <XAxis
            dataKey="date"
            {...chartAxisProps}
            minTickGap={40}
            tickFormatter={(d: string) => d.slice(0, 4)}
          />
          <YAxis
            {...chartAxisProps}
            width={52}
            scale="log"
            domain={["auto", "auto"]}
            allowDataOverflow
            tickFormatter={(v) => formatCurrencyCompact(v)}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={chartTooltipStyle}
            labelFormatter={(d) =>
              new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            }
            formatter={(value, key) => [formatCurrency(Number(value)), names[key as StrategyKey] ?? key]}
          />
          {visible.map((key) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={SERIES[key].color}
              strokeWidth={SERIES[key].dashed ? 1.5 : 2}
              strokeDasharray={SERIES[key].dashed ? "4 3" : undefined}
              dot={false}
              activeDot={{ r: 4, fill: SERIES[key].color, stroke: "var(--panel)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
