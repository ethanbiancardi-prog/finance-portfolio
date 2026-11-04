// The Bentley Investment Group Sustainability Fund's holdings, grouped by the
// fund's own sub-sector labels (bentleyinvestmentgroup.org/sustainability,
// as of Sep 2026). The ticker list itself lives in lib/sectors.ts
// (SECTORS.sustainability) so the research page, the trading bots and the
// /sustainability page all read one list; this file only adds the grouping.
import { SECTORS } from "./sectors";

export const FUND_NAME = "BIG Sustainability Fund";
export const FUND_URL = "https://bentleyinvestmentgroup.org/sustainability";

const THEME_OF: Record<string, string> = {
  GOOGL: "Interactive media",
  META: "Interactive media",
  AMAT: "Semis & tech hardware",
  KEYS: "Semis & tech hardware",
  AXP: "Financial services",
  V: "Financial services",
  CI: "Healthcare services",
  ENSG: "Healthcare services",
  DGX: "Healthcare services",
  LLY: "Pharma & biotech",
  GILD: "Pharma & biotech",
  KO: "Consumer staples",
  PG: "Consumer staples",
  DOV: "Machinery",
  DUK: "Electric utilities",
  RSG: "Waste & recycling",
  RGLD: "Metals & mining",
  SPG: "Retail REITs",
};

export const FUND_TICKERS: readonly string[] = SECTORS.sustainability.tickers;

// Holdings in sectors.ts order, each with its sub-sector. A ticker added to
// sectors.ts but not labelled above shows as "Other" instead of vanishing.
export const FUND_HOLDINGS = FUND_TICKERS.map((ticker) => ({ ticker, theme: THEME_OF[ticker] ?? "Other" }));
