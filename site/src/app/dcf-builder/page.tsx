"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { runDcf, sensitivityGrid, stepsAround, type DcfInputs } from "@/lib/dcf";
import { formatCurrency, formatMoneyMillions, formatPercent } from "@/lib/format";
import {
  Card,
  Field,
  PageShell,
  SectionHeader,
  StatusBadge,
  StatCard,
  tableCellClass,
  tableCellStrongClass,
  tableHeadCellClass,
  tableHeadRowClass,
  tableRowClass,
  type Rating,
} from "@/components/ui";

const chartLoading = (heightClass: string) => (
  <div className={`mt-4 ${heightClass} animate-pulse bg-border`} />
);
const FcfChart = dynamic(() => import("./Charts").then((m) => m.FcfChart), {
  ssr: false,
  loading: () => chartLoading("h-64"),
});
const ValueComparisonChart = dynamic(() => import("./Charts").then((m) => m.ValueComparisonChart), {
  ssr: false,
  loading: () => chartLoading("h-32"),
});
const EvCompositionChart = dynamic(() => import("./Charts").then((m) => m.EvCompositionChart), {
  ssr: false,
  loading: () => chartLoading("h-24"),
});

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

// Presentation only: sensitivity cells are shaded like a heatmap, with color
// intensity proportional to how far the cell sits from the reference value
// (current price when given, otherwise the base case). ±30% saturates.
function heatStyle(value: number | null, reference: number | null) {
  if (value == null || reference == null || Number.isNaN(reference) || reference <= 0) return undefined;
  const diff = (value - reference) / reference;
  const intensity = Math.min(Math.abs(diff) / 0.3, 1);
  if (intensity < 0.02) return undefined;
  const color = diff > 0 ? "var(--status-good)" : "var(--status-bad)";
  return { backgroundColor: `color-mix(in srgb, ${color} ${Math.round(intensity * 38)}%, transparent)` };
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
      <Card as="section" className="mt-4">
        <SectionHeader label="assumptions" />
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
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

      <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard card size="lg" label="Enterprise Value" value={formatMoneyMillions(result.enterpriseValue)} />
        <StatCard card size="lg" label="Equity Value" value={formatMoneyMillions(result.equityValue)} />
        <StatCard
          card
          size="lg"
          label="Value per Share"
          value={formatCurrency(result.valuePerShare)}
          hint={
            baseRating && <StatusBadge rating={baseRating} label={baseRatingLabel} fallback={null} />
          }
        />
      </section>

      {result.terminalValue == null && (
        <p className="mt-3 font-mono text-xs text-bad">
          WACC must be greater than terminal growth for the terminal value to be defined.
        </p>
      )}

      <Card as="section" className="mt-4">
        <SectionHeader label="5-year projection" description="$M. PV of FCF discounts each year back at WACC." />
        <table className="mt-3 w-full text-left">
          <thead>
            <tr className={tableHeadRowClass}>
              <th className={tableHeadCellClass}>Year</th>
              <th className={`${tableHeadCellClass} text-right`}>Revenue</th>
              <th className={`${tableHeadCellClass} text-right`}>EBIT</th>
              <th className={`${tableHeadCellClass} text-right`}>NOPAT</th>
              <th className={`${tableHeadCellClass} text-right`}>FCF</th>
              <th className={`${tableHeadCellClass} text-right`}>PV of FCF</th>
            </tr>
          </thead>
          <tbody>
            {result.years.map((y) => (
              <tr key={y.year} className={tableRowClass}>
                <td className={tableCellStrongClass}>Y{y.year}</td>
                <td className={`${tableCellClass} text-right`}>{formatMoneyMillions(y.revenue)}</td>
                <td className={`${tableCellClass} text-right`}>{formatMoneyMillions(y.ebit)}</td>
                <td className={`${tableCellClass} text-right`}>{formatMoneyMillions(y.nopat)}</td>
                <td className={`${tableCellClass} text-right`}>{formatMoneyMillions(y.fcf)}</td>
                <td className={`${tableCellStrongClass} text-right`}>{formatMoneyMillions(y.pvFcf)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <FcfChart data={fcfChartData} />
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {valueComparisonData && (
          <Card as="section">
            <SectionHeader label="intrinsic value vs. price" />
            <ValueComparisonChart data={valueComparisonData} />
          </Card>
        )}

        {evCompositionData && (
          <Card as="section">
            <SectionHeader
              label="ev composition"
              description="Explicit 5-year FCF vs. terminal value (everything after year 5, capitalized with Gordon growth)."
            />
            <EvCompositionChart data={evCompositionData} />
          </Card>
        )}
      </div>

      <Card as="section" className="mt-4">
        <SectionHeader
          label="sensitivity: value per share"
          description={`Rows are WACC, columns are terminal growth, 0.5pt steps around your assumptions. Outlined cell is the base case; shading scales with ${
            currentPrice != null ? "upside (green) or downside (red) vs. your current share price" : "distance from the base case"
          }.`}
        />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-0 text-left">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className={`${tableHeadCellClass} pr-3`}>WACC \ g</th>
                {terminalSteps.map((g, i) => (
                  <th key={i} className={`${tableHeadCellClass} px-2 text-right tabular-nums`}>
                    {formatPercent(g)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {waccSteps.map((wacc, rowIndex) => (
                <tr key={rowIndex}>
                  <td className={`${tableCellStrongClass} pr-3`}>{formatPercent(wacc)}</td>
                  {grid[rowIndex].map((value, colIndex) => {
                    const isBase = rowIndex === 2 && colIndex === 2;
                    const reference = currentPrice ?? grid[2][2];
                    return (
                      <td
                        key={colIndex}
                        style={heatStyle(value, reference)}
                        className={`border border-background px-2 py-1.5 text-right text-xs tabular-nums text-foreground ${
                          isBase ? "ring-1 ring-inset ring-accent" : ""
                        }`}
                      >
                        {formatCurrency(value)}
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
