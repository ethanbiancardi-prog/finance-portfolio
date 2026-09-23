// SEC requires a descriptive User-Agent with a contact email on every request
// (its Fair Access policy) — this isn't a secret, so it's a plain constant.
const SEC_USER_AGENT = "finance-portfolio ethanbiancardi@gmail.com";

async function secFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": SEC_USER_AGENT, ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`SEC EDGAR ${url} failed (${res.status})`);
  }
  return res;
}

import { searchTickers, type TickerMatch } from "./tickerSearch";

export type TickerEntry = { cik: number; ticker: string; title: string };

let tickerMapPromise: Promise<{
  byTicker: Map<string, TickerEntry>;
  byCik: Map<number, TickerEntry>;
}> | null = null;

// SEC's ticker->CIK master file is ~1MB and rarely changes, so cache it in
// memory for the life of the server process instead of refetching per request.
function getTickerMaps() {
  if (!tickerMapPromise) {
    tickerMapPromise = secFetch("https://www.sec.gov/files/company_tickers.json", {
      next: { revalidate: 86400 },
    })
      .then((res) => res.json())
      .then((raw: Record<string, { cik_str: number; ticker: string; title: string }>) => {
        const byTicker = new Map<string, TickerEntry>();
        const byCik = new Map<number, TickerEntry>();
        for (const row of Object.values(raw)) {
          const entry = { cik: row.cik_str, ticker: row.ticker, title: row.title };
          byTicker.set(entry.ticker.toUpperCase(), entry);
          byCik.set(entry.cik, entry);
        }
        return { byTicker, byCik };
      });
  }
  return tickerMapPromise;
}

// Separate from the ticker->CIK map above: SEC also publishes a variant of
// the same file that includes the listing exchange, which the search
// dropdown shows. Cached for the process lifetime just like getTickerMaps().
let searchListPromise: Promise<TickerMatch[]> | null = null;

function getSearchList() {
  if (!searchListPromise) {
    searchListPromise = secFetch("https://www.sec.gov/files/company_tickers_exchange.json", {
      next: { revalidate: 86400 },
    })
      .then((res) => res.json())
      .then((raw: { fields: string[]; data: (string | number | null)[][] }) => {
        const col = (name: string) => raw.fields.indexOf(name);
        const [iName, iTicker, iExchange] = [col("name"), col("ticker"), col("exchange")];
        return raw.data
          .filter((row) => row[iTicker])
          .map((row) => ({
            symbol: String(row[iTicker]),
            name: String(row[iName] ?? ""),
            exchange: String(row[iExchange] ?? ""),
          }));
      })
      .catch((err) => {
        searchListPromise = null; // let the next request retry
        throw err;
      });
  }
  return searchListPromise;
}

export async function searchCompanies(query: string, limit = 8): Promise<TickerMatch[]> {
  return searchTickers(await getSearchList(), query, limit);
}

export async function resolveTicker(ticker: string): Promise<TickerEntry | null> {
  const { byTicker } = await getTickerMaps();
  return byTicker.get(ticker.toUpperCase()) ?? null;
}

// Batch name lookup — cheap even for many tickers, since getTickerMaps()
// caches the whole SEC ticker file in memory after the first call.
export async function resolveTickerNames(tickers: string[]): Promise<Map<string, string>> {
  const { byTicker } = await getTickerMaps();
  const names = new Map<string, string>();
  for (const ticker of tickers) {
    const entry = byTicker.get(ticker.toUpperCase());
    if (entry) names.set(ticker.toUpperCase(), entry.title);
  }
  return names;
}

export async function getCompanyFacts(cik: number) {
  const padded = String(cik).padStart(10, "0");
  const res = await secFetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`);
  return res.json();
}

export type FactPoint = { start?: string; end: string; val: number; fy: number; fp: string; form: string; filed: string };

// Flow facts (revenue, income, cash flow) carry a start date; an annual
// figure spans roughly a year. 10-Ks also tag the year's quarterly figures
// as form 10-K / fp FY, which would otherwise pass as "annual" and make a
// quarter look like a prior year (Honeywell: +297% "growth").
function isAnnualDuration(p: FactPoint): boolean {
  if (!p.start) return true; // balance-sheet (instant) fact
  const days = (new Date(p.end).getTime() - new Date(p.start).getTime()) / 86_400_000;
  return days >= 350 && days <= 380;
}

// A tag can appear many times (once per filing that reports it as a
// comparative period) — keep the most recently filed value per period-end,
// then sort newest period first.
function latestAnnual(points: FactPoint[]): FactPoint[] {
  const annual = points.filter((p) => p.form === "10-K" && p.fp === "FY" && isAnnualDuration(p));
  const byEnd = new Map<string, FactPoint>();
  for (const p of annual) {
    const existing = byEnd.get(p.end);
    if (!existing || p.filed > existing.filed) byEnd.set(p.end, p);
  }
  return [...byEnd.values()].sort((a, b) => b.end.localeCompare(a.end));
}

function safeDiv(numerator: number | null, denominator: number | null) {
  if (numerator == null || !denominator) return null;
  return numerator / denominator;
}

function safeSub(a: number | null, b: number | null) {
  if (a == null || b == null) return null;
  return a - b;
}

// Some filers report InterestExpense inconsistently (e.g. net of interest
// income, landing at zero or negative for a company with more cash than
// debt) — a ratio over that denominator is meaningless, not just small.
function safeDivPositiveDenom(numerator: number | null, denominator: number | null) {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return numerator / denominator;
}

// "x" = plain multiple (1.42), "%" = percentage, "$" = compact currency.
export type RatioFormat = "x" | "%" | "$";

export type Ratio = {
  label: string;
  group: string;
  description: string;
  format: RatioFormat;
  value: number | null;
  prior: number | null;
};

export type RatioDashboard = {
  periodEnd: string | null;
  priorPeriodEnd: string | null;
  revenue: number | null;
  revenuePrior: number | null;
  revenueGrowth: number | null;
  netIncome: number | null;
  ratios: Ratio[];
};

// Revenue tags, most-preferred first. "Revenues" is the generic total;
// the ContractWithCustomer variants are the ASC 606-era tags most filers
// use, and some (e.g. CrowdStrike) only report the Including variant.
const REVENUE_TAGS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "SalesRevenueNet",
  // Banks and brokers report a net figure instead (Morgan Stanley, Goldman).
  "RevenuesNetOfInterestExpense",
];

// Shared by computeRatios and getRedFlagNumbers — both need the same
// "pull an annual XBRL series, with fallback tags" building blocks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSeriesHelpers(facts: any) {
  const gaap = facts.facts?.["us-gaap"] ?? {};

  function series(tag: string, unit: "USD" | "shares" = "USD"): FactPoint[] {
    const points = gaap[tag]?.units?.[unit];
    return points ? latestAnnual(points) : [];
  }

  // Cover-page facts (dei namespace) aren't tied to a fiscal period the way
  // financial statement lines are — shares outstanding is "as of" a date a
  // few weeks after year end — so take them newest-first without the
  // 10-K/FY filter.
  function deiSeries(tag: string): FactPoint[] {
    const points: FactPoint[] = facts.facts?.dei?.[tag]?.units?.shares ?? [];
    return [...points].sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed));
  }

  // Different filers tag the same line item differently (e.g. older vs.
  // newer taxonomy revisions), and a single filer can switch tags between
  // years — NVIDIA reported revenue under ...ExcludingAssessedTax through
  // FY2022 and under Revenues from FY2023 on. So instead of "first tag with
  // any data" (which returned NVIDIA's FY2022 revenue as if it were current),
  // merge every tag's points by fiscal year end, earlier tags in the list
  // winning when two report the same year.
  // Tag priority: the tag that reports the most recent year wins for every
  // year it covers, and the others only fill gaps. Otherwise a narrower
  // line item that shares a tag name (BlackRock's "Revenues" is a sub-total
  // that stops in 2024; total revenue is under RevenueFromContract...)
  // becomes "last year" and the comparison spans two different concepts.
  function seriesAny(tags: string[]): FactPoint[] {
    const perTag = tags.map((tag) => series(tag)).filter((pts) => pts.length > 0);
    const latestEnd = perTag.reduce((max, pts) => (pts[0].end > max ? pts[0].end : max), "");
    const ordered = [...perTag.filter((pts) => pts[0].end === latestEnd), ...perTag.filter((pts) => pts[0].end !== latestEnd)];
    const byEnd = new Map<string, FactPoint>();
    for (const pts of ordered) {
      for (const p of pts) {
        if (!byEnd.has(p.end)) byEnd.set(p.end, p);
      }
    }
    return [...byEnd.values()].sort((a, b) => b.end.localeCompare(a.end));
  }

  // Every series is read relative to the company's fiscal year ends, taken
  // from the balance sheet (Assets is reported by every filer, every year).
  // Index 0 is the latest year end, 1 the one before. Reading by position
  // instead would let a tag that stopped being used years ago (Morgan
  // Stanley's "Revenues" ends in 2014) masquerade as the current year.
  const yearEnds = series("Assets").map((p) => p.end);
  function val(points: FactPoint[], i: number): number | null {
    const end = yearEnds[i];
    if (!end) return points[i]?.val ?? null;
    return points.find((p) => p.end === end)?.val ?? null;
  }

  return { series, seriesAny, val, deiSeries, yearEnds };
}

// The same helpers, for modules outside this file (lib/dcfPrefill.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getCompanyFactSeries(facts: any) {
  return buildSeriesHelpers(facts);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeRatios(facts: any): RatioDashboard {
  const { series, seriesAny, val } = buildSeriesHelpers(facts);

  const assets = series("Assets");
  const assetsCurrent = series("AssetsCurrent");
  const liabilities = series("Liabilities");
  const liabilitiesCurrent = series("LiabilitiesCurrent");
  const equity = series("StockholdersEquity");
  const netIncome = series("NetIncomeLoss");
  const revenue = seriesAny(REVENUE_TAGS);
  const inventory = series("InventoryNet");
  const cash = series("CashAndCashEquivalentsAtCarryingValue");
  const costOfRevenue = seriesAny(["CostOfGoodsAndServicesSold", "CostOfRevenue"]);
  const grossProfitTag = series("GrossProfit");
  const operatingIncome = series("OperatingIncomeLoss");
  const interestExpense = seriesAny(["InterestExpense", "InterestExpenseDebt"]);
  const taxExpense = series("IncomeTaxExpenseBenefit");
  const pretaxIncome = seriesAny([
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
  ]);
  const receivables = series("AccountsReceivableNetCurrent");
  const operatingCashFlow = series("NetCashProvidedByUsedInOperatingActivities");
  const capex = series("PaymentsToAcquirePropertyPlantAndEquipment");

  const revenueNow = val(revenue, 0);
  const revenuePrior = val(revenue, 1);

  // Gross profit isn't always tagged directly — fall back to Revenue minus
  // cost of revenue when it's missing.
  function grossProfit(i: number): number | null {
    const tagged = val(grossProfitTag, i);
    if (tagged != null) return tagged;
    return safeSub(val(revenue, i), val(costOfRevenue, i));
  }

  // NOPAT = operating income after tax — the "after tax" part needs an
  // effective tax rate (tax expense / pretax income). If either input is
  // missing, leave NOPAT (and ROIC) as null rather than guessing a rate.
  function nopat(i: number): number | null {
    const taxRate = safeDiv(val(taxExpense, i), val(pretaxIncome, i));
    if (taxRate == null) return null;
    const opInc = val(operatingIncome, i);
    if (opInc == null) return null;
    return opInc * (1 - taxRate);
  }

  // Simplified invested capital: total assets minus non-interest-bearing
  // current liabilities. A common textbook proxy when a full debt/equity
  // breakdown isn't cleanly available from XBRL tags alone.
  function investedCapital(i: number): number | null {
    return safeSub(val(assets, i), val(liabilitiesCurrent, i));
  }

  function freeCashFlow(i: number): number | null {
    return safeSub(val(operatingCashFlow, i), val(capex, i));
  }

  return {
    periodEnd: assets[0]?.end ?? null,
    priorPeriodEnd: assets[1]?.end ?? null,
    revenue: revenueNow,
    revenuePrior,
    revenueGrowth: safeDiv(safeSub(revenueNow, revenuePrior), revenuePrior),
    netIncome: val(netIncome, 0),
    ratios: [
      // --- Liquidity: can short-term obligations be covered? ---
      {
        label: "Current Ratio",
        group: "Liquidity",
        description: "Can short-term assets cover short-term bills? Above 1 means yes.",
        format: "x",
        // Current assets / current liabilities.
        value: safeDiv(val(assetsCurrent, 0), val(liabilitiesCurrent, 0)),
        prior: safeDiv(val(assetsCurrent, 1), val(liabilitiesCurrent, 1)),
      },
      {
        label: "Quick Ratio",
        group: "Liquidity",
        description:
          "Same test, excluding inventory, the current asset that's slowest to turn into cash.",
        format: "x",
        // (Current assets − inventory) / current liabilities.
        value: safeDiv(safeSub(val(assetsCurrent, 0), val(inventory, 0)), val(liabilitiesCurrent, 0)),
        prior: safeDiv(safeSub(val(assetsCurrent, 1), val(inventory, 1)), val(liabilitiesCurrent, 1)),
      },
      {
        label: "Cash Ratio",
        group: "Liquidity",
        description: "The strictest test: could cash on hand alone cover short-term bills today?",
        format: "x",
        // Cash / current liabilities.
        value: safeDiv(val(cash, 0), val(liabilitiesCurrent, 0)),
        prior: safeDiv(val(cash, 1), val(liabilitiesCurrent, 1)),
      },

      // --- Leverage: how much of the company is financed with debt? ---
      {
        label: "Debt-to-Equity",
        group: "Leverage",
        description:
          "Dollars of debt for every dollar shareholders invested. Higher means more leveraged, more risk.",
        format: "x",
        // Total liabilities / equity.
        value: safeDiv(val(liabilities, 0), val(equity, 0)),
        prior: safeDiv(val(liabilities, 1), val(equity, 1)),
      },
      {
        label: "Debt-to-Assets",
        group: "Leverage",
        description: "Share of everything the company owns that was paid for with debt.",
        format: "%",
        // Total liabilities / total assets.
        value: safeDiv(val(liabilities, 0), val(assets, 0)),
        prior: safeDiv(val(liabilities, 1), val(assets, 1)),
      },
      {
        label: "Interest Coverage",
        group: "Leverage",
        description:
          "How many times over operating profit could pay this year's interest bill. Low means debt-service risk.",
        format: "x",
        // Operating income / interest expense (EBIT proxy over interest cost).
        value: safeDivPositiveDenom(val(operatingIncome, 0), val(interestExpense, 0)),
        prior: safeDivPositiveDenom(val(operatingIncome, 1), val(interestExpense, 1)),
      },

      // --- Profitability: how much profit per dollar of revenue/capital? ---
      {
        label: "Gross Margin",
        group: "Profitability",
        description: "Cents kept from each revenue dollar after direct product/service cost.",
        format: "%",
        value: safeDiv(grossProfit(0), revenueNow),
        prior: safeDiv(grossProfit(1), revenuePrior),
      },
      {
        label: "Operating Margin",
        group: "Profitability",
        description:
          "Profit left after direct costs and running the business, before interest and taxes.",
        format: "%",
        value: safeDiv(val(operatingIncome, 0), revenueNow),
        prior: safeDiv(val(operatingIncome, 1), revenuePrior),
      },
      {
        label: "Net Margin",
        group: "Profitability",
        description: "What's left as profit after every expense, interest, and tax.",
        format: "%",
        // Net income / revenue.
        value: safeDiv(val(netIncome, 0), revenueNow),
        prior: safeDiv(val(netIncome, 1), revenuePrior),
      },
      {
        label: "ROE",
        group: "Profitability",
        description: "Profit per dollar shareholders invested, how well management uses owners' capital.",
        format: "%",
        // Net income / equity.
        value: safeDiv(val(netIncome, 0), val(equity, 0)),
        prior: safeDiv(val(netIncome, 1), val(equity, 1)),
      },
      {
        label: "ROA",
        group: "Profitability",
        description: "Profit per dollar of total assets, regardless of how those assets were financed.",
        format: "%",
        // Net income / total assets.
        value: safeDiv(val(netIncome, 0), val(assets, 0)),
        prior: safeDiv(val(netIncome, 1), val(assets, 1)),
      },
      {
        label: "ROIC",
        group: "Profitability",
        description:
          "After-tax operating profit per dollar of capital tied up in the business, the return that matters most for judging if a company creates value.",
        format: "%",
        // NOPAT / invested capital.
        value: safeDiv(nopat(0), investedCapital(0)),
        prior: safeDiv(nopat(1), investedCapital(1)),
      },

      // --- Efficiency: how well are assets put to work? ---
      {
        label: "Asset Turnover",
        group: "Efficiency",
        description: "Revenue generated per dollar of assets, how efficiently assets are used.",
        format: "x",
        // Revenue / assets.
        value: safeDiv(revenueNow, val(assets, 0)),
        prior: safeDiv(revenuePrior, val(assets, 1)),
      },
      {
        label: "Inventory Turnover",
        group: "Efficiency",
        description: "How many times inventory is sold and replaced per year, higher means less cash sitting on shelves.",
        format: "x",
        // Cost of revenue / inventory.
        value: safeDiv(val(costOfRevenue, 0), val(inventory, 0)),
        prior: safeDiv(val(costOfRevenue, 1), val(inventory, 1)),
      },
      {
        label: "Receivables Turnover",
        group: "Efficiency",
        description: "How many times per year receivables are collected, higher means getting paid faster.",
        format: "x",
        // Revenue / accounts receivable.
        value: safeDiv(revenueNow, val(receivables, 0)),
        prior: safeDiv(revenuePrior, val(receivables, 1)),
      },

      // --- Cash flow: does profit actually show up as cash? ---
      {
        label: "Free Cash Flow",
        group: "Cash Flow",
        description: "Cash left after running the business and paying for the equipment to keep running it.",
        format: "$",
        // Operating cash flow − capex.
        value: freeCashFlow(0),
        prior: freeCashFlow(1),
      },
      {
        label: "Operating Cash Flow Margin",
        group: "Cash Flow",
        description: "Share of revenue that converts into real cash from operations, not just accounting profit.",
        format: "%",
        value: safeDiv(val(operatingCashFlow, 0), revenueNow),
        prior: safeDiv(val(operatingCashFlow, 1), revenuePrior),
      },
    ],
  };
}

export type RedFlagNumbers = {
  revenueGrowth: number | null;
  ocfGrowth: number | null;
  // Revenue growing while the cash actually coming in from operations
  // shrinks — a classic sign that reported profit isn't converting to cash
  // (e.g. revenue recognized before it's collected).
  revenueUpOcfDown: boolean;
  liabilitiesGrowth: number | null;
  interestCoverageNow: number | null;
  interestCoveragePrior: number | null;
  // Taking on more debt while the cushion to pay interest on it shrinks —
  // leverage rising exactly when it's getting harder to service.
  debtRisingCoverageFalling: boolean;
  inventoryGrowth: number | null;
  // Inventory piling up faster than sales can often mean demand is
  // softening, or goods are becoming obsolete/unsellable.
  inventoryOutpacingRevenue: boolean;
};

// The three "does the math cross a line" checks are pure arithmetic on
// numbers already in the filing — no AI needed, and more reliable computed
// directly than inferred from a prompt.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRedFlagNumbers(facts: any): RedFlagNumbers {
  const { series, seriesAny, val } = buildSeriesHelpers(facts);

  const revenue = seriesAny(REVENUE_TAGS);
  const operatingCashFlow = series("NetCashProvidedByUsedInOperatingActivities");
  const liabilities = series("Liabilities");
  const operatingIncome = series("OperatingIncomeLoss");
  const interestExpense = seriesAny(["InterestExpense", "InterestExpenseDebt"]);
  const inventory = series("InventoryNet");

  const growth = (points: FactPoint[]) => safeDiv(safeSub(val(points, 0), val(points, 1)), val(points, 1));

  const revenueGrowth = growth(revenue);
  const ocfGrowth = growth(operatingCashFlow);
  const liabilitiesGrowth = growth(liabilities);
  const inventoryGrowth = growth(inventory);
  const interestCoverageNow = safeDivPositiveDenom(val(operatingIncome, 0), val(interestExpense, 0));
  const interestCoveragePrior = safeDivPositiveDenom(val(operatingIncome, 1), val(interestExpense, 1));

  return {
    revenueGrowth,
    ocfGrowth,
    revenueUpOcfDown: revenueGrowth != null && ocfGrowth != null && revenueGrowth > 0 && ocfGrowth < 0,
    liabilitiesGrowth,
    interestCoverageNow,
    interestCoveragePrior,
    debtRisingCoverageFalling:
      liabilitiesGrowth != null &&
      interestCoverageNow != null &&
      interestCoveragePrior != null &&
      liabilitiesGrowth > 0 &&
      interestCoverageNow < interestCoveragePrior,
    inventoryGrowth,
    inventoryOutpacingRevenue:
      inventoryGrowth != null && revenueGrowth != null && inventoryGrowth > revenueGrowth,
  };
}

export type FilingRef = { accessionNumber: string; primaryDocument: string; filingDate: string };

// Submissions API lists every filing a company has made — walk it for the
// most recent 10-Ks (annual reports), which is where red flags, MD&A, and
// risk factors live.
export async function getRecentTenKFilings(cik: number, count: number): Promise<FilingRef[]> {
  const padded = String(cik).padStart(10, "0");
  const res = await secFetch(`https://data.sec.gov/submissions/CIK${padded}.json`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const recent = data.filings?.recent;
  if (!recent) return [];

  const filings: FilingRef[] = [];
  for (let i = 0; i < recent.form.length && filings.length < count; i++) {
    if (recent.form[i] === "10-K") {
      filings.push({
        accessionNumber: recent.accessionNumber[i],
        primaryDocument: recent.primaryDocument[i],
        filingDate: recent.filingDate[i],
      });
    }
  }
  return filings;
}

// 10-Ks are filed as HTML — strip tags/scripts down to plain text. Not a
// full HTML parser, just enough to make the document searchable and
// readable in an AI prompt.
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getFilingText(cik: number, filing: FilingRef): Promise<string> {
  const accessionNoDashes = filing.accessionNumber.replace(/-/g, "");
  const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}/${filing.primaryDocument}`;
  const res = await secFetch(url);
  const html = await res.text();
  return stripHtml(html);
}

export type CompanyProfile = {
  sicDescription: string | null; // SEC's industry label, e.g. "Semiconductors & Related Devices"
  stateOfIncorporation: string | null;
  fiscalYearEnd: string | null; // "MMDD"
  headquarters: string | null; // "Santa Clara, CA"
  exchange: string | null;
};

// Basic facts from the same submissions feed getRecentTenKFilings walks.
// Cached a day — none of this changes between annual reports.
export async function getCompanyProfile(cik: number): Promise<CompanyProfile> {
  const padded = String(cik).padStart(10, "0");
  const res = await secFetch(`https://data.sec.gov/submissions/CIK${padded}.json`, {
    next: { revalidate: 86400 },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const biz = data.addresses?.business;
  const headquarters = biz?.city
    ? `${titleCase(biz.city)}, ${biz.stateOrCountry ?? ""}`.replace(/, $/, "")
    : null;
  return {
    sicDescription: data.sicDescription || null,
    stateOfIncorporation: data.stateOfIncorporation || null,
    fiscalYearEnd: data.fiscalYearEnd || null,
    headquarters,
    exchange: data.exchanges?.[0] ?? null,
  };
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// "Item 1. Business" is the section where a company describes what it does,
// in its own words — the best source for a plain-English summary. The
// phrase appears several times in every 10-K: in the table of contents, as
// the real heading, and in cross-references like "see Item 1. Business of
// this report" inside the risk factors. Only the first two are followed by
// an "Item 1A. Risk Factors" heading, and of those the real one is by far
// the longer — so take the longest *bounded* candidate and cap it: the first
// few thousand words are the overview, the rest is segment detail.
export function extractBusinessSection(text: string, maxChars = 14000): string | null {
  const headings = [...text.matchAll(/item\s*1\.?\s*[-–—:]?\s*business\b/gi)];
  if (headings.length === 0) return null;

  let best: string | null = null;
  for (const h of headings) {
    const start = h.index! + h[0].length;
    // A cross-reference reads "...see Item 1. Business of this report" / "in
    // Part I" / ")"; a real heading is followed straight by body text.
    if (/^\s*(of (this|our|the)|(of|in) part|and elsewhere|above|below|[),.;])/i.test(text.slice(start, start + 16))) continue;
    const next = text.slice(start).search(/item\s*1a\.?\s*[-–—:]?\s*risk\s*factors/i);
    if (next === -1) continue; // unbounded: a cross-reference after the real 1A heading
    const section = text.slice(start, start + next);
    if (!best || section.length > best.length) best = section;
  }
  if (!best || best.length < 500) return null;
  return best.slice(0, maxChars).trim();
}

// Pull short excerpts of text around each match of a pattern, so an AI
// prompt only sees the relevant sentences instead of the entire filing.
export function findSnippets(text: string, pattern: RegExp, contextChars: number, maxSnippets: number): string[] {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  const snippets: string[] = [];
  let match: RegExpExecArray | null;
  while (snippets.length < maxSnippets && (match = re.exec(text))) {
    const start = Math.max(0, match.index - contextChars);
    const end = Math.min(text.length, match.index + match[0].length + contextChars);
    snippets.push(text.slice(start, end));
  }
  return snippets;
}

// Resolves a curated ticker list (see lib/sectors.ts) to SEC filer entries,
// preserving the list's order and skipping anything SEC doesn't know about
// — cheap because getTickerMaps() caches the whole ticker file in memory.
export async function resolveTickerEntries(tickers: string[]): Promise<TickerEntry[]> {
  const { byTicker } = await getTickerMaps();
  return tickers
    .map((t) => byTicker.get(t.toUpperCase()))
    .filter((entry): entry is TickerEntry => !!entry);
}
