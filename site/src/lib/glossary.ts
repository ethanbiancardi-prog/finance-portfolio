import { NOTES } from "@/app/quant-notes/notes";

// Hover definitions for finance terms used as labels around the site. Where
// a Quant Note covers the term, the definition is the note's own one-line
// body and the entry links to the full note — so the tooltip and the note
// never say different things. Terms without a note get a short definition
// written here.
export type GlossaryEntry = { term: string; definition: string; noteSlug?: string };

function fromNote(slug: string, term: string, definition?: string): GlossaryEntry {
  const note = NOTES.find((n) => n.slug === slug);
  if (!note) throw new Error(`glossary: no quant note with slug "${slug}"`);
  return { term, definition: definition ?? note.body, noteSlug: slug };
}

export const GLOSSARY = {
  sharpe: fromNote("sharpe-ratio", "Sharpe ratio"),
  drawdown: fromNote("max-drawdown", "Max drawdown"),
  beta: fromNote(
    "beta-capm",
    "Beta vs SPY",
    "How much the account tends to move for every 1% move in the S&P 500 (SPY). Beta of 1 means it swings with the market; 0.5 means half as much; near 0 means its moves aren't tied to the market at all.",
  ),
  volatility: fromNote(
    "sharpe-ratio",
    "Volatility (annualized)",
    "How much the account's daily returns bounce around, scaled to a yearly figure. 15% means a typical year sees swings of roughly that size; higher means a rougher ride. It's the risk measure Sharpe divides by.",
  ),
  momentum: fromNote("momentum", "Momentum score"),
  equity: {
    term: "Equity",
    definition:
      "Total account value right now: cash plus the current market value of every open position. This is the number the equity curve tracks.",
  },
  buyingPower: {
    term: "Buying power",
    definition:
      "How much you can spend on new positions right now. It can be larger than your cash because a margin account lets you borrow against the value of what you already hold.",
  },
  pnl: {
    term: "P&L",
    definition:
      "Profit and loss on an open position: current value minus what you paid. Unrealized until you sell — it can still change.",
  },
  avgEntry: {
    term: "Average entry",
    definition:
      "The average price paid per share across every buy that built this position. Compare it to the current price to see whether the position is up or down.",
  },
  // Factor risk attribution
  factorRegression: {
    term: "Factor model",
    definition:
      "A multiple linear regression: each asset's return = alpha + (beta₁ × factor₁) + (beta₂ × factor₂) + … + noise. The betas say how much the asset moves per unit move in each factor; the portfolio's betas are just the weighted average of its holdings' betas. Portfolio variance then splits into the part the factors explain and the part they don't.",
  },
  alpha: {
    term: "Alpha",
    definition:
      "Expected return left over after the factors have been paid for: the regression's intercept. Positive alpha means the portfolio is expected to earn more than its factor exposures alone would justify. In this sandbox alpha comes from assumed asset-class figures, not from live data.",
  },
  systemicBeta: {
    term: "Systemic beta",
    definition:
      "The portfolio's loading on the equity market factor: how much it tends to move for every 1% move in global stocks. Equities sit near 1, bonds near 0, commodities a little above 0. It is the exposure that diversification across stocks cannot remove.",
  },
  rSquared: {
    term: "R-squared",
    definition:
      "The share of the portfolio's variance the factors explain, from 0 to 1. 0.90 means 90% of the wiggle is the three macro factors and 10% is asset-specific noise. High R² is normal for a diversified multi-asset book; it means the risk is structural, not stock-picking.",
  },
  // Options
  impliedVol: {
    term: "Implied volatility",
    definition:
      "The volatility you have to plug into the Black-Scholes formula to reproduce an option's market price. It is the market's forecast of how much the stock will move, expressed as an annualised percentage. Higher IV = pricier options.",
  },
  volSkew: {
    term: "Volatility skew",
    definition:
      "Implied volatility is not flat across strikes: low strikes (puts that protect against a crash) trade at higher IV than high strikes. The slope of that line is the skew. It has been persistently negative for index options since the 1987 crash.",
  },
  moneyness: {
    term: "Moneyness",
    definition:
      "Where the strike sits relative to the stock price. In-the-money (ITM) options already have exercise value; at-the-money (ATM) strikes equal the spot price; out-of-the-money (OTM) options are all time value. A call is ITM below spot; a put is ITM above it.",
  },
} satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
