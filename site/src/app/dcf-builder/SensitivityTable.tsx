"use client";

import { formatCurrency, formatPercent } from "@/lib/format";

// WACC x terminal-growth sensitivity table, laid out the way it appears in a
// banker's valuation model: growth across the top, WACC down the side, the
// base case highlighted at the center.
//
// Shading is diverging around a reference: the current share price when one
// is entered (green = the model says it's worth more, red = less), otherwise
// the base case. Intensity is scaled to the largest gap in this grid, so the
// gradient stays readable even when every cell is far from the price (a
// fixed ±30% cap turned a whole grid one flat red). The numbers carry the
// meaning; color only helps the eye.

const BASE = 2; // stepsAround(..., 5) puts the entered assumption in the middle
const MIN_SCALE = 0.1; // don't let a tight grid's tiny gaps look dramatic

function shade(value: number | null, reference: number, scale: number) {
  if (value == null) return undefined;
  const diff = (value - reference) / reference;
  const intensity = Math.min(Math.abs(diff) / scale, 1);
  if (intensity < 0.03) return undefined;
  const color = diff > 0 ? "var(--status-good)" : "var(--status-bad)";
  return { backgroundColor: `color-mix(in srgb, ${color} ${Math.round(6 + intensity * 34)}%, transparent)` };
}

export function SensitivityTable({
  waccSteps,
  growthSteps,
  grid,
  currentPrice,
}: {
  waccSteps: number[];
  growthSteps: number[];
  grid: (number | null)[][];
  currentPrice: number | null;
}) {
  const base = grid[BASE]?.[BASE] ?? null;
  const price = currentPrice != null && !Number.isNaN(currentPrice) && currentPrice > 0 ? currentPrice : null;
  const reference = price ?? base;
  const values = grid.flat().filter((v): v is number => v != null);
  const scale = reference
    ? Math.max(MIN_SCALE, ...values.map((v) => Math.abs((v - reference) / reference)))
    : MIN_SCALE;
  const above = price != null ? values.filter((v) => v > price).length : 0;

  const headCell = "px-1 py-1 text-[11px] font-normal tabular-nums sm:px-2 sm:text-xs";
  const baseHead = "font-semibold text-accent";

  return (
    <div className="mt-3">
      <div className="overflow-x-auto">
        <table className="mx-auto w-full max-w-3xl border-separate border-spacing-[3px] text-center">
          <thead>
            <tr>
              <th rowSpan={2} className="pr-1 text-left align-bottom text-[10px] font-normal caps text-zinc-500 sm:pr-3">
                WACC ↓
              </th>
              <th colSpan={growthSteps.length} className="pb-0.5 text-[10px] font-normal caps text-zinc-500">
                Terminal growth rate →
              </th>
            </tr>
            <tr>
              {growthSteps.map((g, i) => (
                <th key={i} scope="col" className={`${headCell} ${i === BASE ? baseHead : "text-zinc-500"}`}>
                  {formatPercent(g)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {waccSteps.map((wacc, r) => (
              <tr key={r}>
                <th scope="row" className={`${headCell} pr-1 text-left sm:pr-3 ${r === BASE ? baseHead : "text-zinc-500"}`}>
                  {formatPercent(wacc)}
                </th>
                {grid[r].map((value, c) => {
                  const isBase = r === BASE && c === BASE;
                  return (
                    <td
                      key={c}
                      style={reference ? shade(value, reference, scale) : undefined}
                      title={
                        value == null
                          ? "Not defined: WACC must be greater than terminal growth"
                          : `WACC ${formatPercent(wacc)}, terminal growth ${formatPercent(growthSteps[c])}: ${formatCurrency(value)} per share`
                      }
                      className={`rounded-[var(--radius-sm)] px-1 py-2 text-[11px] tabular-nums text-foreground sm:px-2 sm:text-xs ${
                        isBase ? "font-semibold ring-2 ring-inset ring-accent" : ""
                      }`}
                    >
                      {value == null ? "n/a" : formatCurrency(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mx-auto mt-3 flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-zinc-500">
        {price != null ? (
          <>
            <span>
              Current price <span className="tabular-nums text-foreground">{formatCurrency(price)}</span>:{" "}
              <span className="text-foreground">{above}</span> of {values.length} scenarios value the stock above it
            </span>
            <Swatch color="var(--status-good)" label="Above price" />
            <Swatch color="var(--status-bad)" label="Below price" />
          </>
        ) : (
          <span>Enter a current share price to shade each scenario as upside or downside. For now, shading shows distance from the base case.</span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] ring-2 ring-inset ring-accent" />
          Base case
        </span>
      </div>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: `color-mix(in srgb, ${color} 40%, transparent)` }} />
      {label}
    </span>
  );
}
