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
  party?: string; // "Republican" / "Democrat"
  committees?: string[]; // full House committees the member sits on
  owner: "self" | "spouse" | "joint" | "child";
  type: "buy" | "sell" | "exchange";
  partial: boolean;
  tradeDate: string; // YYYY-MM-DD
  disclosureDate: string; // YYYY-MM-DD (the filing date)
  lagDays: number;
  amountRange: string; // as filed, e.g. "$1,001 - $15,000"
  amended: boolean; // a corrected re-filing of an earlier report
  sincePct?: number | null; // price change from the trade date to the latest close
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
  // Political trades: committees whose jurisdiction plausibly covers the
  // company's sector, with the members who sit on them.
  oversight?: { committee: string; members: string[] }[];
  // Political trades: price change since the most recent trade, and a
  // conviction score — repeated buying by several members over the window
  // is the actual signal in late-disclosed data; a single trade isn't.
  sinceTrade?: { pct: number; from: string; asOf: string } | null;
  conviction?: { score: number; label: string };
};

export type SignalBatch = {
  category: SignalCategory;
  generatedAt: string;
  windowDays: number;
  items: Signal[];
  stats: Record<string, number | string>;
};

// --- Presidential trades (aggregated, not per-signal) ------------------------
export type PresidentialAggregate = {
  ticker: string;
  company: string;
  transactions: number;
  buys: number;
  sells: number;
  netMid: number; // sum of buy midpoints − sum of sale midpoints
  grossBuyMid: number;
  grossSellMid: number;
  netLow: number; // net of the disclosed range bounds
  netHigh: number;
  firstTradeDate: string;
  lastTradeDate: string;
  sinceTrade?: { pct: number; from: string; asOf: string } | null;
  sources: SignalSource[];
};

export type PresidentialBatch = {
  generatedAt: string;
  official: string;
  filingDate: string;
  filingUrls: string[];
  firstTradeDate: string;
  lastTradeDate: string;
  lagDays: number; // filing date − last trade date
  netPurchases: PresidentialAggregate[];
  netSales: PresidentialAggregate[];
  stats: Record<string, number | string>;
  credit: SignalSource;
};
