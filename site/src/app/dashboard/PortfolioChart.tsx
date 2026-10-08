"use client";

// Lazy-loaded from Portfolio.tsx so recharts stays out of the dashboard's
// first load, same as the paper-trading chart.
//
// Two scales. With `percent` (used by both the dashboard and
// /paper-trading) the axis is the % gained or lost since the start, on round
// steps with a line at 0%, so "am I ahead of SPY, and by how much" reads
// straight off the chart; the tooltip keeps the dollars. Without it, the
// axis is plain account value in dollars.
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatCurrencyCompact, formatPercent } from "@/lib/format";
import { Card, chartAxisProps, chartGridProps, chartTooltipStyle } from "@/components/ui";
import type { HistoryPoint } from "@/lib/portfolio";

const tick = (p: HistoryPoint) =>
  p.label === "opened"
    ? "Opened"
    : p.label === "now"
      ? "Now"
      : new Date(`${p.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const signedPct = (v: number, decimals = 1) => `${v > 0 ? "+" : ""}${formatPercent(v, { decimals })}`;

// Round % steps (0.5%, 1%, 2%...) giving about four to six gridlines, and
// bounds on those steps that always include 0%.
function percentAxis(values: number[]) {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const steps = [0.0025, 0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5];
  const step = steps.find((s) => (hi - lo) / s <= 5) ?? 1;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step || step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 10_000) / 10_000);
  return { domain: [min, max] as [number, number], ticks, decimals: step < 0.01 ? 1 : 0 };
}

export default function PortfolioChart({ history, percent = false }: { history: HistoryPoint[]; percent?: boolean }) {
  // Both lines start from the same opening cash, so the first point's
  // equity is the base for both percentages.
  const base = history[0]?.equity || 1;
  const data = history.map((p) => ({
    ...p,
    x: tick(p),
    equityPct: p.equity / base - 1,
    spyPct: p.spy / base - 1,
  }));
  const axis = percent ? percentAxis(data.flatMap((d) => [d.equityPct, d.spyPct])) : null;
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
            {axis ? (
              <YAxis
                {...chartAxisProps}
                width={52}
                domain={axis.domain}
                ticks={axis.ticks}
                tickFormatter={(value: number) => (value === 0 ? "0%" : signedPct(value, axis.decimals))}
              />
            ) : (
              <YAxis
                {...chartAxisProps}
                width={52}
                domain={["auto", "auto"]}
                tickFormatter={(value) => formatCurrencyCompact(value)}
              />
            )}
            {axis && <ReferenceLine y={0} stroke="var(--chart-muted)" strokeOpacity={0.6} />}
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              formatter={(value, _name, item) => {
                if (!axis) return formatCurrency(String(value));
                // % on the axis, but the tooltip keeps the dollars too.
                const dollars = item.dataKey === "spyPct" ? item.payload.spy : item.payload.equity;
                return `${signedPct(Number(value), 2)} (${formatCurrency(dollars)})`;
              }}
              contentStyle={chartTooltipStyle}
            />
            <Line
              type="monotone"
              dataKey={axis ? "spyPct" : "spy"}
              name="SPY"
              stroke="var(--chart-muted)"
              strokeDasharray="4 4"
              strokeWidth={1}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey={axis ? "equityPct" : "equity"}
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
