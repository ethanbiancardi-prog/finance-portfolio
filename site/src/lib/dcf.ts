export type DcfInputs = {
  revenue: number; // most recent fiscal year revenue, $ millions
  growthRate: number; // annual revenue growth rate, decimal (0.08 = 8%)
  ebitMargin: number; // EBIT / revenue, decimal
  taxRate: number; // decimal
  daPct: number; // D&A as % of revenue, decimal
  capexPct: number; // capex as % of revenue, decimal
  nwcPct: number; // net working capital balance as % of revenue, decimal
  wacc: number; // decimal
  terminalGrowth: number; // decimal
  sharesOutstanding: number; // millions of shares
  netDebt: number; // total debt minus cash, $ millions (negative = net cash)
};

export type ProjectedYear = {
  year: number;
  revenue: number;
  ebit: number;
  nopat: number;
  da: number;
  capex: number;
  deltaNwc: number;
  fcf: number;
  discountFactor: number;
  pvFcf: number;
};

export type DcfResult = {
  years: ProjectedYear[];
  terminalValue: number | null;
  pvTerminalValue: number | null;
  enterpriseValue: number | null;
  equityValue: number | null;
  valuePerShare: number | null;
};

const PROJECTION_YEARS = 5;

export function runDcf(inputs: DcfInputs): DcfResult {
  const years: ProjectedYear[] = [];
  let priorRevenue = inputs.revenue;
  // NWC balance in year 0, so the first projected year has a base to grow from.
  let priorNwc = inputs.revenue * inputs.nwcPct;

  for (let year = 1; year <= PROJECTION_YEARS; year++) {
    const revenue = priorRevenue * (1 + inputs.growthRate);
    const ebit = revenue * inputs.ebitMargin;
    // NOPAT: after-tax operating profit before financing effects — the
    // starting point for unlevered free cash flow (ignores capital structure).
    const nopat = ebit * (1 - inputs.taxRate);
    const da = revenue * inputs.daPct;
    const capex = revenue * inputs.capexPct;
    const nwc = revenue * inputs.nwcPct;
    // Growing revenue ties up more cash in receivables/inventory than it
    // frees up in payables, so the increase in the NWC balance is a cash outflow.
    const deltaNwc = nwc - priorNwc;
    // Unlevered FCF: NOPAT, add back the non-cash D&A charge, subtract the
    // cash actually spent on capex and on funding working-capital growth.
    const fcf = nopat + da - capex - deltaNwc;
    const discountFactor = 1 / Math.pow(1 + inputs.wacc, year);
    const pvFcf = fcf * discountFactor;

    years.push({ year, revenue, ebit, nopat, da, capex, deltaNwc, fcf, discountFactor, pvFcf });
    priorRevenue = revenue;
    priorNwc = nwc;
  }

  const lastYear = years[years.length - 1];
  // Gordon growth model: value, as of the end of the explicit window, of all
  // cash flows thereafter assuming FCF grows at a constant rate forever.
  // Only defined when WACC > terminal growth — otherwise the perpetuity
  // "sum" doesn't converge (or goes negative), so treat it as not computable.
  const validTerminal = inputs.wacc > inputs.terminalGrowth;
  const terminalValue = validTerminal
    ? (lastYear.fcf * (1 + inputs.terminalGrowth)) / (inputs.wacc - inputs.terminalGrowth)
    : null;
  const pvTerminalValue = terminalValue != null ? terminalValue * lastYear.discountFactor : null;

  const pvFcfSum = years.reduce((sum, y) => sum + y.pvFcf, 0);
  const enterpriseValue = pvTerminalValue != null ? pvFcfSum + pvTerminalValue : null;
  const equityValue = enterpriseValue != null ? enterpriseValue - inputs.netDebt : null;
  const valuePerShare =
    equityValue != null && inputs.sharesOutstanding > 0 ? equityValue / inputs.sharesOutstanding : null;

  return { years, terminalValue, pvTerminalValue, enterpriseValue, equityValue, valuePerShare };
}

// For the WACC x terminal-growth sensitivity grid: rerun the full model at
// each combination since changing either assumption changes every discount
// factor and the terminal value, not just one cell's inputs.
export function sensitivityGrid(
  inputs: DcfInputs,
  waccSteps: number[],
  terminalGrowthSteps: number[],
): (number | null)[][] {
  return waccSteps.map((wacc) =>
    terminalGrowthSteps.map((terminalGrowth) => runDcf({ ...inputs, wacc, terminalGrowth }).valuePerShare),
  );
}

// Symmetric steps around a base rate, e.g. base=0.09, step=0.005, count=5
// -> [0.08, 0.085, 0.09, 0.095, 0.10]. The base value always lands dead
// center so the grid shows the entered assumption alongside its neighbors.
export function stepsAround(base: number, step: number, count: number): number[] {
  const half = Math.floor(count / 2);
  return Array.from({ length: count }, (_, i) => base + (i - half) * step);
}
