// Bull/Bear Meter for one stock: a 0-100 reading of how bullish or bearish
// the evidence on the research page leans. 0 = strongly bearish, 50 =
// neutral, 100 = strongly bullish. It summarises what the page found; it
// doesn't predict the price and is never a reason to buy or sell.
//
// Each reading becomes a score from -1 (bearish) to +1 (bullish), usually by
// dividing by a "full-scale" amount and capping at ±1. The meter is
// 50 + 50 × the average of the readings that are available. Readings that
// haven't loaded, or don't apply, are left out rather than guessed, so the
// meter moves as the page fills in (and again if you run the red-flag scan).

// Free inputs from /api/research/meter.
export type MeterMarketInputs = {
  ticker: string;
  trendGap: number | null; // last close ÷ 200-day average − 1
  momentum: number | null; // ~3-month price change
  priceAsOf: string | null;
  congress: { buys: number; sells: number; windowDays: number; asOf: string } | null;
};

export type MeterInputs = {
  market: MeterMarketInputs | null; // null while loading
  ratios: { good: number; bad: number; rated: number } | null; // the 10-K ratio flags
  revenueGrowth: number | null;
  periodEnd: string | null;
  health: "strong" | "solid" | "mixed" | "weak" | null; // playbook verdict
  catalysts: { positive: number; negative: number; mixed: number } | null; // playbook news catalysts
  playbookAsOf: string | null;
  redFlags: number | null; // null until the scan is run
};

export type MeterReading = {
  key: string;
  label: string;
  value: string;
  why: string;
  score: number | null; // -1..+1, null = not available / not loaded
  pending?: boolean; // still loading, as opposed to not available
  source: string;
};

const clamp = (x: number) => Math.max(-1, Math.min(1, x));
const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

export function scoreStock(i: MeterInputs): { score: number | null; label: string; readings: MeterReading[] } {
  const m = i.market;
  const readings: MeterReading[] = [];

  // 1. Trend — price vs. its 200-day average. 15% above is full-scale bullish
  // (wider than the 10% used for SPY, since single stocks swing more).
  readings.push(
    m?.trendGap != null
      ? {
          key: "trend",
          label: "Price trend",
          value: pct(m.trendGap),
          why: `Price is ${m.trendGap >= 0 ? "above" : "below"} its 200-day average.`,
          score: clamp(m.trendGap / 0.15),
          source: `Alpaca daily prices, ${m.priceAsOf}`,
        }
      : { key: "trend", label: "Price trend", value: m ? "not available" : "loading", why: "Price vs. its 200-day average.", score: null, pending: !m, source: "Alpaca daily prices" },
  );

  // 2. Momentum — 3-month price change. ±20% is full-scale.
  readings.push(
    m?.momentum != null
      ? {
          key: "momentum",
          label: "Momentum",
          value: pct(m.momentum),
          why: "Price change over the last 3 months.",
          score: clamp(m.momentum / 0.2),
          source: `Alpaca daily prices, ${m.priceAsOf}`,
        }
      : { key: "momentum", label: "Momentum", value: m ? "not available" : "loading", why: "Price change over the last 3 months.", score: null, pending: !m, source: "Alpaca daily prices" },
  );

  // 3. Fundamentals — the 10-K ratio flags: (good − bad) ÷ ratios rated.
  const r = i.ratios;
  readings.push(
    r && r.rated > 0
      ? {
          key: "ratios",
          label: "Financial ratios",
          value: `${r.good} good · ${r.bad} bad`,
          why: `Of ${r.rated} ratios rated in the Fundamentals section.`,
          score: clamp((r.good - r.bad) / r.rated),
          source: `SEC 10-K / TTM figures${i.periodEnd ? `, period ending ${i.periodEnd}` : ""}`,
        }
      : { key: "ratios", label: "Financial ratios", value: "not available", why: "The Fundamentals section's ratio flags.", score: null, source: "SEC filings" },
  );

  // 4. Growth — revenue vs. the prior period. ±20% is full-scale.
  readings.push(
    i.revenueGrowth != null
      ? {
          key: "growth",
          label: "Revenue growth",
          value: pct(i.revenueGrowth),
          why: "Revenue vs. the prior period.",
          score: clamp(i.revenueGrowth / 0.2),
          source: `SEC filings${i.periodEnd ? `, period ending ${i.periodEnd}` : ""}`,
        }
      : { key: "growth", label: "Revenue growth", value: "not available", why: "Revenue vs. the prior period.", score: null, source: "SEC filings" },
  );

  // 5. Financial health — the playbook's verdict on the filing.
  const HEALTH_SCORE = { strong: 1, solid: 0.5, mixed: 0, weak: -1 } as const;
  readings.push(
    i.health
      ? {
          key: "health",
          label: "Financial health",
          value: i.health,
          why: "AI verdict in “What's happening”, from the filing's numbers.",
          score: HEALTH_SCORE[i.health],
          source: `AI playbook, ${i.playbookAsOf}`,
        }
      : { key: "health", label: "Financial health", value: "loading", why: "AI verdict from the filing's numbers.", score: null, pending: true, source: "AI playbook" },
  );

  // 6. News — the playbook's catalysts: (positive − negative) ÷ all of them.
  const c = i.catalysts;
  const total = c ? c.positive + c.negative + c.mixed : 0;
  readings.push(
    c && total > 0
      ? {
          key: "news",
          label: "News catalysts",
          value: `${c.positive} positive · ${c.negative} negative`,
          why: `Of ${total} things moving the company in recent headlines.`,
          score: clamp((c.positive - c.negative) / total),
          source: `AI playbook from headlines, ${i.playbookAsOf}`,
        }
      : { key: "news", label: "News catalysts", value: c ? "none found" : "loading", why: "Recent headlines, sorted positive or negative.", score: null, pending: !c, source: "AI playbook" },
  );

  // 7. Red flags — only counts once you run the scan. A clean scan leans
  // mildly bullish; one flag leans bearish, two or more fully bearish.
  readings.push(
    i.redFlags != null
      ? {
          key: "flags",
          label: "Red flags",
          value: i.redFlags === 0 ? "none" : `${i.redFlags} found`,
          why: "Five accounting checks against the 10-K.",
          score: i.redFlags === 0 ? 0.5 : i.redFlags === 1 ? -0.5 : -1,
          source: "AI red-flag scan",
        }
      : { key: "flags", label: "Red flags", value: "not scanned", why: "Run the red-flag scan below to include it.", score: null, source: "AI red-flag scan" },
  );

  // 8. Congress — share of disclosed congressional trades in this stock that
  // were buys. All buys is full-scale bullish. Disclosures run up to 45 days late.
  const g = m?.congress;
  readings.push(
    g
      ? {
          key: "congress",
          label: "Congress trades",
          value: `${g.buys} ${g.buys === 1 ? "buy" : "buys"} · ${g.sells} ${g.sells === 1 ? "sell" : "sells"}`,
          why: `Disclosed trades in the last ${g.windowDays} days.`,
          score: clamp((g.buys / (g.buys + g.sells) - 0.5) * 2),
          source: `House & Senate disclosures, ${g.asOf}`,
        }
      : { key: "congress", label: "Congress trades", value: m ? "none" : "loading", why: "No disclosed trades in this stock recently.", score: null, pending: !m, source: "House & Senate disclosures" },
  );

  const scores = readings.map((x) => x.score).filter((s): s is number => s !== null);
  const score = scores.length ? Math.round(50 + 50 * (scores.reduce((a, b) => a + b, 0) / scores.length)) : null;
  return { score, label: score === null ? "Gathering data" : meterLabel(score), readings };
}

export function meterLabel(score: number): string {
  if (score < 20) return "Strongly bearish";
  if (score < 40) return "Bearish";
  if (score <= 60) return "Neutral";
  if (score <= 80) return "Bullish";
  return "Strongly bullish";
}
