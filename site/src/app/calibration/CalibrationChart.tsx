"use client";

// Lazy-loaded from Calibration.tsx so recharts stays out of the first load.
//
// A calibration (reliability) chart. Each dot is a group of predictions that
// were given roughly the same probability: across is the average probability
// given, up is how often those things actually happened. On the dashed
// diagonal, the probabilities were exactly right. Below it, things happened
// less often than predicted (too confident about YES); above it, more often.
// Bigger dots are groups with more predictions in them.
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { chartAxisProps, chartGridProps, chartTooltipStyle } from "@/components/ui";
import type { CalibrationBin } from "@/lib/calibration";

export type CalibrationSeries = { name: string; color: string; bins: CalibrationBin[] };

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function CalibrationChart({ series }: { series: CalibrationSeries[] }) {
  return (
    <div className="h-72 sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
          <CartesianGrid {...chartGridProps} />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, 1]}
            ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
            tickFormatter={pct}
            {...chartAxisProps}
            label={{ value: "probability given", position: "insideBottom", offset: -10, fontSize: 10, fill: "var(--chart-muted)" }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[0, 1]}
            ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
            tickFormatter={pct}
            width={44}
            {...chartAxisProps}
            label={{ value: "actually happened", angle: -90, position: "insideLeft", offset: 14, fontSize: 10, fill: "var(--chart-muted)" }}
          />
          <ZAxis type="number" dataKey="n" range={[40, 400]} />
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="var(--chart-muted)" strokeDasharray="4 4" />
          <Tooltip
            cursor={false}
            contentStyle={chartTooltipStyle}
            formatter={(value, key, item) => {
              const d = item.payload as { x: number; y: number; n: number };
              if (key === "x") return [pct(d.x), "average probability given"];
              if (key === "y") return [`${pct(d.y)} (${d.n} prediction${d.n === 1 ? "" : "s"})`, "actually happened"];
              return [null, null];
            }}
          />
          {series.map((s) => (
            <Scatter
              key={s.name}
              name={s.name}
              data={s.bins.map((b) => ({ x: b.avgProbability, y: b.hitRate, n: b.count }))}
              fill={s.color}
              fillOpacity={0.75}
              isAnimationActive={false}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
