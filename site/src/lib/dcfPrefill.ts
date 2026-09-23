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
  const { seriesAny, series, val, deiSeries, yearEnds } = getCompanyFactSeries(facts);

  const revenue = seriesAny(["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet", "RevenuesNetOfInterestExpense"]);
  const rev0 = val(revenue, 0);
  const end = yearEnds[0];
  if (rev0 == null || !end) return null;

  // Every balance-sheet figure must be as of the same fiscal year end as
  // the revenue we're scaling by — a stale tag from three years ago is
  // worse than no value.
  const atEnd = (points: FactPoint[]) => points.find((p) => p.end === end)?.val ?? null;
  const sumAtEnd = (...lists: FactPoint[][]) => {
    const vals = lists.map(atEnd).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };

  const sources: PrefillSource[] = [];
  const missing: string[] = [];
  const form: Partial<DcfPrefill["form"]> = {};

  // --- Revenue ---
  form.revenue = String(Math.round(rev0 / M));
  sources.push({ field: "revenue", label: "Revenue", value: fmtM(rev0), how: `Total revenue for the fiscal year ending ${end}, straight from the income statement.` });

  // --- Growth: 3-year CAGR when we have it, else last year's growth ---
  const rev1 = val(revenue, 1);
  const rev3 = val(revenue, 3);
  if (rev3 != null && rev3 > 0) {
    const cagr = Math.pow(rev0 / rev3, 1 / 3) - 1;
    form.growthRate = (cagr * 100).toFixed(1);
    sources.push({
      field: "growthRate",
      label: "Revenue growth",
      value: pct(cagr),
      how: `3-year compound growth: (${fmtM(rev0)} ÷ ${fmtM(rev3)})^(1/3) − 1, from FY ending ${yearEnds[3]} to ${end}.`,
      note: "This is history, not a forecast. A DCF projects it forward five years, ask whether the company can keep this up, and fade it if not.",
    });
  } else if (rev1 != null && rev1 > 0) {
    const g = rev0 / rev1 - 1;
    form.growthRate = (g * 100).toFixed(1);
    sources.push({ field: "growthRate", label: "Revenue growth", value: pct(g), how: `Last year's growth: ${fmtM(rev0)} ÷ ${fmtM(rev1)} − 1.`, note: "Only one prior year on file, so this is a single year's growth, noisier than a multi-year average." });
  } else missing.push("growthRate");

  // --- EBIT margin ---
  const ebit = atEnd(series("OperatingIncomeLoss"));
  if (ebit != null) {
    form.ebitMargin = ((ebit / rev0) * 100).toFixed(1);
    sources.push({ field: "ebitMargin", label: "EBIT margin", value: pct(ebit / rev0), how: `Operating income ${fmtM(ebit)} ÷ revenue ${fmtM(rev0)}. EBIT is profit before interest and tax, what the business earns before financing and the taxman.` });
  } else missing.push("ebitMargin");

  // --- Tax rate ---
  const tax = atEnd(series("IncomeTaxExpenseBenefit"));
  const pretax = atEnd(
    seriesAny([
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    ]),
  );
  if (tax != null && pretax != null && pretax > 0) {
    const raw = tax / pretax;
    const rate = Math.min(Math.max(raw, 0), 0.35);
    form.taxRate = (rate * 100).toFixed(1);
    sources.push({
      field: "taxRate",
      label: "Tax rate",
      value: pct(rate),
      how: `Effective rate: income tax ${fmtM(tax)} ÷ pre-tax income ${fmtM(pretax)}.`,
      note: raw !== rate ? `The raw figure was ${pct(raw)}, clamped to a sensible range, one-off items distort a single year's effective rate.` : undefined,
    });
  } else missing.push("taxRate");

  // --- D&A ---
  const da = atEnd(seriesAny(["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet"]));
  if (da != null) {
    form.daPct = ((da / rev0) * 100).toFixed(1);
    sources.push({ field: "daPct", label: "D&A", value: pct(da / rev0), how: `Depreciation & amortization ${fmtM(da)} ÷ revenue. A non-cash expense, so the DCF adds it back to profit.` });
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
  const capexHit = CAPEX_TAGS.map(([tag, label]) => [atEnd(series(tag)), label] as const).find(([v]) => v != null);
  if (capexHit && capexHit[0] != null) {
    const capex = capexHit[0];
    form.capexPct = ((capex / rev0) * 100).toFixed(1);
    sources.push({
      field: "capexPct",
      label: "Capex",
      value: pct(capex / rev0),
      how: `${capexHit[1]} ${fmtM(capex)} ÷ revenue, from the cash flow statement. Real cash out the door, so the DCF subtracts it.`,
      note:
        capex / rev0 > 0.3
          ? "Unusually high for one year, this probably includes a big acquisition or build-out. A DCF assumes it every year, so consider a more typical figure."
          : undefined,
    });
  } else missing.push("capexPct");

  // --- Cash & debt (shared by NWC and net debt) ---
  const cashOnly = atEnd(series("CashAndCashEquivalentsAtCarryingValue"));
  // Short-term investments: several tags, and some filers (NVIDIA from
  // FY2026) only report the total of their debt securities without a
  // current/non-current split — still closer to the truth than cash alone.
  const investments = atEnd(
    seriesAny([
      "MarketableSecuritiesCurrent",
      "ShortTermInvestments",
      "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
      "DebtSecuritiesAvailableForSaleCurrent",
      "AvailableForSaleSecuritiesDebtSecurities",
    ]),
  );
  const cashAndInvestments =
    atEnd(series("CashCashEquivalentsAndShortTermInvestments")) ??
    (cashOnly != null ? cashOnly + (investments ?? 0) : null);
  const shortTermDebt = sumAtEnd(series("DebtCurrent"), series("CommercialPaper"), series("ShortTermBorrowings"));
  // Total debt: prefer a tag that already includes the current portion.
  const totalDebt =
    atEnd(series("LongTermDebt")) ??
    atEnd(series("LongTermDebtAndCapitalLeaseObligations")) ??
    sumAtEnd(series("LongTermDebtNoncurrent"), series("LongTermDebtCurrent"));
  const debtAll = totalDebt != null ? totalDebt + (atEnd(series("CommercialPaper")) ?? 0) + (atEnd(series("ShortTermBorrowings")) ?? 0) : null;

  // --- Net working capital, as % of revenue ---
  const ca = atEnd(series("AssetsCurrent"));
  const cl = atEnd(series("LiabilitiesCurrent"));
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
      how: `(Current assets ${fmtM(ca)} − cash & investments ${fmtM(cashPart)}) − (current liabilities ${fmtM(cl)} − short-term debt ${fmtM(debtPart)}) = ${fmtM(nwc)}, ÷ revenue. Cash and debt are excluded because they're financing, not operations.`,
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
      how: `Total debt ${fmtM(debtAll)} − cash & investments ${fmtM(cash)}. Enterprise value belongs to lenders and shareholders together; subtracting net debt leaves the shareholders' part.`,
      note: netDebt < 0 ? "Negative means net cash, more cash than debt, which gets added to equity value." : undefined,
    });
  } else missing.push("netDebt");

  return {
    fiscalYearEnd: end,
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
