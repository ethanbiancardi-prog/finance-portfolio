// Signal Trader: the algorithm that trades the showcase portfolio (the
// dashboard account named by SHOWCASE_USER_ID) on its own, from the evidence
// the Research Signals already collect. Rules in
// projects/paper-trading/SIGNAL_TRADER.md; every number lives in RULES
// (lib/signalTraderRules.ts).
//
// Runs every 15 minutes while the market is open (GitHub Actions calls
// /api/signal-trader/run, since both Vercel crons are taken). The signals
// themselves refresh once a day after the close, so most entries happen on
// the first run of the morning; the intraday runs are mainly the stops.
//
// Each run:
//   1. Skips unless the market is open right now (Alpaca's clock).
//   2. Scores every ticker any signal mentions (decide() below explains how).
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
import { getFinancialSignals } from "./signals/financial";
import { getPoliticalSignals } from "./signals/political";
import { getPresidentialSignals } from "./signals/presidential";
import { RULES, type SignalOrder } from "./signalTraderRules";
import { createAdminClient } from "./supabase/admin";


// --- Scoring -----------------------------------------------------------------

export type Evidence = { source: "congress" | "filing" | "president"; points: number; text: string };
export type Candidate = { symbol: string; score: number; evidence: Evidence[]; sinceCongress: number | null };

const BEARISH_STORIES = /compressing|leverage rising/i;

// One score per ticker, summed across the signal categories that have a
// direction. Legislation and geopolitics are left out: their AI write-ups
// don't say which way a story cuts, and guessing would be worse than nothing.
export async function scoreSignals(): Promise<Map<string, Candidate>> {
  const [political, financial, presidential] = await Promise.all([
    getPoliticalSignals(),
    getFinancialSignals(),
    getPresidentialSignals(),
  ]);
  const out = new Map<string, Candidate>();
  const add = (symbol: string, e: Evidence, sinceCongress: number | null = null) => {
    const s = symbol.toUpperCase();
    const c = out.get(s) ?? { symbol: s, score: 0, evidence: [], sinceCongress: null };
    c.score += e.points;
    c.evidence.push(e);
    if (sinceCongress !== null) c.sinceCongress = sinceCongress;
    out.set(s, c);
  };

  // Congress: the conviction score political.ts already computes — distinct
  // buyers minus sellers, +1 if one-sided, +2 if a buyer sits on a committee
  // that oversees the company. Capped so one category can't run the book.
  for (const s of political?.items ?? []) {
    const c = s.conviction?.score ?? 0;
    if (c === 0) continue;
    add(s.ticker, { source: "congress", points: Math.max(-6, Math.min(6, c)), text: `Congress: ${s.conviction!.label}` }, s.sinceTrade?.pct ?? null);
  }
  // Latest 10-K: a good story (margins expanding, cash machine, ...) +2, a bad one −2.
  for (const s of financial?.items ?? []) {
    const bad = BEARISH_STORIES.test(s.title ?? "");
    add(s.ticker, { source: "filing", points: bad ? -2 : 2, text: `10-K: ${s.title}` });
  }
  // The President's disclosed trades: net buying +2, net selling −2.
  for (const a of presidential?.netPurchases ?? []) add(a.ticker, { source: "president", points: 2, text: "President: net buyer" });
  for (const a of presidential?.netSales ?? []) add(a.ticker, { source: "president", points: -2, text: "President: net seller" });
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
  for (const c of ranked) {
    const m = market.get(c.symbol);
    const skip = (reason: string) => skipped.push({ symbol: c.symbol, score: c.score, reason });
    if (open >= RULES.maxPositions) { skip("Portfolio full."); continue; }
    if (!input.tradable.has(c.symbol)) { skip("Not tradable on Alpaca."); continue; }
    if (input.recentlySold.has(c.symbol)) { skip(`Sold within ${RULES.cooldownDays} days.`); continue; }
    if (!m) { skip("No fresh price."); continue; }
    if (m.price < RULES.minPrice) { skip(`Under $${RULES.minPrice}.`); continue; }
    if (m.sma50 === null || m.sma200 === null) { skip("Not enough price history."); continue; }
    if (m.price < m.sma50 || m.price < m.sma200) { skip("Below its 50- or 200-day average."); continue; }
    if (c.sinceCongress !== null && c.sinceCongress > RULES.maxChase) { skip(`Already up ${pct(c.sinceCongress)} since Congress bought.`); continue; }
    const qty = Math.floor(Math.min(target, cash) / m.price);
    if (qty < 1) { skip("Not enough cash."); continue; }
    orders.push({
      symbol: c.symbol,
      side: "buy",
      qty,
      price: m.price,
      reason: `Score ${c.score} (${c.evidence.map((e) => e.text).join("; ")}), above its 50- and 200-day averages.`,
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

    const candidates = await scoreSignals();
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
