"use client";

// Lazy-loaded from Industries.tsx so recharts stays out of the first load.
//
// Every line is a % return from the period's first day, so all of them
// start at 0% and "who's ahead" reads straight off the chart. Up to a dozen
// stocks share one chart, so only a few get colour: the ones picked in the
// cards below (and the one under the mouse). The rest stay thin and grey,
// with the sector average drawn bold and SPY dashed, as everywhere on the site.
//
// 5Y uses a log scale: one stock up 700% would squash the rest flat on a
// normal axis. On a log scale doubling is the same height wherever it
// happens, so a +100% and a -50% move look equally big, as they should.
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartAxisProps, chartGridProps, chartTooltipStyle, percentAxis } from "@/components/ui";
import { formatPercent } from "@/lib/format";

export type ChartLine = {
  key: string;
  name: string;
  values: (number | null)[];
  kind: "stock" | "average" | "spy";
  color?: string; // set for picked / hovered stocks
};

const signedPct = (v: number, decimals = 1) => `${v > 0 ? "+" : ""}${formatPercent(v, { decimals })}`;

// Log-axis ticks, as growth multiples (1 = 0%, 2 = +100%, 0.5 = -50%).
const LOG_TICKS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 10, 15, 20, 30];

export default function IndustryChart({
  dates,
  lines,
  log,
}: {
  dates: string[];
  lines: ChartLine[];
  log: boolean;
}) {
  // On the log axis each value is the growth multiple, 1 + return.
  const toY = (v: number | null) => (v == null ? null : log ? 1 + v : v);
  const rows = dates.map((date, i) => {
    const row: Record<string, string | number | null> = { date };
    for (const l of lines) row[l.key] = toY(l.values[i]);
    return row;
  });
  const all = lines.flatMap((l) => l.values.filter((v): v is number => v != null));

  let yProps;
  if (log) {
    const lo = Math.min(1, ...all.map((v) => 1 + v));
    const hi = Math.max(1, ...all.map((v) => 1 + v));
    const ticks = LOG_TICKS.filter((t) => t >= lo * 0.9 && t <= hi * 1.1);
    yProps = {
      scale: "log" as const,
      domain: [lo * 0.95, hi * 1.05] as [number, number],
      ticks,
      tickFormatter: (g: number) => (g === 1 ? "0%" : signedPct(g - 1, 0)),
    };
  } else {
    const axis = percentAxis(all);
    yProps = {
      domain: axis.domain,
      ticks: axis.ticks,
      tickFormatter: (v: number) => (v === 0 ? "0%" : signedPct(v, axis.decimals)),
    };
  }

  // Grey lines first, so coloured ones draw on top.
  const order = { stock: 0, spy: 1, average: 2 };
  const drawn = [...lines].sort((a, b) => order[a.kind] - order[b.kind] + (a.color ? 3 : 0) - (b.color ? 3 : 0));
  const short = dates.length > 0 && dates[dates.length - 1].slice(0, 4) === dates[0].slice(0, 4);

  return (
    <div className="h-72 sm:h-96">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...chartGridProps} vertical={false} />
          <XAxis
            dataKey="date"
            {...chartAxisProps}
            minTickGap={40}
            tickFormatter={(d: string) =>
              new Date(`${d}T12:00:00`).toLocaleDateString("en-US", short ? { month: "short", day: "numeric" } : { month: "short", year: "2-digit" })
            }
          />
          <YAxis {...chartAxisProps} width={52} allowDataOverflow {...yProps} />
          <ReferenceLine y={log ? 1 : 0} stroke="var(--chart-muted)" strokeOpacity={0.6} />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={chartTooltipStyle}
            labelFormatter={(d) =>
              new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            }
            itemSorter={(item) => -Number(item.value)}
            formatter={(value) => signedPct(log ? Number(value) - 1 : Number(value), 1)}
          />
          {drawn.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={l.name}
              stroke={l.color ?? (l.kind === "average" ? "var(--chart-line)" : "var(--chart-muted)")}
              strokeOpacity={l.kind === "stock" && !l.color ? 0.35 : 1}
              strokeWidth={l.color ? 2 : l.kind === "average" ? 2.25 : 1}
              strokeDasharray={l.kind === "spy" ? "4 4" : undefined}
              dot={false}
              activeDot={l.kind === "stock" && !l.color ? false : { r: 3.5, stroke: "var(--panel)", strokeWidth: 2 }}
              // The tooltip lists only the lines that stand out; a dozen
              // grey ones would bury them.
              tooltipType={l.kind === "stock" && !l.color ? "none" : undefined}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
