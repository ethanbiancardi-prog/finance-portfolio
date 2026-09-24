// Per-user paper portfolios (supabase/migrations/0002_paper_portfolios.sql).
//
// Only the starting cash and the trade list are stored. Everything shown on
// the dashboard is rebuilt from those two plus market prices, so cash,
// positions and the equity curve can never drift out of agreement.

import { getDailyBars, getLatestPrices, type DailyBar } from "./marketdata";

export const BENCHMARK = "SPY";

export type PaperAccountRow = { user_id: string; starting_cash: string | number; created_at: string };

export type PaperTradeRow = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  qty: string | number;
  price: string | number;
  executed_at: string;
};

export type Position = {
  symbol: string;
  qty: number;
  avgCost: number;
  price: number;
  marketValue: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
};

// One point per trading day. `spy` is what the same starting cash would be
// worth had it all gone into SPY on the day the account opened.
// `label` marks the two special points ("opened", "now") so the chart can
// name them instead of repeating a date.
export type HistoryPoint = { date: string; equity: number; spy: number; label?: "opened" | "now" };

export type PortfolioSummary = {
  openedAt: string;
  startingCash: number;
  cash: number;
  equity: number;
  spyEquity: number;
  positions: Position[];
  history: HistoryPoint[];
  trades: Trade[];
  pricesAsOf: string | null;
};

export type Trade = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  executedAt: string;
};

// Trading days are New York days. A trade at 11pm UTC is still "today" in
// New York, and daily bars are stamped in New York time too.
const nyDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

type Holding = { qty: number; cost: number };

// Replay trades in order. Average-cost basis: a sell removes shares at the
// position's average cost, so the remaining shares keep the same average.
function replay(trades: PaperTradeRow[], startingCash: number) {
  let cash = startingCash;
  const holdings = new Map<string, Holding>();
  for (const t of trades) {
    const qty = Number(t.qty);
    const price = Number(t.price);
    const h = holdings.get(t.symbol) ?? { qty: 0, cost: 0 };
    if (t.side === "buy") {
      cash -= qty * price;
      h.qty += qty;
      h.cost += qty * price;
    } else {
      cash += qty * price;
      const avg = h.qty > 0 ? h.cost / h.qty : 0;
      h.qty -= qty;
      h.cost -= qty * avg;
    }
    if (h.qty > 1e-9) holdings.set(t.symbol, h);
    else holdings.delete(t.symbol);
  }
  return { cash, holdings };
}

// Last close on or before `date`, carried forward over days a symbol had no
// bar (the free IEX feed occasionally skips thin tickers).
function closeOn(bars: DailyBar[] | undefined, date: string): number | null {
  if (!bars) return null;
  let close: number | null = null;
  for (const b of bars) {
    if (b.t.slice(0, 10) > date) break;
    close = b.c;
  }
  return close;
}

export async function buildPortfolio(
  account: PaperAccountRow,
  trades: PaperTradeRow[],
): Promise<PortfolioSummary> {
  const startingCash = Number(account.starting_cash);
  const openedOn = nyDate(account.created_at);
  const today = nyDate(new Date());
  const sorted = [...trades].sort((a, b) => a.executed_at.localeCompare(b.executed_at));

  const symbols = [...new Set([BENCHMARK, ...sorted.map((t) => t.symbol)])];
  const daysOpen = Math.ceil((Date.now() - new Date(account.created_at).getTime()) / 86_400_000);
  const [bars, latest] = await Promise.all([
    getDailyBars(symbols, daysOpen + 5),
    getLatestPrices(symbols),
  ]);

  const spyBars = bars.get(BENCHMARK) ?? [];
  // SPY's last close before the account opened is the baseline both lines
  // start from, so on day one they sit on top of each other at $100,000.
  const spyBase =
    [...spyBars].reverse().find((b) => b.t.slice(0, 10) < openedOn)?.c ?? spyBars[0]?.c ?? null;
  const spyValue = (price: number | null) =>
    spyBase && price ? (startingCash * price) / spyBase : startingCash;

  function equityOn(date: string, priceOf: (symbol: string, fallback: number) => number) {
    const { cash, holdings } = replay(
      sorted.filter((t) => nyDate(t.executed_at) <= date),
      startingCash,
    );
    let value = cash;
    for (const [symbol, h] of holdings) value += h.qty * priceOf(symbol, h.cost / h.qty);
    return value;
  }

  const history: HistoryPoint[] = [
    { date: openedOn, equity: startingCash, spy: startingCash, label: "opened" },
  ];

  // Completed trading days from the opening day on. Today's bar is still
  // forming, so today is represented by the live point below instead.
  for (const bar of spyBars) {
    const date = bar.t.slice(0, 10);
    if (date < openedOn || date >= today) continue;
    history.push({
      date,
      equity: equityOn(date, (s, fallback) => closeOn(bars.get(s), date) ?? fallback),
      spy: spyValue(bar.c),
    });
  }

  // Live values from the latest trades.
  const liveOf = (s: string, fallback: number) =>
    latest.get(s)?.price ?? closeOn(bars.get(s), today) ?? fallback;
  const { cash, holdings } = replay(sorted, startingCash);
  const positions: Position[] = [...holdings].map(([symbol, h]) => {
    const avgCost = h.cost / h.qty;
    const price = liveOf(symbol, avgCost);
    const marketValue = h.qty * price;
    return {
      symbol,
      qty: h.qty,
      avgCost,
      price,
      marketValue,
      unrealizedPl: marketValue - h.cost,
      unrealizedPlPct: h.cost ? (marketValue - h.cost) / h.cost : 0,
    };
  });
  const equity = cash + positions.reduce((sum, p) => sum + p.marketValue, 0);
  const spyLive = latest.get(BENCHMARK);
  const spyEquity = spyValue(spyLive?.price ?? closeOn(spyBars, today));

  // Add a "now" point unless the latest prices are already plotted (on a
  // weekend the latest trade is Friday's close, which the loop above drew).
  // A brand-new account always gets one, so its chart has two ends.
  const lastClosed = history.length > 1 ? history[history.length - 1].date : null;
  const liveDate = spyLive ? nyDate(spyLive.asOf) : today;
  if (!lastClosed || liveDate > lastClosed) {
    history.push({ date: liveDate, equity, spy: spyEquity, label: "now" });
  } else {
    // Keep the last point consistent with the headline numbers.
    history[history.length - 1] = { ...history[history.length - 1], equity, spy: spyEquity };
  }

  return {
    openedAt: account.created_at,
    startingCash,
    cash,
    equity,
    spyEquity,
    positions: positions.sort((a, b) => b.marketValue - a.marketValue),
    history,
    // Newest first, for the dashboard's trade list.
    trades: [...sorted].reverse().map((t) => ({
      id: t.id,
      symbol: t.symbol,
      side: t.side,
      qty: Number(t.qty),
      price: Number(t.price),
      executedAt: t.executed_at,
    })),
    pricesAsOf: spyLive?.asOf ?? null,
  };
}
