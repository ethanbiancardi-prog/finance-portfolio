// Pulls the inputs a DCF needs straight out of a company's XBRL facts (the
// same SEC "company facts" feed the ratio dashboard uses) and, just as
// importantly, records *how* each number was derived so the DCF page can
// show the arithmetic next to the field. The point is to learn what each
// assumption means by seeing it computed from a real filing.
import { getCompanyFactSeries, type FactPoint } from "@/lib/edgar";

export type PrefillSource = {
  field: string; // DcfInputs key
  label: string;
  value: string; // formatted, as it lands in the form
  how: string; // the arithmetic in plain words
  note?: string; // caveat, when the number needs judgement
};

export type DcfPrefill = {
  fiscalYearEnd: string;
  /** Last day the income-statement figures run to. Later than fiscalYearEnd
   *  whenever quarterly reports have been filed since the 10-K. */
  incomeAsOf: string;
  /** "ttm" when built from the latest four quarters, "fy" when the annual
   *  report is still the most recent thing on file. */
  incomeBasis: "ttm" | "fy";
  /** Date of the balance sheet the cash and debt figures were read from. */
  balanceSheetAsOf: string;
  // Form values (strings, whole-number percents) ready to drop into the page.
  form: {
    revenue: string;
    growthRate: string;
    ebitMargin: string;
    taxRate: string;
    daPct: string;
    capexPct: string;
    nwcPct: string;
    sharesOutstanding: string;
    netDebt: string;
  };
  sources: PrefillSource[];
  missing: string[]; // fields we couldn't derive (left as they were)
};

const M = 1e6;
const fmtM = (v: number) => `${v < 0 ? "−" : ""}$${Math.round(Math.abs(v) / M).toLocaleString()}M`;
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeDcfPrefill(facts: any): DcfPrefill | null {
  const { seriesAny, series, val, deiSeries, yearEnds, ttmAny, instantAt, latestBalanceSheetEnd } =
    getCompanyFactSeries(facts);

  const REVENUE_TAGS = ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet", "RevenuesNetOfInterestExpense"];
  const revenue = seriesAny(REVENUE_TAGS);
  const fyRev = val(revenue, 0);
  const end = yearEnds[0];
  if (fyRev == null || !end) return null;

  // An annual report can be eleven months old by the time someone values the
  // company, and the quarters filed since are sitting in the same feed. Use
  // trailing twelve months whenever it is meaningfully fresher, and say so.
  const revTtm = ttmAny(REVENUE_TAGS);
  const useTtm = revTtm != null && revTtm.monthsNewer >= 2;
  const rev0 = useTtm ? revTtm!.value : fyRev;
  const incomeAsOf = useTtm ? revTtm!.end : end;
  const periodPhrase = useTtm ? `the twelve months to ${incomeAsOf}` : `the fiscal year ending ${end}`;

  // Every flow figure follows whichever basis revenue used, so a margin is
  // never TTM profit over annual sales. When a line has no quarterly tagging
  // it falls back to the fiscal year, and `ttm` records which happened so the
  // ratio can be divided by the matching revenue.
  type Flow = { value: number; ttm: boolean };
  const flow = (tags: string[]): Flow | null => {
    if (useTtm) {
      const t = ttmAny(tags);
      if (t && t.end === incomeAsOf) return { value: t.value, ttm: true };
    }
    const annual = seriesAny(tags).find((p) => p.end === end)?.val ?? null;
    return annual == null ? null : { value: annual, ttm: false };
  };
  const revenueFor = (f: Flow) => (f.ttm ? rev0 : fyRev);
  const periodFor = (f: Flow) => (f.ttm ? `the twelve months to ${incomeAsOf}` : `FY ending ${end}`);

  // Balance-sheet figures come from the most recent balance sheet filed,
  // quarterly or annual. Every one is read at that same date, which keeps the
  // "all figures from one period" rule — it is just anchored to the latest
  // quarter now rather than to the year end.
  const bsEnd = latestBalanceSheetEnd ?? end;
  const bs = (tags: string[]) => instantAt(tags, bsEnd);
  const bsSum = (...groups: string[][]) => {
    const vals = groups.map((g) => bs(g)).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const atEnd = (points: FactPoint[]) => points.find((p) => p.end === end)?.val ?? null;

  const sources: PrefillSource[] = [];
  const missing: string[] = [];
  const form: Partial<DcfPrefill["form"]> = {};

  // --- Revenue ---
  form.revenue = String(Math.round(rev0 / M));
  sources.push({
    field: "revenue",
    label: "Revenue",
    value: fmtM(rev0),
    how: useTtm
      ? `Trailing twelve months to ${incomeAsOf}, built from the quarterly reports filed since the year ending ${end}. That 10-K reported ${fmtM(revTtm!.fyValue)}, ${revTtm!.monthsNewer} months older than this figure.`
      : `Total revenue for the fiscal year ending ${end}, straight from the income statement.`,
    note: useTtm
      ? "Built from the quarterly reports filed since the last 10-K, so the valuation starts from what the company is earning now rather than from last year."
      : "No quarterly reports have been filed since the last annual report, so this is the most current figure available.",
  });

  // --- Growth: 3-year CAGR when we have it, else last year's growth ---
  // Growth stays annual-to-annual on purpose: a trailing-twelve-month figure
  // over a fiscal year three years back would span three years plus a few
  // months and quietly overstate the rate.
  const rev1 = val(revenue, 1);
  const rev3 = val(revenue, 3);
  if (rev3 != null && rev3 > 0) {
    const cagr = Math.pow(fyRev / rev3, 1 / 3) - 1;
    form.growthRate = (cagr * 100).toFixed(1);
    sources.push({
      field: "growthRate",
      label: "Revenue growth",
      value: pct(cagr),
      how: `3-year compound growth: (${fmtM(fyRev)} ÷ ${fmtM(rev3)})^(1/3) − 1, from FY ending ${yearEnds[3]} to ${end}. Measured between fiscal years so the periods are a clean three years apart.`,
      note: "This is history, not a forecast. A DCF projects it forward five years, ask whether the company can keep this up, and fade it if not.",
    });
  } else if (rev1 != null && rev1 > 0) {
    const g = fyRev / rev1 - 1;
    form.growthRate = (g * 100).toFixed(1);
    sources.push({ field: "growthRate", label: "Revenue growth", value: pct(g), how: `Last year's growth: ${fmtM(fyRev)} ÷ ${fmtM(rev1)} − 1.`, note: "Only one prior year on file, so this is a single year's growth, noisier than a multi-year average." });
  } else missing.push("growthRate");

  // --- EBIT margin ---
  const ebitFlow = flow(["OperatingIncomeLoss"]);
  if (ebitFlow != null) {
    const base = revenueFor(ebitFlow);
    const margin = ebitFlow.value / base;
    form.ebitMargin = (margin * 100).toFixed(1);
    sources.push({
      field: "ebitMargin",
      label: "EBIT margin",
      value: pct(margin),
      how: `Operating income ${fmtM(ebitFlow.value)} ÷ revenue ${fmtM(base)}, both over ${periodFor(ebitFlow)}. EBIT is profit before interest and tax, what the business earns before financing and the taxman.`,
      // A margin this far outside ±100% is not an operating result. It happens
      // when a company carries a large asset at fair value and the quarterly
      // revaluation runs through operating income: Strategy (MSTR) books
      // tens of billions of bitcoin gains and losses against ~$500M of
      // software revenue. The figure is reported as filed rather than
      // clamped, because the number is real; what is wrong is using it in a
      // revenue-margin DCF.
      note:
        Math.abs(margin) > 1
          ? `This is ${pct(margin, 0)} of revenue, so it isn't an operating result. A company that revalues a large asset every quarter (bitcoin, an investment portfolio, biological assets) runs that swing through operating income, which swamps the actual business. A revenue-margin DCF won't tell you much here; the asset needs valuing separately.`
          : undefined,
    });
  } else missing.push("ebitMargin");

  // --- Tax rate ---
  const TAX_TAGS = ["IncomeTaxExpenseBenefit"];
  const PRETAX_TAGS = [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
  ];
  const taxFlow = flow(TAX_TAGS);
  const pretaxFlow = flow(PRETAX_TAGS);
  // Both legs must cover the same window, or the ratio isn't an effective
  // rate. When only one of them has quarterly tagging, fall back to the
  // fiscal year for both rather than dropping the field entirely.
  let tax: number | null = null;
  let pretax: number | null = null;
  let taxPeriod = `FY ending ${end}`;
  if (taxFlow && pretaxFlow) {
    if (taxFlow.ttm === pretaxFlow.ttm) {
      tax = taxFlow.value;
      pretax = pretaxFlow.value;
      taxPeriod = periodFor(taxFlow);
    } else {
      tax = atEnd(seriesAny(TAX_TAGS));
      pretax = atEnd(seriesAny(PRETAX_TAGS));
    }
  }
  if (tax != null && pretax != null && pretax > 0) {
    const raw = tax / pretax;
    const rate = Math.min(Math.max(raw, 0), 0.35);
    form.taxRate = (rate * 100).toFixed(1);
    sources.push({
      field: "taxRate",
      label: "Tax rate",
      value: pct(rate),
      how: `Effective rate: income tax ${fmtM(tax)} ÷ pre-tax income ${fmtM(pretax)}, both over ${taxPeriod}.`,
      note: raw !== rate ? `The raw figure was ${pct(raw)}, clamped to a sensible range, one-off items distort a single year's effective rate.` : undefined,
    });
  } else missing.push("taxRate");

  // --- D&A ---
  const daFlow = flow(["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet"]);
  if (daFlow != null) {
    const base = revenueFor(daFlow);
    form.daPct = ((daFlow.value / base) * 100).toFixed(1);
    sources.push({ field: "daPct", label: "D&A", value: pct(daFlow.value / base), how: `Depreciation & amortization ${fmtM(daFlow.value)} ÷ revenue, over ${periodFor(daFlow)}. A non-cash expense, so the DCF adds it back to profit.` });
  } else missing.push("daPct");

  // --- Capex: filers tag it several ways; a royalty company's "capex" is
  // buying more royalties, which is the honest equivalent. ---
  const CAPEX_TAGS: [string, string][] = [
    ["PaymentsToAcquirePropertyPlantAndEquipment", "Purchases of property, plant & equipment"],
    ["PaymentsToAcquireProductiveAssets", "Purchases of productive assets (PP&E and intangibles)"],
    ["PaymentsToAcquireOtherPropertyPlantAndEquipment", "Purchases of property, plant & equipment"],
    ["PaymentsForCapitalImprovements", "Capital improvements"],
    ["PaymentsToAcquireMineralRights", "Purchases of royalty and stream interests"],
    ["PaymentsToAcquireOilAndGasPropertyAndEquipment", "Oil & gas property and equipment spending"],
  ];
  const capexHit = CAPEX_TAGS.map(([tag, label]) => [flow([tag]), label] as const).find(([v]) => v != null);
  if (capexHit && capexHit[0] != null) {
    const capexFlow = capexHit[0];
    const capex = capexFlow.value;
    const base = revenueFor(capexFlow);
    form.capexPct = ((capex / base) * 100).toFixed(1);
    sources.push({
      field: "capexPct",
      label: "Capex",
      value: pct(capex / base),
      how: `${capexHit[1]} ${fmtM(capex)} ÷ revenue, over ${periodFor(capexFlow)}, from the cash flow statement. Real cash out the door, so the DCF subtracts it.`,
      note:
        capex / base > 0.3
          ? "Unusually high for one year, this probably includes a big acquisition or build-out. A DCF assumes it every year, so consider a more typical figure."
          : undefined,
    });
  } else missing.push("capexPct");

  // --- Cash & debt (shared by NWC and net debt) ---
  const cashOnly = bs(["CashAndCashEquivalentsAtCarryingValue"]);
  // Short-term investments: several tags, and some filers (NVIDIA from
  // FY2026) only report the total of their debt securities without a
  // current/non-current split — still closer to the truth than cash alone.
  const investments = bs([
    "MarketableSecuritiesCurrent",
    "ShortTermInvestments",
    "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
    "DebtSecuritiesAvailableForSaleCurrent",
    "AvailableForSaleSecuritiesDebtSecurities",
  ]);
  const cashAndInvestments =
    bs(["CashCashEquivalentsAndShortTermInvestments"]) ??
    (cashOnly != null ? cashOnly + (investments ?? 0) : null);
  const shortTermDebt = bsSum(["DebtCurrent"], ["CommercialPaper"], ["ShortTermBorrowings"]);
  // Total debt: prefer a tag that already includes the current portion.
  const totalDebt =
    bs(["LongTermDebt"]) ??
    bs(["LongTermDebtAndCapitalLeaseObligations"]) ??
    bsSum(["LongTermDebtNoncurrent"], ["LongTermDebtCurrent"]);
  const debtAll = totalDebt != null ? totalDebt + (bs(["CommercialPaper"]) ?? 0) + (bs(["ShortTermBorrowings"]) ?? 0) : null;

  // --- Net working capital, as % of revenue ---
  const ca = bs(["AssetsCurrent"]);
  const cl = bs(["LiabilitiesCurrent"]);
  if (ca != null && cl != null) {
    const cashPart = cashAndInvestments ?? cashOnly ?? 0;
    const debtPart = shortTermDebt ?? 0;
    const nwc = ca - cashPart - (cl - debtPart);
    const ratio = Math.min(Math.max(nwc / rev0, -0.3), 0.4);
    form.nwcPct = (ratio * 100).toFixed(1);
    sources.push({
      field: "nwcPct",
      label: "Net working capital",
      value: pct(nwc / rev0),
      how: `(Current assets ${fmtM(ca)} − cash & investments ${fmtM(cashPart)}) − (current liabilities ${fmtM(cl)} − short-term debt ${fmtM(debtPart)}) = ${fmtM(nwc)}, ÷ revenue. Balance sheet as of ${bsEnd}. Cash and debt are excluded because they're financing, not operations.`,
      note: nwc < 0 ? "Negative: customers pay before the company pays its suppliers, so growth actually frees up cash." : undefined,
    });
  } else missing.push("nwcPct");

  // --- Shares outstanding ---
  const dei = deiSeries("EntityCommonStockSharesOutstanding");
  const shares = dei[0]?.val ?? atEnd(series("CommonStockSharesOutstanding", "shares")) ?? atEnd(series("WeightedAverageNumberOfDilutedSharesOutstanding", "shares"));
  if (shares != null) {
    form.sharesOutstanding = String(Math.round(shares / M));
    sources.push({ field: "sharesOutstanding", label: "Shares outstanding", value: `${Math.round(shares / M).toLocaleString()}M`, how: dei[0] ? `From the 10-K cover page, as of ${dei[0].end}.` : "From the balance sheet." });
  } else missing.push("sharesOutstanding");

  // --- Net debt ---
  if (debtAll != null && (cashAndInvestments ?? cashOnly) != null) {
    const cash = (cashAndInvestments ?? cashOnly)!;
    const netDebt = debtAll - cash;
    form.netDebt = String(Math.round(netDebt / M));
    sources.push({
      field: "netDebt",
      label: "Net debt",
      value: fmtM(netDebt),
      how: `Total debt ${fmtM(debtAll)} − cash & investments ${fmtM(cash)}, from the balance sheet filed as of ${bsEnd}. Enterprise value belongs to lenders and shareholders together; subtracting net debt leaves the shareholders' part.`,
      note: netDebt < 0 ? "Negative means net cash, more cash than debt, which gets added to equity value." : undefined,
    });
  } else missing.push("netDebt");

  return {
    fiscalYearEnd: end,
    incomeAsOf,
    incomeBasis: useTtm ? "ttm" : "fy",
    balanceSheetAsOf: bsEnd,
    form: {
      revenue: form.revenue,
      growthRate: form.growthRate ?? "",
      ebitMargin: form.ebitMargin ?? "",
      taxRate: form.taxRate ?? "",
      daPct: form.daPct ?? "",
      capexPct: form.capexPct ?? "",
      nwcPct: form.nwcPct ?? "",
      sharesOutstanding: form.sharesOutstanding ?? "",
      netDebt: form.netDebt ?? "",
    },
    sources,
    missing,
  };
}
