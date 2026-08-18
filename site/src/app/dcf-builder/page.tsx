"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { runDcf, sensitivityGrid, stepsAround, type DcfInputs } from "@/lib/dcf";

// Every percent-style field is stored as a whole number ("8" means 8%) since
// that's what people actually type into a form; convert to a decimal only
// when it's fed into the model.
type FormState = {
  revenue: string;
  growthRate: string;
  ebitMargin: string;
  taxRate: string;
  daPct: string;
  capexPct: string;
  nwcPct: string;
  wacc: string;
  terminalGrowth: string;
  sharesOutstanding: string;
  netDebt: string;
  currentPrice: string;
};

// A generic mid-cap example so the page has a live valuation on first load
// instead of a blank form — edit any field to model a real company.
const DEFAULTS: FormState = {
  revenue: "1000",
  growthRate: "8",
  ebitMargin: "20",
  taxRate: "21",
  daPct: "4",
  capexPct: "5",
  nwcPct: "10",
  wacc: "9",
  terminalGrowth: "2.5",
  sharesOutstanding: "100",
  netDebt: "200",
  currentPrice: "22",
};

const money = (value: number | null) =>
  value == null || Number.isNaN(value)
    ? "N/A"
    : `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}M`;

const perShare = (value: number | null) =>
  value == null || Number.isNaN(value)
    ? "N/A"
    : value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

type Rating = "good" | "average" | "bad";

// Same good/average/bad vs. current-price thresholds used for the base-case
// upside callout and every sensitivity-grid cell, so the whole page reads
// consistently: >10% upside to the DCF value is "good", >10% downside is "bad".
function rateVsPrice(value: number | null, price: number | null): Rating | null {
  if (value == null || price == null || Number.isNaN(price) || price <= 0) return null;
  const diff = (value - price) / price;
  if (diff > 0.1) return "good";
  if (diff < -0.1) return "bad";
  return "average";
}

// Color lives only on the dot, never on the text — matches the 10-K
// analyzer's ratio dots (readable at small sizes, works for colorblind users).
function RatingDot({ rating }: { rating: Rating | null }) {
  if (!rating) return null;
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: `var(--status-${rating})` }}
    />
  );
}

function NumberField({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-500">
        {label}
        {suffix ? ` (${suffix})` : ""}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        step="any"
        className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
      />
    </label>
  );
}

export default function DcfBuilder() {
  const [form, setForm] = useState<FormState>(DEFAULTS);

  function set<K extends keyof FormState>(key: K) {
    return (value: string) => setForm((f) => ({ ...f, [key]: value }));
  }

  const inputs: DcfInputs = useMemo(
    () => ({
      revenue: Number(form.revenue) || 0,
      growthRate: (Number(form.growthRate) || 0) / 100,
      ebitMargin: (Number(form.ebitMargin) || 0) / 100,
      taxRate: (Number(form.taxRate) || 0) / 100,
      daPct: (Number(form.daPct) || 0) / 100,
      capexPct: (Number(form.capexPct) || 0) / 100,
      nwcPct: (Number(form.nwcPct) || 0) / 100,
      wacc: (Number(form.wacc) || 0) / 100,
      terminalGrowth: (Number(form.terminalGrowth) || 0) / 100,
      sharesOutstanding: Number(form.sharesOutstanding) || 0,
      netDebt: Number(form.netDebt) || 0,
    }),
    [form],
  );

  const currentPrice = form.currentPrice.trim() === "" ? null : Number(form.currentPrice);
  const result = useMemo(() => runDcf(inputs), [inputs]);

  const waccSteps = useMemo(() => stepsAround(inputs.wacc, 0.005, 5), [inputs.wacc]);
  const terminalSteps = useMemo(
    () => stepsAround(inputs.terminalGrowth, 0.005, 5),
    [inputs.terminalGrowth],
  );
  const grid = useMemo(
    () => sensitivityGrid(inputs, waccSteps, terminalSteps),
    [inputs, waccSteps, terminalSteps],
  );

  const baseRating = rateVsPrice(result.valuePerShare, currentPrice);

  // Undiscounted FCF next to its present value shows discounting's effect
  // directly: later years' FCF may be larger, but the bars shrink as PV
  // pulls them back to today's dollars.
  const fcfChartData = result.years.map((y) => ({
    year: `Y${y.year}`,
    fcf: y.fcf,
    pvFcf: y.pvFcf,
  }));

  const valueComparisonData =
    currentPrice != null && !Number.isNaN(currentPrice) && result.valuePerShare != null
      ? [
          { name: "Intrinsic Value", value: result.valuePerShare, rating: baseRating },
          { name: "Current Price", value: currentPrice, rating: null as Rating | null },
        ]
      : null;

  // Terminal value is usually most of EV in a Gordon growth model — worth
  // making that split visible rather than leaving it buried in two line items.
  const evCompositionData =
    result.enterpriseValue != null
      ? [
          {
            name: "Enterprise Value",
            "PV of Y1-Y5 FCF": result.years.reduce((sum, y) => sum + y.pvFcf, 0),
            "PV of Terminal Value": result.pvTerminalValue ?? 0,
          },
        ]
      : null;

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-20 sm:py-28">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          DCF Builder
        </h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
          A 5-year unlevered discounted cash flow model. Edit any assumption below — everything
          recalculates live, including the WACC x terminal growth sensitivity table.
        </p>

        <section className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">Assumptions</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumberField label="Revenue" suffix="$M" value={form.revenue} onChange={set("revenue")} />
            <NumberField
              label="Revenue growth"
              suffix="%/yr"
              value={form.growthRate}
              onChange={set("growthRate")}
            />
            <NumberField
              label="EBIT margin"
              suffix="%"
              value={form.ebitMargin}
              onChange={set("ebitMargin")}
            />
            <NumberField label="Tax rate" suffix="%" value={form.taxRate} onChange={set("taxRate")} />
            <NumberField
              label="D&A"
              suffix="% of rev"
              value={form.daPct}
              onChange={set("daPct")}
            />
            <NumberField
              label="Capex"
              suffix="% of rev"
              value={form.capexPct}
              onChange={set("capexPct")}
            />
            <NumberField
              label="Net working capital"
              suffix="% of rev"
              value={form.nwcPct}
              onChange={set("nwcPct")}
            />
            <NumberField label="WACC" suffix="%" value={form.wacc} onChange={set("wacc")} />
            <NumberField
              label="Terminal growth"
              suffix="%"
              value={form.terminalGrowth}
              onChange={set("terminalGrowth")}
            />
            <NumberField
              label="Shares outstanding"
              suffix="M"
              value={form.sharesOutstanding}
              onChange={set("sharesOutstanding")}
            />
            <NumberField
              label="Net debt"
              suffix="$M, neg = net cash"
              value={form.netDebt}
              onChange={set("netDebt")}
            />
            <NumberField
              label="Current share price"
              suffix="$, optional"
              value={form.currentPrice}
              onChange={set("currentPrice")}
            />
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">Valuation</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-zinc-500">Enterprise Value</p>
              <p className="mt-1 font-medium text-black dark:text-zinc-50">
                {money(result.enterpriseValue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Equity Value</p>
              <p className="mt-1 font-medium text-black dark:text-zinc-50">
                {money(result.equityValue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Value per Share</p>
              <p className="mt-1 inline-flex items-center gap-1.5 font-medium text-black dark:text-zinc-50">
                {perShare(result.valuePerShare)}
                {baseRating && (
                  <span className="inline-flex items-center gap-1 text-xs font-normal text-zinc-500">
                    <RatingDot rating={baseRating} />
                    {currentPrice != null &&
                      result.valuePerShare != null &&
                      `${(((result.valuePerShare - currentPrice) / currentPrice) * 100).toFixed(0)}% vs price`}
                  </span>
                )}
              </p>
            </div>
          </div>

          {result.terminalValue == null && (
            <p className="mt-4 text-sm text-red-500">
              WACC must be greater than terminal growth for the terminal value to be defined.
            </p>
          )}

          <table className="mt-5 w-full text-left text-sm">
            <thead>
              <tr className="text-zinc-500">
                <th className="py-2 font-medium">Year</th>
                <th className="py-2 font-medium">Revenue</th>
                <th className="py-2 font-medium">EBIT</th>
                <th className="py-2 font-medium">NOPAT</th>
                <th className="py-2 font-medium">FCF</th>
                <th className="py-2 font-medium">PV of FCF</th>
              </tr>
            </thead>
            <tbody>
              {result.years.map((y) => (
                <tr key={y.year} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-2 text-black dark:text-zinc-50">Y{y.year}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{money(y.revenue)}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{money(y.ebit)}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{money(y.nopat)}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{money(y.fcf)}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{money(y.pvFcf)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fcfChartData}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="year"
                  stroke="var(--chart-muted)"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--chart-muted)"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(value) => money(Number(value))}
                />
                <Tooltip
                  formatter={(value) => money(Number(value))}
                  contentStyle={{
                    background: "var(--chart-tooltip-bg)",
                    border: "1px solid var(--chart-grid)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="fcf" name="FCF" fill="var(--chart-line)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="pvFcf" name="PV of FCF" fill="var(--chart-line-2)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {valueComparisonData && (
          <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-medium text-black dark:text-zinc-50">
              Intrinsic Value vs. Current Price
            </h2>
            <div className="mt-4 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={valueComparisonData} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="var(--chart-muted)"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => perShare(Number(value))}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="var(--chart-muted)"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <Tooltip
                    formatter={(value) => perShare(Number(value))}
                    contentStyle={{
                      background: "var(--chart-tooltip-bg)",
                      border: "1px solid var(--chart-grid)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={28}>
                    {valueComparisonData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={
                          entry.rating
                            ? `var(--status-${entry.rating})`
                            : "var(--chart-muted)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {evCompositionData && (
          <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-medium text-black dark:text-zinc-50">
              Enterprise Value Composition
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              How much of EV comes from the 5-year explicit FCF forecast vs. the terminal value
              (everything after year 5, capitalized with Gordon growth).
            </p>
            <div className="mt-4 h-24">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evCompositionData} layout="vertical" margin={{ left: 8 }}>
                  <XAxis
                    type="number"
                    stroke="var(--chart-muted)"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => money(Number(value))}
                  />
                  <YAxis type="category" dataKey="name" hide />
                  <Tooltip
                    formatter={(value) => money(Number(value))}
                    contentStyle={{
                      background: "var(--chart-tooltip-bg)",
                      border: "1px solid var(--chart-grid)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="PV of Y1-Y5 FCF"
                    stackId="ev"
                    fill="var(--chart-line)"
                    radius={[3, 0, 0, 3]}
                    barSize={28}
                  />
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
          </section>
        )}

        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            Sensitivity: value per share
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Rows are WACC, columns are terminal growth, each in 0.5pt steps around your
            assumptions. The boxed cell is your base case.
            {currentPrice != null && " Dots compare each cell to your current share price."}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="text-zinc-500">
                  <th className="py-2 pr-3 font-medium">WACC \ g</th>
                  {terminalSteps.map((g, i) => (
                    <th key={i} className="py-2 px-3 font-medium">
                      {pct(g)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {waccSteps.map((wacc, rowIndex) => (
                  <tr key={rowIndex} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="py-2 pr-3 font-medium text-black dark:text-zinc-50">
                      {pct(wacc)}
                    </td>
                    {grid[rowIndex].map((value, colIndex) => {
                      const isBase = rowIndex === 2 && colIndex === 2;
                      const rating = currentPrice != null ? rateVsPrice(value, currentPrice) : null;
                      return (
                        <td
                          key={colIndex}
                          className={`py-2 px-3 text-zinc-600 dark:text-zinc-400 ${
                            isBase ? "rounded-md ring-1 ring-inset ring-black dark:ring-zinc-50" : ""
                          }`}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {perShare(value)}
                            <RatingDot rating={rating} />
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
