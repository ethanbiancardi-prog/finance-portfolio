// The Signal Trader's rules (lib/signalTrader.ts), in their own file so the
// /paper-trading page can show them without importing any server code.

export const RULES = {
  entryScore: 4, // signal score needed to buy
  holdScore: 2, // below this, a holding has lost its signal and is sold
  maxPositions: 10,
  maxPerSector: 2, // no new buy once 2 holdings share its sector (Nov 2026 backtest)
  positionWeight: 0.09, // of account value per new position; ~10% stays cash
  stopLoss: 0.08, // sell at 8% below average cost
  // No trailing stop since Nov 2026: in a backtest of 576 rule combinations
  // (price-only, picked on 2017-21, checked on 2022-26) dropping it tied in
  // 2017-21 and clearly helped in 2022-26, so winners now run until the
  // trend breaks or the score fades.
  minPrice: 5,
  cooldownDays: 14, // no re-buying a name within two weeks of selling it
  swapMargin: 3, // portfolio full: a candidate this many points above the weakest holding replaces it
  maxSwapsPerRun: 1,
  swapMinHoldDays: 5, // a holding can't be swapped out in its first 5 days
  maxQuoteAgeMinutes: 20, // IEX lags the tape; older than this isn't a price
} as const;

export type SignalOrder = { symbol: string; side: "buy" | "sell"; qty: number; price: number; reason: string };

// What the page shows: whether trading is switched on, the last check, and
// the recent orders with the reason for each.
export type AlgoStatus = {
  live: boolean;
  lastCheck: { ranAt: string; note: string; orders: number } | null;
  recent: (SignalOrder & { ranAt: string })[];
};
