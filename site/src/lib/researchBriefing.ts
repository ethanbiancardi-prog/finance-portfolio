// One briefing, shared by every AI feature on the research page: the 10-K
// ratio dashboard, the latest price, and recent headlines, rendered as
// plain text the model can cite. Anything we can't fetch is labelled "not
// available" so the model says so instead of inventing a figure.
import { computeRatios, getCompanyFactSeries, getCompanyFacts, resolveTicker, type RatioDashboard, type TickerEntry } from "@/lib/edgar";
import { getQuote, type Quote } from "@/lib/marketdata";
import { getNews, type NewsItem } from "@/lib/news";
import { formatCurrencyCompact, formatPercent, formatRatio } from "@/lib/format";

export type Briefing = {
  text: string;
  company: TickerEntry | null;
  dashboard: RatioDashboard | null;
  quote: Quote | null;
  news: NewsItem[] | null;
  basedOn: { priceAsOf: string | null; fiscalYearEnd: string | null; headlines: number };
};

function fundamentalsBlock(dashboard: RatioDashboard | null) {
  if (!dashboard) return "Annual financials: not available (no SEC filing found).";
  const lines = [
    `Fiscal year end: ${dashboard.periodEnd ?? "not available"} (prior: ${dashboard.priorPeriodEnd ?? "n/a"})`,
    `Revenue: ${formatCurrencyCompact(dashboard.revenue)} (prior ${formatCurrencyCompact(dashboard.revenuePrior)}, growth ${formatPercent(dashboard.revenueGrowth)})`,
    `Net income: ${formatCurrencyCompact(dashboard.netIncome)}`,
  ];
  for (const r of dashboard.ratios) {
    const fmt = (v: number | null) =>
      r.format === "%" ? formatPercent(v) : r.format === "$" ? formatCurrencyCompact(v) : formatRatio(v);
    lines.push(`${r.label} (${r.group}): ${fmt(r.value)} (prior ${fmt(r.prior)})`);
  }
  return `Annual financials from the latest 10-K:\n${lines.join("\n")}`;
}

// Price alone can't say whether a stock is cheap; with the share count from
// the 10-K cover page we can hand the model market cap and a trailing P/E.
function quoteBlock(quote: Quote | null, shares: number | null, netIncome: number | null) {
  if (!quote) return "Current price: not available.";
  const change =
    quote.change == null
      ? ""
      : ` (${quote.change >= 0 ? "+" : ""}${quote.change.toFixed(2)}, ${formatPercent(quote.changePercent)} vs. prior close)`;
  const lines = [`Current price: $${quote.price.toFixed(2)}${change}, as of ${quote.asOf}`];
  if (shares) {
    const marketCap = quote.price * shares;
    lines.push(`Market cap: ${formatCurrencyCompact(marketCap)} (${formatCurrencyCompact(shares)} shares outstanding)`);
    if (netIncome && netIncome > 0) lines.push(`Trailing P/E: ${(marketCap / netIncome).toFixed(1)}x (market cap ÷ last fiscal year's net income)`);
    else if (netIncome != null) lines.push("Trailing P/E: not meaningful (net loss last fiscal year)");
  }
  return lines.join("\n");
}

function newsBlock(items: NewsItem[] | null) {
  if (!items || items.length === 0) return "Recent headlines: not available.";
  const lines = items.map((n) => `- [${n.publishedAt.slice(0, 10)}] ${n.headline}${n.summary ? ` — ${n.summary.slice(0, 200)}` : ""}`);
  return `Recent headlines (newest first):\n${lines.join("\n")}`;
}

// Each source can fail independently (EDGAR is down, the market is closed
// and IEX has no trade yet, both news feeds time out) without blocking the
// caller — a model working from partial data is still more useful than
// nothing, as long as the gaps are labelled.
export async function buildBriefing(ticker: string, headlineCount = 10): Promise<Briefing> {
  const [factsResult, quoteResult, newsResult] = await Promise.allSettled([
    resolveTicker(ticker).then(async (company) => {
      if (!company) return null;
      const facts = await getCompanyFacts(company.cik);
      const shares = getCompanyFactSeries(facts).deiSeries("EntityCommonStockSharesOutstanding")[0]?.val ?? null;
      return { company, dashboard: computeRatios(facts), shares };
    }),
    getQuote(ticker),
    getNews(ticker, headlineCount),
  ]);

  const facts = factsResult.status === "fulfilled" ? factsResult.value : null;
  const quote = quoteResult.status === "fulfilled" ? quoteResult.value : null;
  const news = newsResult.status === "fulfilled" ? newsResult.value.items : null;
  const dashboard = facts?.dashboard ?? null;

  const text = [
    `Ticker: ${ticker}${facts ? ` — ${facts.company.title}` : ""}`,
    `Today's date: ${new Date().toISOString().slice(0, 10)}`,
    quoteBlock(quote, facts?.shares ?? null, dashboard?.netIncome ?? null),
    fundamentalsBlock(dashboard),
    newsBlock(news),
  ].join("\n\n");

  return {
    text,
    company: facts?.company ?? null,
    dashboard,
    quote,
    news,
    basedOn: {
      priceAsOf: quote?.asOf ?? null,
      fiscalYearEnd: dashboard?.periodEnd ?? null,
      headlines: news?.length ?? 0,
    },
  };
}
