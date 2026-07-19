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

export type Ratio = { label: string; group: string; value: number | null; prior: number | null };

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

  function val(points: FactPoint[], i: number): number | null {
    return points[i]?.val ?? null;
  }

  const assets = series("Assets");
  const assetsCurrent = series("AssetsCurrent");
  const liabilities = series("Liabilities");
  const liabilitiesCurrent = series("LiabilitiesCurrent");
  const equity = series("StockholdersEquity");
  const netIncome = series("NetIncomeLoss");
  const revenueTag = series("RevenueFromContractWithCustomerExcludingAssessedTax");
  const revenue = revenueTag.length ? revenueTag : series("Revenues");

  const revenueNow = val(revenue, 0);
  const revenuePrior = val(revenue, 1);

  return {
    periodEnd: assets[0]?.end ?? null,
    priorPeriodEnd: assets[1]?.end ?? null,
    revenue: revenueNow,
    revenuePrior,
    revenueGrowth: safeDiv(
      revenueNow != null && revenuePrior != null ? revenueNow - revenuePrior : null,
      revenuePrior,
    ),
    netIncome: val(netIncome, 0),
    ratios: [
      {
        label: "Current Ratio",
        group: "Liquidity",
        // Current assets / current liabilities — can short-term assets cover
        // short-term obligations? Above 1 means yes.
        value: safeDiv(val(assetsCurrent, 0), val(liabilitiesCurrent, 0)),
        prior: safeDiv(val(assetsCurrent, 1), val(liabilitiesCurrent, 1)),
      },
      {
        label: "Debt-to-Equity",
        group: "Leverage",
        // Total liabilities / equity — how much the company relies on debt
        // vs. owner capital. Higher means more leveraged, more risk.
        value: safeDiv(val(liabilities, 0), val(equity, 0)),
        prior: safeDiv(val(liabilities, 1), val(equity, 1)),
      },
      {
        label: "Net Margin",
        group: "Profitability",
        // Net income / revenue — how much of each revenue dollar becomes profit.
        value: safeDiv(val(netIncome, 0), revenueNow),
        prior: safeDiv(val(netIncome, 1), revenuePrior),
      },
      {
        label: "Asset Turnover",
        group: "Efficiency",
        // Revenue / assets — how efficiently assets are put to work generating sales.
        value: safeDiv(revenueNow, val(assets, 0)),
        prior: safeDiv(revenuePrior, val(assets, 1)),
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

// SEC's atom feed for browse-edgar has a long-standing bug where company
// names come through as "ARRAY(0x...)" — but the CIK is intact, so we
// cross-reference it against the ticker master file for the real name.
export async function getCompaniesBySic(sicCodes: number[]): Promise<TickerEntry[]> {
  const { byCik } = await getTickerMaps();
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

  return companies.slice(0, 40);
}
