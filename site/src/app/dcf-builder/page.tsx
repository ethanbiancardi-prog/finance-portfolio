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
import { formatCurrency, formatMoneyMillions, formatPercent } from "@/lib/format";
import {
  Card,
  Field,
  PageShell,
  SectionHeader,
  StatusBadge,
  StatusDot,
  StatCard,
  chartAxisProps,
  chartGridProps,
  chartTooltipStyle,
  tableCellClass,
  tableCellStrongClass,
  tableHeadCellClass,
  tableHeadRowClass,
  tableRowClass,
  type Rating,
} from "@/components/ui";

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
  const baseRatingLabel =
    currentPrice != null && result.valuePerShare != null
      ? `${(((result.valuePerShare - currentPrice) / currentPrice) * 100).toFixed(0)}% vs price`
      : undefined;

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
    <PageShell
      eyebrow="dcf builder"
      title="DCF Builder"
      description="A 5-year unlevered discounted cash flow model. Edit any assumption below — everything recalculates live, including the WACC x terminal growth sensitivity table."
    >
      <Card as="section" className="mt-8">
        <SectionHeader label="assumptions" />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Revenue" suffix="$M" type="number" step="any" value={form.revenue} onChange={(e) => set("revenue")(e.target.value)} />
          <Field
            label="Revenue growth"
            suffix="%/yr"
            type="number"
            step="any"
            value={form.growthRate}
            onChange={(e) => set("growthRate")(e.target.value)}
          />
          <Field
            label="EBIT margin"
            suffix="%"
            type="number"
            step="any"
            value={form.ebitMargin}
            onChange={(e) => set("ebitMargin")(e.target.value)}
          />
          <Field label="Tax rate" suffix="%" type="number" step="any" value={form.taxRate} onChange={(e) => set("taxRate")(e.target.value)} />
          <Field
            label="D&A"
            suffix="% of rev"
            type="number"
            step="any"
            value={form.daPct}
            onChange={(e) => set("daPct")(e.target.value)}
          />
          <Field
            label="Capex"
            suffix="% of rev"
            type="number"
            step="any"
            value={form.capexPct}
            onChange={(e) => set("capexPct")(e.target.value)}
          />
          <Field
            label="Net working capital"
            suffix="% of rev"
            type="number"
            step="any"
            value={form.nwcPct}
            onChange={(e) => set("nwcPct")(e.target.value)}
          />
          <Field label="WACC" suffix="%" type="number" step="any" value={form.wacc} onChange={(e) => set("wacc")(e.target.value)} />
          <Field
            label="Terminal growth"
            suffix="%"
            type="number"
            step="any"
            value={form.terminalGrowth}
            onChange={(e) => set("terminalGrowth")(e.target.value)}
          />
          <Field
            label="Shares outstanding"
            suffix="M"
            type="number"
            step="any"
            value={form.sharesOutstanding}
            onChange={(e) => set("sharesOutstanding")(e.target.value)}
          />
          <Field
            label="Net debt"
            suffix="$M, neg = net cash"
            type="number"
            step="any"
            value={form.netDebt}
            onChange={(e) => set("netDebt")(e.target.value)}
          />
          <Field
            label="Current share price"
            suffix="$, optional"
            type="number"
            step="any"
            value={form.currentPrice}
            onChange={(e) => set("currentPrice")(e.target.value)}
          />
        </div>
      </Card>

      <Card as="section" className="mt-8">
        <SectionHeader label="valuation" />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="Enterprise Value" value={formatMoneyMillions(result.enterpriseValue)} />
          <StatCard label="Equity Value" value={formatMoneyMillions(result.equityValue)} />
          <StatCard
            label="Value per Share"
            value={formatCurrency(result.valuePerShare)}
            hint={
              baseRating && (
                <StatusBadge rating={baseRating} label={baseRatingLabel} fallback={null} />
              )
            }
          />
        </div>

        {result.terminalValue == null && (
          <p className="mt-4 text-sm text-red-500">
            WACC must be greater than terminal growth for the terminal value to be defined.
          </p>
        )}

        <table className="mt-5 w-full text-left text-sm">
          <thead>
            <tr className={tableHeadRowClass}>
              <th className={tableHeadCellClass}>Year</th>
              <th className={tableHeadCellClass}>Revenue</th>
              <th className={tableHeadCellClass}>EBIT</th>
              <th className={tableHeadCellClass}>NOPAT</th>
              <th className={tableHeadCellClass}>FCF</th>
              <th className={tableHeadCellClass}>PV of FCF</th>
            </tr>
          </thead>
          <tbody>
            {result.years.map((y) => (
              <tr key={y.year} className={tableRowClass}>
                <td className={tableCellStrongClass}>Y{y.year}</td>
                <td className={tableCellClass}>{formatMoneyMillions(y.revenue)}</td>
                <td className={tableCellClass}>{formatMoneyMillions(y.ebit)}</td>
                <td className={tableCellClass}>{formatMoneyMillions(y.nopat)}</td>
                <td className={tableCellClass}>{formatMoneyMillions(y.fcf)}</td>
                <td className={tableCellClass}>{formatMoneyMillions(y.pvFcf)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={fcfChartData}>
              <CartesianGrid {...chartGridProps} vertical={false} />
              <XAxis dataKey="year" {...chartAxisProps} />
              <YAxis
                {...chartAxisProps}
                width={56}
                tickFormatter={(value) => formatMoneyMillions(Number(value))}
              />
              <Tooltip
                formatter={(value) => formatMoneyMillions(Number(value))}
                contentStyle={chartTooltipStyle}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="fcf" name="FCF" fill="var(--chart-line)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="pvFcf" name="PV of FCF" fill="var(--chart-line-2)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {valueComparisonData && (
        <Card as="section" className="mt-8">
          <SectionHeader label="intrinsic value vs. current price" />
          <div className="mt-4 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={valueComparisonData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid {...chartGridProps} horizontal={false} />
                <XAxis
                  type="number"
                  {...chartAxisProps}
                  tickFormatter={(value) => formatCurrency(Number(value))}
                />
                <YAxis type="category" dataKey="name" {...chartAxisProps} width={100} />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  contentStyle={chartTooltipStyle}
                />
                <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={28}>
                  {valueComparisonData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.rating ? `var(--status-${entry.rating})` : "var(--chart-muted)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {evCompositionData && (
        <Card as="section" className="mt-8">
          <SectionHeader
            label="enterprise value composition"
            description="How much of EV comes from the 5-year explicit FCF forecast vs. the terminal value (everything after year 5, capitalized with Gordon growth)."
          />
          <div className="mt-4 h-24">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evCompositionData} layout="vertical" margin={{ left: 8 }}>
                <XAxis
                  type="number"
                  {...chartAxisProps}
                  tickFormatter={(value) => formatMoneyMillions(Number(value))}
                />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip
                  formatter={(value) => formatMoneyMillions(Number(value))}
                  contentStyle={chartTooltipStyle}
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
        </Card>
      )}

      <Card as="section" className="mt-8">
        <SectionHeader
          label="sensitivity: value per share"
          description={`Rows are WACC, columns are terminal growth, each in 0.5pt steps around your assumptions. The boxed cell is your base case.${
            currentPrice != null ? " Dots compare each cell to your current share price." : ""
          }`}
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className="py-2 pr-3 font-medium">WACC \ g</th>
                {terminalSteps.map((g, i) => (
                  <th key={i} className="px-3 py-2 font-medium tabular-nums">
                    {formatPercent(g)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {waccSteps.map((wacc, rowIndex) => (
                <tr key={rowIndex} className={tableRowClass}>
                  <td className="py-2 pr-3 font-medium tabular-nums text-black dark:text-zinc-50">
                    {formatPercent(wacc)}
                  </td>
                  {grid[rowIndex].map((value, colIndex) => {
                    const isBase = rowIndex === 2 && colIndex === 2;
                    const rating = currentPrice != null ? rateVsPrice(value, currentPrice) : null;
                    return (
                      <td
                        key={colIndex}
                        className={`px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400 ${
                          isBase ? "rounded-md ring-1 ring-inset ring-accent" : ""
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {formatCurrency(value)}
                          <StatusDot rating={rating} />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PageShell>
  );
}
