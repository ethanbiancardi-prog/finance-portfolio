"use client";

// Lazy-loaded from StockChart.tsx so recharts only downloads once a ticker
// has been searched.
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartAxisProps, chartTooltipStyle } from "@/components/ui";

export type PricePoint = { t: string; c: number };

const INTRADAY = new Set(["1D", "5D"]);

function label(t: string, range: string, forAxis: boolean) {
  const d = new Date(t);
  const tz = "America/New_York";
  if (range === "1D") return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  if (range === "5D") {
    return forAxis
      ? d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz })
      : d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: tz });
  }
  if (range === "5Y") return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: tz });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(forAxis ? {} : { year: "numeric" }), timeZone: tz });
}

export default function PriceChart({
  points,
  range,
  baseline,
  up,
}: {
  points: PricePoint[];
  range: string;
  baseline: number;
  up: boolean;
}) {
  const color = up ? "var(--status-good)" : "var(--status-bad)";
  const gradient = `price-fill-${up ? "up" : "down"}`;
  // Plot by index, not time: intraday data has overnight and weekend gaps
  // that would otherwise stretch into flat lines.
  const data = points.map((p, i) => ({ i, c: p.c, t: p.t }));

  return (
    <div className="h-48 sm:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 4, top: 6, bottom: 0 }}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="i"
            type="number"
            domain={[0, Math.max(1, data.length - 1)]}
            {...chartAxisProps}
            tickFormatter={(i) => (data[i] ? label(data[i].t, range, true) : "")}
            minTickGap={40}
          />
          <YAxis
            dataKey="c"
            {...chartAxisProps}
            width={52}
            domain={["auto", "auto"]}
            tickFormatter={(v) => `$${Number(v).toFixed(v >= 1000 ? 0 : 2)}`}
          />
          {INTRADAY.has(range) && (
            // Where "today" or "this week" started, so up vs down is visible at a glance.
            <ReferenceLine y={baseline} stroke="var(--border)" strokeDasharray="3 3" />
          )}
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={chartTooltipStyle}
            labelFormatter={(i) => (data[Number(i)] ? label(data[Number(i)].t, range, false) : "")}
            formatter={(v) => [`$${Number(v).toFixed(2)}`, "Price"]}
          />
          <Area
            type="linear"
            dataKey="c"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradient})`}
            dot={false}
            activeDot={{ r: 3, fill: color, stroke: "none" }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
