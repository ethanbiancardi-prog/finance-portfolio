// The growth-checklist robot: one of the live algo portfolios
// (lib/algoPortfolios.ts), trading its own $100,000 paper account by the
// Growth Stocks screen's checklist (lib/growthScreen.ts). Started Nov 11 2026.
//
// The rules are the backtest's best version, "6+ of 9"
// (projects/paper-trading/GROWTH_CHECKLIST_BACKTEST.md: ~20%/yr on the
// S&P 500 2017-26, vs 14% for the index). Live it scans the screen's whole
// ~1,700-stock list, where the backtest only had the S&P 500.
//
//   BUY   a stock passing 6 or more of the 9 checks, best first (most checks,
//         then Relative Price Score), never one already under its 200-day
//         average; 9% of the account each, up to 10 stocks, at most 2 from
//         one sector, not within 14 days of selling it.
//   SELL  when the price falls 8% below what we paid (checked every run on
//         the latest price), the last close is under the 200-day average, or
//         the company starts losing money.
//
// The checks use the screen's numbers: last night's closes and the latest
// filings, so buys and trend sells only change once a day; the 8% stop is
// the one rule that reacts within the day.

import { getGrowthScreen, type GrowthRow } from "./growthScreen";
import { getLatestPrices } from "./marketdata";
import type { PaperTradeRow } from "./portfolio";

export const GROWTH_BOT = { minChecks: 6, maxPositions: 10, weight: 0.09, perSector: 2, stop: 0.08, cooldownDays: 14 } as const;
export const GROWTH_BOT_NAME = "Growth checklist (6+ of 9)";

type Holding = { qty: number; cost: number }; // cost = total dollars paid
export type BotOrder = { symbol: string; side: "buy" | "sell"; qty: number; price: number; reason: string };

export async function growthBotOrders(
  trades: PaperTradeRow[],
  cash: number,
  holdings: Map<string, Holding>,
): Promise<{ orders: BotOrder[]; note: string }> {
  const screen = await getGrowthScreen();
  const total = 9;
  const row = new Map<string, GrowthRow>(screen.rows.map((r) => [r.symbol, r]));

  // Best candidates first; only the top few need a live price.
  const candidates = screen.rows
    .filter((r) => r.passed >= GROWTH_BOT.minChecks && r.belowSma200 === false && !holdings.has(r.symbol))
    .sort((a, b) => b.passed - a.passed || (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 40);
  const latest = await getLatestPrices([...holdings.keys(), ...candidates.map((c) => c.symbol)]);
  // A price older than 30 minutes is stale (halted, or the feed missed it): skip that stock this run.
  const price = (s: string) => {
    const q = latest.get(s);
    return q && Date.now() - new Date(q.asOf).getTime() < 30 * 60_000 ? q.price : NaN;
  };

  const orders: BotOrder[] = [];
  let equity = cash;
  for (const [s, h] of holdings) equity += h.qty * (Number.isFinite(price(s)) ? price(s) : h.cost / h.qty);

  // 1. Sells.
  let spendable = cash;
  const staying: string[] = [];
  for (const [s, h] of holdings) {
    const px = price(s);
    const paid = h.cost / h.qty;
    const r = row.get(s);
    const reason =
      Number.isFinite(px) && px <= paid * (1 - GROWTH_BOT.stop)
        ? `8% stop: ${px.toFixed(2)} vs ${paid.toFixed(2)} paid`
        : r?.belowSma200
          ? "Closed under its 200-day average"
          : r?.checks.profitable.pass === false
            ? "Company is now losing money"
            : null;
    if (reason && Number.isFinite(px)) {
      orders.push({ symbol: s, side: "sell", qty: h.qty, price: px, reason });
      spendable += h.qty * px;
    } else staying.push(s);
  }

  // 2. Buys into the free slots.
  const soldRecently = new Set(
    trades
      .filter((t) => t.side === "sell" && Date.now() - new Date(t.executed_at).getTime() < GROWTH_BOT.cooldownDays * 86_400_000)
      .map((t) => t.symbol),
  );
  const perSector = new Map<string, number>();
  for (const s of staying) {
    const sec = row.get(s)?.sector ?? "?";
    perSector.set(sec, (perSector.get(sec) ?? 0) + 1);
  }
  let open = staying.length;
  for (const c of candidates) {
    if (open >= GROWTH_BOT.maxPositions) break;
    if (soldRecently.has(c.symbol) || orders.some((o) => o.symbol === c.symbol)) continue;
    if ((perSector.get(c.sector) ?? 0) >= GROWTH_BOT.perSector) continue;
    const px = price(c.symbol);
    if (!Number.isFinite(px)) continue;
    const qty = Math.floor(Math.min(equity * GROWTH_BOT.weight, spendable) / px);
    if (qty < 1) break; // out of cash
    orders.push({ symbol: c.symbol, side: "buy", qty, price: px, reason: `Passes ${c.passed} of ${total} growth checks (price score ${c.score ?? "–"})` });
    spendable -= qty * px;
    open++;
    perSector.set(c.sector, (perSector.get(c.sector) ?? 0) + 1);
  }

  const qualifying = screen.rows.filter((r) => r.passed >= GROWTH_BOT.minChecks).length;
  const note = orders.length
    ? `${orders.length} order${orders.length === 1 ? "" : "s"}. ${qualifying} stocks pass ${GROWTH_BOT.minChecks}+ checks.`
    : `${open >= GROWTH_BOT.maxPositions ? "Full (10 stocks)" : "No new buys"}; no sell rule hit. ${qualifying} stocks pass ${GROWTH_BOT.minChecks}+ checks.`;
  return { orders, note };
}
