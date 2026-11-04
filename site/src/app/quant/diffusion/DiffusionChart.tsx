"use client";

// Lazy-loaded from Diffusion.tsx so recharts stays out of the first load.
// The x-axis is evenly spaced checkpoints, not real time: minutes after the
// news sit as far apart as months, because the interesting part (how fast)
// would otherwise be squashed into a sliver at the left edge.
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartAxisProps, chartGridProps, chartTooltipStyle, percentAxis } from "@/components/ui";
import type { DiffusionCheckpoint } from "@/lib/diffusion";

export type DiffusionLine = { key: string; name: string; color: string; dashed?: boolean; values: (number | null)[] };

const pct = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;

export default function DiffusionChart({ checkpoints, lines }: { checkpoints: DiffusionCheckpoint[]; lines: DiffusionLine[] }) {
  const rows = checkpoints.map((c, i) => {
    const row: Record<string, string | number | null> = { label: c.label };
    for (const l of lines) row[l.key] = l.values[i];
    return row;
  });
  const axis = percentAxis(lines.flatMap((l) => l.values.filter((v): v is number => v != null)));
  return (
    <div className="h-72 sm:h-96">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...chartGridProps} vertical={false} />
          <XAxis dataKey="label" {...chartAxisProps} interval={0} angle={-45} textAnchor="end" height={44} />
          <YAxis {...chartAxisProps} width={56} domain={axis.domain} ticks={axis.ticks} tickFormatter={(v: number) => (v === 0 ? "0%" : pct(v))} />
          <ReferenceLine y={0} stroke="var(--chart-muted)" strokeOpacity={0.6} />
          {/* The moment the filing went public. */}
          <ReferenceLine x="News" stroke="var(--accent)" strokeDasharray="3 3" label={{ value: "news", position: "top", fontSize: 10, fill: "var(--accent)" }} />
          <ReferenceLine x="Day 1" stroke="var(--chart-muted)" strokeDasharray="2 4" />
          <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => pct(Number(v))} />
          {lines.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={l.name}
              stroke={l.color}
              strokeWidth={2}
              strokeDasharray={l.dashed ? "4 4" : undefined}
              dot={{ r: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
