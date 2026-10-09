// Signal Trader: the algorithm that trades the showcase portfolio (the
// dashboard account named by SHOWCASE_USER_ID) on its own, buying from the
// ~94 stocks in the sector lists. Each stock is scored on four drivers:
// insider buying, the latest 10-K story, price trend and momentum (see
// scoreSignals below). Rules in
// projects/paper-trading/SIGNAL_TRADER.md; every number lives in RULES
// (lib/signalTraderRules.ts).
//
// Runs every 15 minutes while the market is open (GitHub Actions calls
// /api/signal-trader/run, since both Vercel crons are taken). The scores
// themselves change once a day (insider filings and 10-K stories refresh
// after the close; trend and momentum use completed days), so most entries
// happen on the first run of the morning; the intraday runs are mainly the
// stops.
//
// Each run:
//   1. Skips unless the market is open right now (Alpaca's clock).
//   2. Scores every stock in the universe, plus current holdings.
//   3. Sells holdings that hit a stop, broke their trend, or lost their
//      signal; then buys the best-scoring names above their trend, up to
//      RULES.maxPositions, at the latest IEX trade price.
//   4. Logs each order with its reason to paper_strategy_runs, and the full
//      decision to Redis for the /paper-trading page.
//
// SIGNAL_TRADER_ENABLED must be "true" for it to place trades; otherwise
// every run is a dry run that only reports what it would have done.

import { alpaca, getTradableAssets } from "./alpaca";
import { getRedis, kvConfigured } from "./kv";
import { getDailyBars, getLatestPrices, type DailyBar } from "./marketdata";
import { nyDate, replay, type PaperTradeRow } from "./portfolio";
import { SECTOR_KEYS, SECTORS } from "./sectors";
import { getChartScores } from "./signals/chart";
import { getFinancialSignals } from "./signals/financial";
import { getInsiderSignals, INSIDER_WINDOW_DAYS } from "./signals/insider";
import { RULES, type SignalOrder } from "./signalTraderRules";
import { createAdminClient } from "./supabase/admin";


// --- Scoring -----------------------------------------------------------------

export type Evidence = { source: "insider" | "filing" | "trend" | "momentum"; points: number; text: string };
export type Candidate = { symbol: string; score: number; evidence: Evidence[] };

const BEARISH_STORIES = /compressing|leverage rising/i;
// An insider's purchases must add up to at least this to count; a director
// buying $2,000 of stock is a gesture, not a bet.
const MIN_INSIDER_BUY = 10_000;
const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`);

// The universe the algorithm buys from: every stock in the sector lists.
export function traderUniverse(): string[] {
  return [...new Set(SECTOR_KEYS.flatMap((k) => [...SECTORS[k].tickers]))];
}

// One score per stock, summed across four drivers. `holdings` are scored
// too, even if they're outside the universe, so every position can be
// checked against the hold rule.
//
//   Insider buying  +2 / +4 / +6  one / two / three or more insiders bought on
//                                 the open market in the last 60 days, +1 if
//                                 one is the CEO, CFO or President (max +6)
//   10-K story      +2 or −2      the latest annual report tells a good story
//                                 (margins expanding, cash machine) or a bad one
//   Price trend     0 to +2       above the 200-day average; and the 50-day
//                                 above the 200-day (lib/signals/chart.ts)
//   Momentum        0 to +2       12-month return in the universe's top fifth
//                                 (+2) or second fifth (+1)
export async function scoreSignals(holdings: string[] = []): Promise<Map<string, Candidate>> {
  const universe = traderUniverse();
  const [insider, financial, chart] = await Promise.all([
    getInsiderSignals(),
    getFinancialSignals(),
    getChartScores(universe, holdings.filter((h) => !universe.includes(h))),
  ]);
  const out = new Map<string, Candidate>();
  const add = (symbol: string, e: Evidence) => {
    const s = symbol.toUpperCase();
    const c = out.get(s) ?? { symbol: s, score: 0, evidence: [] };
    c.score += e.points;
    c.evidence.push(e);
    out.set(s, c);
  };

  // Insider buying: distinct buyers per stock, each over MIN_INSIDER_BUY.
  // When PLAN_CROWD or more insiders of one company buy on the same day,
  // it's a company program (directors' fees paid in stock, a purchase plan),
  // not that many separate decisions, so those days are left out.
  const PLAN_CROWD = 4;
  const sameDay = new Map<string, Set<string>>();
  for (const b of insider?.buys ?? []) {
    const k = `${b.ticker} ${b.date}`;
    sameDay.set(k, (sameDay.get(k) ?? new Set()).add(b.insider));
  }
  const byTicker = new Map<string, Map<string, { value: number; top: boolean }>>();
  for (const b of insider?.buys ?? []) {
    if ((sameDay.get(`${b.ticker} ${b.date}`)?.size ?? 0) >= PLAN_CROWD) continue;
    const people = byTicker.get(b.ticker) ?? new Map();
    const p = people.get(b.insider) ?? { value: 0, top: false };
    people.set(b.insider, { value: p.value + b.value, top: p.top || b.topOfficer });
    byTicker.set(b.ticker, people);
  }
  for (const [ticker, people] of byTicker) {
    const buyers = [...people.values()].filter((p) => p.value >= MIN_INSIDER_BUY);
    if (!buyers.length) continue;
    const top = buyers.some((p) => p.top);
    const points = Math.min(6, Math.min(3, buyers.length) * 2 + (top ? 1 : 0));
    const total = buyers.reduce((s, p) => s + p.value, 0);
    add(ticker, {
      source: "insider",
      points,
      text: `Insiders: ${buyers.length} bought ${money(total)} in ${INSIDER_WINDOW_DAYS} days${top ? ", incl. a top officer" : ""}`,
    });
  }
  // Latest 10-K: a good story +2, a bad one −2.
  for (const s of financial?.items ?? []) {
    const bad = BEARISH_STORIES.test(s.title ?? "");
    add(s.ticker, { source: "filing", points: bad ? -2 : 2, text: `10-K: ${s.title}` });
  }
  // The chart: trend and momentum, for every stock with enough history.
  for (const [symbol, c] of chart) {
    if (c.trend) add(symbol, { source: "trend", points: c.trend, text: c.trendText });
    if (c.momentum) add(symbol, { source: "momentum", points: c.momentum, text: c.momentumText });
  }
  return out;
}

// --- Decision (pure, so a dry run shows exactly what a live run would do) ---

export type Holding = { symbol: string; qty: number; avgCost: number; openedOn: string };
export type Market = {
  price: number; // latest trade
  sma50: number | null;
  sma200: number | null;
  peakClose: number | null; // highest daily close since the position opened
};
export type Order = SignalOrder;
export type Skip = { symbol: string; score: number; reason: string };

export function decide(input: {
  cash: number;
  holdings: Holding[];
  candidates: Map<string, Candidate>;
  market: Map<string, Market>;
  recentlySold: Set<string>;
  tradable: Set<string>;
  today?: string; // New York date, YYYY-MM-DD; defaults to now
}): { orders: Order[]; kept: { symbol: string; reason: string }[]; skipped: Skip[] } {
  const { holdings, candidates, market } = input;
  const orders: Order[] = [];
  const kept: { symbol: string; reason: string }[] = [];
  const skipped: Skip[] = [];
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  // 1. Exits, checked in order of urgency.
  let equity = input.cash;
  for (const h of holdings) equity += h.qty * (market.get(h.symbol)?.price ?? h.avgCost);
  let cash = input.cash;
  const staying: Holding[] = [];
  for (const h of holdings) {
    const m = market.get(h.symbol);
    if (!m) {
      kept.push({ symbol: h.symbol, reason: "No fresh price, held until there is one." });
      staying.push(h);
      continue;
    }
    const score = candidates.get(h.symbol)?.score ?? 0;
    const peak = Math.max(m.peakClose ?? 0, h.avgCost);
    let reason: string | null = null;
    if (m.price <= h.avgCost * (1 - RULES.stopLoss)) reason = `Stop-loss: ${pct(m.price / h.avgCost - 1)} from cost.`;
    else if (m.price <= peak * (1 - RULES.trailingStop)) reason = `Trailing stop: ${pct(m.price / peak - 1)} from its high of $${peak.toFixed(2)}.`;
    else if (m.sma200 !== null && m.price < m.sma200) reason = "Trend broke: price fell below its 200-day average.";
    else if (score < RULES.holdScore) reason = score === 0 ? "No signal supports holding it." : `Signal faded to ${score}.`;
    if (reason) {
      orders.push({ symbol: h.symbol, side: "sell", qty: h.qty, price: m.price, reason });
      cash += h.qty * m.price;
    } else {
      kept.push({ symbol: h.symbol, reason: `Score ${score}, ${pct(m.price / h.avgCost - 1)} from cost.` });
      staying.push(h);
    }
  }

  // 2. Entries: strongest signals first, momentum as the tie-break.
  const held = new Set(staying.map((h) => h.symbol));
  const ranked = [...candidates.values()]
    .filter((c) => c.score >= RULES.entryScore && !held.has(c.symbol))
    .sort((a, b) => {
      const ma = market.get(a.symbol), mb = market.get(b.symbol);
      const trend = (m?: Market) => (m?.sma200 ? m.price / m.sma200 : 0);
      return b.score - a.score || trend(mb) - trend(ma);
    });
  let open = staying.length;
  const target = equity * RULES.positionWeight;
  // 3. Swaps: with the portfolio full, a candidate scoring RULES.swapMargin
  //    or more above the weakest holding replaces it, so the book drifts
  //    towards the strongest names instead of waiting for a stop to free a
  //    slot. A holding is only swappable after RULES.swapMinHoldDays (no
  //    churning what was just bought), at most RULES.maxSwapsPerRun a run,
  //    and the one sold can't come back for RULES.cooldownDays.
  const today = input.today ?? nyDate(new Date());
  const daysHeld = (h: Holding) => (new Date(today).getTime() - new Date(h.openedOn).getTime()) / 86_400_000;
  let swaps = 0;
  const weakest = () =>
    staying
      .filter((h) => market.has(h.symbol) && daysHeld(h) >= RULES.swapMinHoldDays)
      .map((h) => ({ h, score: candidates.get(h.symbol)?.score ?? 0, m: market.get(h.symbol)! }))
      // Lowest score first; between equal scores, the one doing worst.
      .sort((a, b) => a.score - b.score || a.m.price / a.h.avgCost - b.m.price / b.h.avgCost)[0];
  for (const c of ranked) {
    const m = market.get(c.symbol);
    const skip = (reason: string) => skipped.push({ symbol: c.symbol, score: c.score, reason });
    if (!input.tradable.has(c.symbol)) { skip("Not tradable on Alpaca."); continue; }
    if (input.recentlySold.has(c.symbol)) { skip(`Sold within ${RULES.cooldownDays} days.`); continue; }
    if (!m) { skip("No fresh price."); continue; }
    if (m.price < RULES.minPrice) { skip(`Under $${RULES.minPrice}.`); continue; }
    if (m.sma50 === null || m.sma200 === null) { skip("Not enough price history."); continue; }
    if (m.price < m.sma50 || m.price < m.sma200) { skip("Below its 50- or 200-day average."); continue; }
    if (open >= RULES.maxPositions) {
      const w = swaps < RULES.maxSwapsPerRun ? weakest() : undefined;
      if (!w || c.score < w.score + RULES.swapMargin) { skip("Portfolio full."); continue; }
      orders.push({
        symbol: w.h.symbol,
        side: "sell",
        qty: w.h.qty,
        price: w.m.price,
        reason: `Swapped out: score ${w.score}, replaced by ${c.symbol} at score ${c.score}.`,
      });
      cash += w.h.qty * w.m.price;
      staying.splice(staying.indexOf(w.h), 1);
      const k = kept.findIndex((x) => x.symbol === w.h.symbol);
      if (k >= 0) kept.splice(k, 1);
      open--;
      swaps++;
    }
    const qty = Math.floor(Math.min(target, cash) / m.price);
    if (qty < 1) { skip("Not enough cash."); continue; }
    orders.push({
      symbol: c.symbol,
      side: "buy",
      qty,
      price: m.price,
      reason: `Score ${c.score} (${c.evidence.map((e) => e.text.replace(/\.$/, "")).join("; ")}), above its 50- and 200-day averages.`,
    });
    cash -= qty * m.price;
    open++;
  }
  return { orders, kept, skipped };
}

// --- Runner ------------------------------------------------------------------

const LOCK_KEY = "signal-trader:lock";
export const REPORT_KEY = "signal-trader:last";
// Every market-hours check, newest first, for the page's "thought process"
// log. Three trading days of 15-minute checks; "market closed" checks aren't
// kept (only the latest one, above).
export const LOG_KEY = "signal-trader:log";
const LOG_LENGTH = 78;

export type RunReport = {
  ranAt: string;
  live: boolean;
  marketOpen: boolean;
  orders: Order[];
  failed: string[];
  kept: { symbol: string; reason: string }[];
  skipped: Skip[];
  note: string;
};

// A trade journal row (supabase/migrations/0001_journal_entries.sql) for one
// of the Signal Trader's fills: the reason it traded is the thesis, and for
// a buy the exit condition is the sell rules with this fill's stop-loss price.
export function journalEntry(userId: string, o: Order, executedAt = new Date()) {
  return {
    user_id: userId,
    date: nyDate(executedAt),
    ticker: o.symbol,
    action: o.side,
    thesis: `Signal Trader ${o.side === "buy" ? "bought" : "sold"} ${o.qty} at $${o.price.toFixed(2)}. ${o.reason}`,
    exit_condition:
      o.side === "buy"
        ? `Sell if it falls ${RULES.stopLoss * 100}% below cost ($${(o.price * (1 - RULES.stopLoss)).toFixed(2)}), ` +
          `${RULES.trailingStop * 100}% below its highest close since buying, below its 200-day average, ` +
          `or its signal score drops under ${RULES.holdScore}.`
        : `Position closed. Can be bought again after ${RULES.cooldownDays} days if it qualifies.`,
  };
}

const sma = (bars: DailyBar[], n: number) =>
  bars.length >= n ? bars.slice(-n).reduce((s, b) => s + b.c, 0) / n : null;

export async function runSignalTrader(opts: { dryRun?: boolean } = {}): Promise<RunReport> {
  const live = !opts.dryRun && process.env.SIGNAL_TRADER_ENABLED === "true";
  const userId = process.env.SHOWCASE_USER_ID;
  const admin = createAdminClient();
  if (!userId || !admin) throw new Error("SHOWCASE_USER_ID and SUPABASE_SECRET_KEY must both be set");
  const base = { ranAt: new Date().toISOString(), live, orders: [], failed: [], kept: [], skipped: [] };

  const clock: { is_open: boolean } = await alpaca("/clock");
  if (!clock.is_open && !opts.dryRun) {
    // Saved anyway, so the page's "last check" shows the schedule is alive
    // even overnight and at weekends.
    const closed: RunReport = { ...base, marketOpen: false, note: "Market closed." };
    if (kvConfigured()) await getRedis().set(REPORT_KEY, closed).catch(() => {});
    return closed;
  }

  // Two overlapping runs could both see the same cash and double-buy.
  if (live && kvConfigured()) {
    const got = await getRedis().set(LOCK_KEY, base.ranAt, { nx: true, ex: 240 });
    if (!got) return { ...base, marketOpen: clock.is_open, note: "Another run is in progress." };
  }

  try {
    const [{ data: account }, { data: trades, error }] = await Promise.all([
      admin.from("paper_accounts").select("starting_cash").eq("user_id", userId).maybeSingle(),
      admin.from("paper_trades").select("id, symbol, side, qty, price, executed_at").eq("user_id", userId).order("executed_at"),
    ]);
    if (!account || error) throw new Error(error?.message ?? "No paper account for SHOWCASE_USER_ID");
    const rows = (trades ?? []) as PaperTradeRow[];
    const { cash, holdings: held } = replay(rows, Number(account.starting_cash));

    // When each current position was opened: the last buy that took it up from zero.
    const openedOn = new Map<string, string>();
    const running = new Map<string, number>();
    for (const t of rows) {
      const before = running.get(t.symbol) ?? 0;
      const after = before + (t.side === "buy" ? 1 : -1) * Number(t.qty);
      if (before <= 1e-9 && after > 1e-9) openedOn.set(t.symbol, nyDate(t.executed_at));
      running.set(t.symbol, after);
    }
    const cutoff = nyDate(new Date(Date.now() - RULES.cooldownDays * 86_400_000));
    const recentlySold = new Set(rows.filter((t) => t.side === "sell" && nyDate(t.executed_at) >= cutoff).map((t) => t.symbol));

    const candidates = await scoreSignals([...held.keys()]);
    const holdings: Holding[] = [...held].map(([symbol, h]) => ({
      symbol,
      qty: h.qty,
      avgCost: h.cost / h.qty,
      openedOn: openedOn.get(symbol) ?? nyDate(new Date()),
    }));

    // Price only what could matter: holdings and anything strong enough to buy.
    const symbols = [...new Set([...holdings.map((h) => h.symbol), ...[...candidates.values()].filter((c) => c.score >= RULES.entryScore).map((c) => c.symbol)])];
    const today = nyDate(new Date());
    const [bars, latest, assets] = await Promise.all([
      getDailyBars(symbols, 230),
      getLatestPrices(symbols),
      getTradableAssets(),
    ]);
    const tradable = new Set(assets.map((a) => a.symbol));
    const market = new Map<string, Market>();
    for (const s of symbols) {
      const q = latest.get(s);
      if (!q || Date.now() - new Date(q.asOf).getTime() > RULES.maxQuoteAgeMinutes * 60_000) continue;
      // Completed days only, so the averages don't wobble with today's price.
      const closed = (bars.get(s) ?? []).filter((b) => b.t.slice(0, 10) < today);
      const since = holdings.find((h) => h.symbol === s)?.openedOn;
      const peaks = since ? closed.filter((b) => b.t.slice(0, 10) >= since).map((b) => b.c) : [];
      market.set(s, {
        price: q.price,
        sma50: sma(closed, 50),
        sma200: sma(closed, 200),
        peakClose: peaks.length ? Math.max(...peaks) : null,
      });
    }

    const { orders, kept, skipped } = decide({ cash, holdings, candidates, market, recentlySold, tradable });
    // Sells first, so their cash is there before the buys are checked.
    orders.sort((a, b) => (a.side === b.side ? 0 : a.side === "sell" ? -1 : 1));

    const filled: Order[] = [];
    const failed: string[] = [];
    if (live) {
      for (const o of orders) {
        const { error: tradeError } = await admin.rpc("place_paper_trade", {
          p_user_id: userId,
          p_symbol: o.symbol,
          p_side: o.side,
          p_qty: o.qty,
          p_price: o.price,
        });
        if (tradeError) failed.push(`${o.side} ${o.qty} ${o.symbol}: ${tradeError.message}`);
        else filled.push(o);
      }
      if (filled.length || failed.length) {
        await admin.from("paper_strategy_runs").insert({
          user_id: userId,
          status: failed.length && !filled.length ? "error" : "rebalanced",
          reason: `Signal Trader: ${filled.length} order${filled.length === 1 ? "" : "s"}${failed.length ? `, ${failed.length} failed` : ""}.`,
          orders: filled,
        });
      }
      // Every filled trade goes in the account's trade journal too, so the
      // journal stays a complete record without anyone writing it by hand.
      if (filled.length) {
        const { error: journalError } = await admin.from("journal_entries").insert(filled.map((o) => journalEntry(userId, o)));
        if (journalError) failed.push(`journal: ${journalError.message}`);
      }
    }

    const report: RunReport = {
      ...base,
      marketOpen: clock.is_open,
      orders: live ? filled : orders,
      failed,
      kept,
      skipped: skipped.slice(0, 15),
      note: live ? (orders.length ? "Traded." : "Nothing to do.") : "Dry run, nothing traded.",
    };
    // Scheduled runs are saved for the page, dry or live; a ?dryRun=1 test isn't.
    if (!opts.dryRun && kvConfigured()) {
      await getRedis().set(REPORT_KEY, report).catch(() => {});
      await getRedis()
        .lpush(LOG_KEY, report)
        .then(() => getRedis().ltrim(LOG_KEY, 0, LOG_LENGTH - 1))
        .catch(() => {});
    }
    return report;
  } finally {
    if (live && kvConfigured()) await getRedis().del(LOCK_KEY).catch(() => {});
  }
}
