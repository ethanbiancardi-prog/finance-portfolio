// Financial story: companies in the curated universe whose latest 10-K
// tells a story worth reading — margins expanding or compressing, a
// turnaround, a cash machine, leverage moving. Built entirely from the
// ratio engine the research page already uses (computeRatios over SEC's
// company-facts feed); no AI, and every number quoted is in the filing.
//
// Both good and bad stories are leads: "margins collapsing" is as much a
// reason to open the 10-K as "margins expanding".
import { computeRatios, getCompanyFacts, resolveTicker, type RatioDashboard } from "@/lib/edgar";
import { formatCurrencyCompact, formatPercent, formatRatio } from "@/lib/format";
import { getRedis } from "@/lib/kv";
import { SECTOR_KEYS, SECTORS } from "@/lib/sectors";
import type { Signal, SignalBatch } from "./types";

const KEY = "signals:financial";
const MAX_ITEMS = 12;
// A 10-K older than this is stale — the company is about to file a new one.
const MAX_FILING_AGE_DAYS = 400;
// SEC asks for no more than 10 requests/second; a few in flight is plenty.
const CONCURRENCY = 4;

type Story = {
  key: string;
  title: string;
  // Higher = stronger, more surprising story. Used to pick one per company
  // and to order the list.
  score: number;
  reasoning: string;
  bullCase: string;
  risk: string;
};

function ratio(d: RatioDashboard, label: string) {
  const r = d.ratios.find((x) => x.label === label);
  return { now: r?.value ?? null, prior: r?.prior ?? null };
}
const pp = (v: number) => `${(v * 100).toFixed(1)} pts`;

// Every story the dashboard supports, evaluated against one company.
// Banks, brokers and card issuers: operating cash flow is mostly loan and
// deposit movement, so "free cash flow" isn't the signal it is elsewhere.
const FINANCIALS = new Set<string>(SECTORS.financials.tickers);

function findStories(d: RatioDashboard, ticker: string): Story[] {
  const stories: Story[] = [];
  const op = ratio(d, "Operating Margin");
  const net = ratio(d, "Net Margin");
  const gross = ratio(d, "Gross Margin");
  const ocfm = ratio(d, "Operating Cash Flow Margin");
  const fcf = ratio(d, "Free Cash Flow");
  const de = ratio(d, "Debt-to-Equity");
  const cov = ratio(d, "Interest Coverage");
  const cur = ratio(d, "Current Ratio");
  const roic = ratio(d, "ROIC");
  const g = d.revenueGrowth;
  const rev = d.revenue;
  const fcfMargin = fcf.now != null && rev ? fcf.now / rev : null;

  // Margin expansion / compression: operating margin moved >= 3 points.
  if (op.now != null && op.prior != null) {
    const delta = op.now - op.prior;
    if (delta >= 0.03 && op.now > 0) {
      stories.push({
        key: "margin-expansion",
        title: "Operating margin expanding",
        score: 2 + delta * 20,
        reasoning: `Operating margin rose from ${formatPercent(op.prior)} to ${formatPercent(op.now)} (+${pp(delta)}) on revenue of ${formatCurrencyCompact(rev)}${g != null ? ` (${g >= 0 ? "+" : ""}${formatPercent(g)} year over year)` : ""}. Margins expanding faster than revenue means the company is getting more profit out of each dollar of sales, pricing power, cost discipline, or operating leverage from scale${gross.now != null && gross.prior != null ? `; gross margin went ${formatPercent(gross.prior)} → ${formatPercent(gross.now)}, which says whether it came from the product itself or from below the line` : ""}.`,
        bullCase: "If the expansion is structural rather than a one-year cost cut, earnings can grow well ahead of revenue for several years and the market often re-rates the multiple as it notices.",
        risk: "One year of margin gains can come from deferred spending, a favourable input-cost swing, or an accounting change; check the 10-K's MD&A for what management says drove it, and whether the prior year was simply depressed.",
      });
    } else if (delta <= -0.03) {
      stories.push({
        key: "margin-compression",
        title: "Operating margin compressing",
        score: 2 + Math.abs(delta) * 20,
        reasoning: `Operating margin fell from ${formatPercent(op.prior)} to ${formatPercent(op.now)} (${pp(delta)}) on revenue of ${formatCurrencyCompact(rev)}${g != null ? ` (${g >= 0 ? "+" : ""}${formatPercent(g)} year over year)` : ""}. ${g != null && g > 0.05 ? "Revenue is still growing, so the company is spending more to get each sale; the question is whether that's investment or erosion." : "With revenue flat or falling too, this is a business under pressure on both lines."}${gross.now != null && gross.prior != null ? ` Gross margin went ${formatPercent(gross.prior)} → ${formatPercent(gross.now)}.` : ""}`,
        bullCase: "If the compression is deliberate investment (capacity, R&D, a new product line) and management can point to when it pays back, the stock may be cheap on trough margins.",
        risk: "Margin compression that comes from competition or input costs rarely reverses on its own; if the company has no pricing power the decline can continue for years.",
      });
    }
  }

  // Turnaround: net margin crossed from loss to profit.
  if (net.now != null && net.prior != null && net.prior < 0 && net.now > 0) {
    stories.push({
      key: "turnaround",
      title: "Turned profitable",
      score: 3 + net.now * 10,
      reasoning: `Net margin went from ${formatPercent(net.prior)} to ${formatPercent(net.now)}, the company crossed from a loss to a profit on revenue of ${formatCurrencyCompact(rev)}${g != null ? ` (${g >= 0 ? "+" : ""}${formatPercent(g)})` : ""}. Net income of ${formatCurrencyCompact(d.netIncome)}${ocfm.now != null ? `, operating cash flow margin ${formatPercent(ocfm.now)}` : ""}.`,
      bullCase: "The first profitable year is often when a company becomes investable for funds that screen on earnings, and if the loss years were investment, incremental margins from here can be high.",
      risk: "A single profitable year can come from a one-off gain, a tax benefit, or cutting the spending that produced the growth; confirm operating income and cash flow turned as well, not just the net line.",
    });
  }

  // Cash machine: free cash flow above 20% of revenue and rising.
  if (!FINANCIALS.has(ticker) && fcfMargin != null && fcfMargin >= 0.2 && fcf.now != null && fcf.prior != null && fcf.now > fcf.prior) {
    stories.push({
      key: "cash-machine",
      title: "Cash generation stands out",
      score: 1.5 + fcfMargin * 5,
      reasoning: `Free cash flow of ${formatCurrencyCompact(fcf.now)} is ${formatPercent(fcfMargin)} of revenue (${formatCurrencyCompact(rev)}), up from ${formatCurrencyCompact(fcf.prior)} the year before${ocfm.now != null ? `; operating cash flow margin ${formatPercent(ocfm.now)}` : ""}${roic.now != null ? `, ROIC ${formatPercent(roic.now)}` : ""}. Few businesses convert a fifth of every sales dollar into cash left over after investment.`,
      bullCase: "Cash at this rate funds buybacks, dividends, and acquisitions without debt, and gives the company a wide margin of safety if growth slows.",
      risk: "Very high free cash flow can mean under-investment, check whether capex is falling as a share of revenue, and whether the cash is actually being returned or piling up.",
    });
  }

  // Deleveraging / releveraging.
  if (de.now != null && de.prior != null && de.prior > 0.5) {
    const rel = (de.now - de.prior) / de.prior;
    if (rel <= -0.25) {
      stories.push({
        key: "deleveraging",
        title: "Paying down debt",
        score: 1.5 + Math.abs(rel) * 2,
        reasoning: `Debt-to-equity fell from ${formatRatio(de.prior)}x to ${formatRatio(de.now)}x (${formatPercent(rel)})${cov.now != null && cov.prior != null ? `, and interest coverage moved from ${formatRatio(cov.prior)}x to ${formatRatio(cov.now)}x` : ""}. Balance-sheet repair on this scale usually shows up in the equity before it shows up in earnings, because less of each dollar of operating profit goes to lenders.`,
        bullCase: "As leverage falls the equity's share of enterprise value rises mechanically, and credit-rating upgrades lower the cost of the remaining debt.",
        risk: "Debt can fall because the company shrank, sold assets, or issued equity, each of which dilutes the story; check the cash flow statement for what actually paid it down.",
      });
    } else if (rel >= 0.4 && cov.now != null && cov.prior != null && cov.now < cov.prior) {
      stories.push({
        key: "releveraging",
        title: "Leverage rising, coverage falling",
        score: 2 + rel,
        reasoning: `Debt-to-equity rose from ${formatRatio(de.prior)}x to ${formatRatio(de.now)}x (+${formatPercent(rel)}) while interest coverage fell from ${formatRatio(cov.prior)}x to ${formatRatio(cov.now)}x. More borrowing and less profit to service it is the combination lenders watch most closely.`,
        bullCase: "If the debt funded an acquisition or expansion with a clear payback, coverage recovers as the new assets produce earnings; the 10-K will say what it was for.",
        risk: "Rising leverage into falling coverage is how covenant pressure and dilutive equity raises start; a downturn hits levered companies first and hardest.",
      });
    }
  }

  // Fortress: strong balance sheet plus high returns.
  if (cur.now != null && cur.now >= 2 && de.now != null && de.now <= 0.3 && roic.now != null && roic.now >= 0.15 && g != null && g > 0.05) {
    stories.push({
      key: "fortress",
      title: "Fortress balance sheet with high returns",
      score: 1 + roic.now * 3,
      reasoning: `Current ratio ${formatRatio(cur.now)}x, debt-to-equity ${formatRatio(de.now)}x, and ROIC of ${formatPercent(roic.now)} on revenue growth of ${formatPercent(g)}. High returns on capital with almost no leverage is the profile of a business that can fund its own growth and survive a bad cycle without help.`,
      bullCase: "Companies like this compound quietly: reinvestment at high returns plus no interest burden means earnings growth tracks revenue growth or better.",
      risk: "Quality is rarely a secret, the risk is paying too much for it; the same profile has often traded at multiples that assume the returns last forever.",
    });
  }

  // Revenue accelerating hard.
  if (g != null && g >= 0.3 && rev != null && rev > 1e9) {
    stories.push({
      key: "hypergrowth",
      title: "Revenue growing fast",
      score: 1 + g * 3,
      reasoning: `Revenue grew ${formatPercent(g)} to ${formatCurrencyCompact(rev)}${op.now != null ? ` with an operating margin of ${formatPercent(op.now)}${op.prior != null ? ` (${formatPercent(op.prior)} the year before)` : ""}` : ""}. Growth at this rate on a base over a billion dollars is rare and is usually the whole story for the stock.`,
      bullCase: "If the market the company sells into is still early, a year of 30%+ growth is often followed by more; operating leverage at this scale can make earnings grow even faster.",
      risk: "Growth rates fall as bases get bigger, and the valuation almost certainly assumes several more years of it; a single deceleration quarter can cut the stock sharply.",
    });
  }

  return stories;
}

export async function refreshFinancialSignals(now = new Date()): Promise<SignalBatch> {
  const universe = [...new Set(SECTOR_KEYS.flatMap((k) => [...SECTORS[k].tickers]))];
  const staleBefore = new Date(now.getTime() - MAX_FILING_AGE_DAYS * 86_400_000).toISOString().slice(0, 10);

  const candidates: { signal: Signal; secondary: Story[] }[] = [];
  let failed = 0;
  let stale = 0;
  let quiet = 0;

  for (let i = 0; i < universe.length; i += CONCURRENCY) {
    const chunk = universe.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(async (ticker) => {
        const company = await resolveTicker(ticker);
        if (!company) throw new Error(`${ticker}: not an SEC filer`);
        const dashboard = computeRatios(await getCompanyFacts(company.cik));
        return { company, dashboard };
      }),
    );
    for (const r of results) {
      if (r.status === "rejected") {
        failed++;
        continue;
      }
      const { company, dashboard } = r.value;
      if (!dashboard.periodEnd || dashboard.periodEnd < staleBefore) {
        stale++;
        continue;
      }
      const stories = findStories(dashboard, company.ticker).sort((a, b) => b.score - a.score);
      if (stories.length === 0) {
        quiet++;
        continue;
      }
      const [lead, ...rest] = stories;
      const also = rest.length ? ` Also: ${rest.map((s) => s.title.toLowerCase()).join("; ")}.` : "";
      candidates.push({
        secondary: rest,
        signal: {
          id: `financial-${company.ticker}-${dashboard.periodEnd}`,
          category: "financial",
          ticker: company.ticker,
          company: company.title,
          title: lead.title,
          eventDate: dashboard.periodEnd,
          reasoning: `${lead.reasoning}${also} All figures are from the 10-K for the fiscal year ending ${dashboard.periodEnd}, compared with the year before.`,
          bullCase: lead.bullCase,
          risk: lead.risk,
          sources: [
            {
              label: `SEC EDGAR, ${company.title} 10-K filings`,
              url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${String(company.cik).padStart(10, "0")}&type=10-K&dateb=&owner=include&count=10`,
            },
            {
              label: "SEC company-facts data (the numbers behind the ratios)",
              url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(company.cik).padStart(10, "0")}.json`,
            },
          ],
          trades: undefined,
          score: lead.score,
        } as Signal & { score: number },
      });
    }
  }

  const items = candidates
    .sort((a, b) => (b.signal as Signal & { score: number }).score - (a.signal as Signal & { score: number }).score)
    .slice(0, MAX_ITEMS)
    .map(({ signal }) => {
      const { score: _score, ...rest } = signal as Signal & { score: number };
      void _score;
      return rest;
    });

  const batch: SignalBatch = {
    category: "financial",
    generatedAt: now.toISOString(),
    windowDays: MAX_FILING_AGE_DAYS,
    items,
    stats: { companiesScreened: universe.length, withStory: candidates.length, quiet, staleFilings: stale, failed, kept: items.length },
  };
  await getRedis().set(KEY, batch);
  return batch;
}

export async function getFinancialSignals(): Promise<SignalBatch | null> {
  return (await getRedis().get<SignalBatch>(KEY)) ?? null;
}
