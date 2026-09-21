// Research Signals: a watchlist of tickers surfaced by different kinds of
// evidence, each with a sourced reason. Research leads, never buy
// recommendations — the UI says so, and every card carries its sources.

export type SignalCategory = "political" | "legislation" | "geopolitics" | "financial";

export type SignalSource = { label: string; url: string };

export type PoliticalTrade = {
  ticker: string;
  member: string; // "Hon. Byron Donalds"
  chamber: "House" | "Senate";
  district: string; // "FL19"
  owner: "self" | "spouse" | "joint" | "child";
  type: "buy" | "sell" | "exchange";
  partial: boolean;
  tradeDate: string; // YYYY-MM-DD
  disclosureDate: string; // YYYY-MM-DD (the filing date)
  lagDays: number;
  amountRange: string; // as filed, e.g. "$1,001 - $15,000"
  amended: boolean; // a corrected re-filing of an earlier report
  filingId: string;
  filingUrl: string;
};

export type Signal = {
  id: string;
  category: SignalCategory;
  ticker: string;
  company: string;
  title?: string; // short headline (AI categories)
  eventDate: string; // date of the underlying event
  reasoning: string;
  bullCase: string;
  risk: string;
  sources: SignalSource[];
  // Category-specific detail; only political trades for now.
  trades?: PoliticalTrade[];
};

export type SignalBatch = {
  category: SignalCategory;
  generatedAt: string;
  windowDays: number;
  items: Signal[];
  stats: Record<string, number | string>;
};
