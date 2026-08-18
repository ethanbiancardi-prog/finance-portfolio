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

export async function resolveTicker(ticker: string): Promise<TickerEntry | null> {
  const { byTicker } = await getTickerMaps();
  return byTicker.get(ticker.toUpperCase()) ?? null;
}

export async function getCompanyFacts(cik: number) {
  const padded = String(cik).padStart(10, "0");
  const res = await secFetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`);
  return res.json();
}

type FactPoint = { end: string; val: number; fy: number; fp: string; form: string; filed: string };

// A tag can appear many times (once per filing that reports it as a
// comparative period) — keep the most recently filed value per period-end,
// then sort newest period first.
function latestAnnual(points: FactPoint[]): FactPoint[] {
  const annual = points.filter((p) => p.form === "10-K" && p.fp === "FY");
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeRatios(facts: any): RatioDashboard {
  const gaap = facts.facts?.["us-gaap"] ?? {};

  function series(tag: string): FactPoint[] {
    const unit = gaap[tag]?.units?.USD;
    return unit ? latestAnnual(unit) : [];
  }

  // Different filers tag the same line item differently (e.g. older vs.
  // newer taxonomy revisions) — try each tag in order, use the first that
  // has data.
  function seriesAny(tags: string[]): FactPoint[] {
    for (const tag of tags) {
      const points = series(tag);
      if (points.length) return points;
    }
    return [];
  }

  function val(points: FactPoint[], i: number): number | null {
    return points[i]?.val ?? null;
  }

  const assets = series("Assets");
  const assetsCurrent = series("AssetsCurrent");
  const liabilities = series("Liabilities");
  const liabilitiesCurrent = series("LiabilitiesCurrent");
  const equity = series("StockholdersEquity");
  const netIncome = series("NetIncomeLoss");
  const revenue = seriesAny(["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues"]);
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
          "Same test, excluding inventory — the current asset that's slowest to turn into cash.",
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
        description: "Profit per dollar shareholders invested — how well management uses owners' capital.",
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
          "After-tax operating profit per dollar of capital tied up in the business — the return that matters most for judging if a company creates value.",
        format: "%",
        // NOPAT / invested capital.
        value: safeDiv(nopat(0), investedCapital(0)),
        prior: safeDiv(nopat(1), investedCapital(1)),
      },

      // --- Efficiency: how well are assets put to work? ---
      {
        label: "Asset Turnover",
        group: "Efficiency",
        description: "Revenue generated per dollar of assets — how efficiently assets are used.",
        format: "x",
        // Revenue / assets.
        value: safeDiv(revenueNow, val(assets, 0)),
        prior: safeDiv(revenuePrior, val(assets, 1)),
      },
      {
        label: "Inventory Turnover",
        group: "Efficiency",
        description: "How many times inventory is sold and replaced per year — higher means less cash sitting on shelves.",
        format: "x",
        // Cost of revenue / inventory.
        value: safeDiv(val(costOfRevenue, 0), val(inventory, 0)),
        prior: safeDiv(val(costOfRevenue, 1), val(inventory, 1)),
      },
      {
        label: "Receivables Turnover",
        group: "Efficiency",
        description: "How many times per year receivables are collected — higher means getting paid faster.",
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

// Friendly industry categories mapped to representative SEC SIC codes. This
// is a rough proxy, not exhaustive — SEC's classification predates most of
// these informal industry labels.
export const INDUSTRY_CATEGORIES: Record<string, { label: string; sic: number[] }> = {
  tech: { label: "Tech", sic: [7372, 3674] },
  biotech: { label: "Biotech", sic: [8731, 2836] },
  healthcare: { label: "Healthcare", sic: [2834, 8000] },
  consumer: { label: "Consumer", sic: [5812, 5311] },
  energy: { label: "Energy", sic: [1311, 2911] },
  sustainability: { label: "Sustainability", sic: [4911] },
};

function recentQuarterLabels(count: number): string[] {
  const now = new Date();
  let year = now.getFullYear();
  // Start one quarter back — the current quarter's frame is usually incomplete.
  let quarter = Math.floor(now.getMonth() / 3) + 1 - 1;
  if (quarter === 0) {
    quarter = 4;
    year -= 1;
  }

  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    labels.push(`CY${year}Q${quarter}I`);
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }
  return labels;
}

let popularityPromise: Promise<Map<number, number>> | null = null;

// SEC has no notion of "popularity" — public float (roughly, market cap held
// by public shareholders) is a stand-in: bigger companies are the ones people
// have actually heard of. Each filer reports it once a year, but "as of" its
// own fiscal Q2 end — a date that can land in any calendar quarter depending
// on the company's fiscal year — so pool two trailing years to be sure every
// filer's most recent report falls inside the window.
function getPopularityMap() {
  if (!popularityPromise) {
    popularityPromise = Promise.all(
      recentQuarterLabels(8).map((period) =>
        secFetch(`https://data.sec.gov/api/xbrl/frames/dei/EntityPublicFloat/USD/${period}.json`)
          .then((res) => res.json())
          .catch(() => ({ data: [] })),
      ),
    ).then((frames) => {
      const latestEnd = new Map<number, string>();
      const map = new Map<number, number>();
      for (const frame of frames) {
        for (const row of frame.data ?? []) {
          const seenEnd = latestEnd.get(row.cik);
          if (!seenEnd || row.end > seenEnd) {
            latestEnd.set(row.cik, row.end);
            map.set(row.cik, row.val);
          }
        }
      }
      return map;
    });
  }
  return popularityPromise;
}

// SEC's atom feed for browse-edgar has a long-standing bug where company
// names come through as "ARRAY(0x...)" — but the CIK is intact, so we
// cross-reference it against the ticker master file for the real name.
export async function getCompaniesBySic(sicCodes: number[]): Promise<TickerEntry[]> {
  const [{ byCik }, popularity] = await Promise.all([getTickerMaps(), getPopularityMap()]);
  const seen = new Set<number>();
  const companies: TickerEntry[] = [];

  for (const sic of sicCodes) {
    const res = await secFetch(
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&SIC=${sic}&type=10-K&dateb=&owner=include&count=100&output=atom`,
    );
    const xml = await res.text();
    const ciks = [...xml.matchAll(/<cik>(\d+)<\/cik>/g)].map((m) => Number(m[1]));

    for (const cik of ciks) {
      if (seen.has(cik)) continue;
      seen.add(cik);
      const entry = byCik.get(cik);
      if (entry) companies.push(entry);
    }
  }

  companies.sort((a, b) => (popularity.get(b.cik) ?? 0) - (popularity.get(a.cik) ?? 0));

  return companies.slice(0, 40);
}
