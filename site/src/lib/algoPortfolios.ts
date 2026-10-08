// Algo portfolios: three of the Strategy Lab's strategies each trading their
// own live $100,000 paper account, so the backtest's claims get tested on
// prices nobody had seen when the rules were written, plus a control: the
// same $100,000 in SPY, bought on day one and never sold.
//
// The control was the trend-following account until Oct 8 2026, its first
// day: it held only SPY then, so it was converted in place (same shares,
// same opening time) rather than reopened.
//
// The rules are the Strategy Lab's own (STRATEGIES in lib/strategyLab.ts),
// checked every 15 minutes while the market is open, with the latest price
// standing in for "today's close", so a stock that breaks out or drops
// mid-morning is acted on then rather than at the end of the day. (Until
// Oct 8 2026 they ran once a day at 3:45pm; the backtest uses daily closes
// and fills at the next day's close, so live results now differ from it by
// design.) Momentum still rebalances only on the first trading day of each
// month, once that day; the S&P 500 control never trades after day one.
//
// Each strategy's account belongs to a server-created "robot" user in
// Supabase (random password, never stored, so nobody can sign in as it).
// The accounts are created on the first live run, so each one opens the day
// it starts trading. Trades go through place_paper_trade(), like everyone's.
//
// Triggered by /api/signal-trader/run (cron-job.org, every 15 minutes), which
// calls runAlgoPortfolios() alongside the Signal Trader.
// ALGO_PORTFOLIOS_ENABLED=false pauses trading.

import { randomBytes } from "node:crypto";
import { alpaca } from "./alpaca";
import { getRedis, kvConfigured } from "./kv";
import { getDailyBars, getLatestPrices } from "./marketdata";
import { buildPortfolio, nyDate, replay, type PaperAccountRow, type PaperTradeRow, type PortfolioSummary } from "./portfolio";
import { STRATEGIES, buildTable, type PriceTable, type StrategyKey } from "./strategyLab";
import { labUniverse } from "./strategyLabData";
import { createAdminClient } from "./supabase/admin";

// "buyhold" is the control. Listed first so the page draws it first.
export const ALGO_KEYS = ["buyhold", "momentum", "breakout", "meanrev"] as const satisfies readonly StrategyKey[];
export type AlgoKey = (typeof ALGO_KEYS)[number];

const ACCOUNTS_KEY = "algo:accounts:v1"; // Redis hash: strategy key -> robot user id
const REPORT_KEY = "algo:last-run:v1";
const VIEW_KEY = "algo:portfolios:v1";
const VIEW_TTL_SECONDS = 120;
const botEmail = (key: AlgoKey) => `algo-${key}@example.com`; // example.com never receives mail

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
type Order = { symbol: string; side: "buy" | "sell"; qty: number; price: number; reason: string };
export type AlgoRunReport = {
  ranAt: string;
  live: boolean;
  note: string;
  bots: { key: AlgoKey; note: string; orders: Order[]; failed: string[] }[];
};

// --- Robot accounts ----------------------------------------------------------

// Finds each strategy's robot user, creating the user and its $100,000
// paper account when `create` is set. Redis remembers the ids; if Redis is
// ever wiped they're found again by email.
async function getAccounts(admin: Admin, create: boolean): Promise<Map<AlgoKey, string>> {
  const out = new Map<AlgoKey, string>();
  const cached = kvConfigured() ? await getRedis().hgetall<Record<string, string>>(ACCOUNTS_KEY).catch(() => null) : null;
  for (const key of ALGO_KEYS) if (cached?.[key]) out.set(key, cached[key]);
  if (out.size === ALGO_KEYS.length) return out;

  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Couldn't list users: ${error.message}`);
  for (const key of ALGO_KEYS) {
    if (out.has(key)) continue;
    let id = data.users.find((u) => u.email === botEmail(key))?.id;
    if (!id && create) {
      const made = await admin.auth.admin.createUser({
        email: botEmail(key),
        password: randomBytes(32).toString("hex"), // never stored: nobody signs in as a robot
        email_confirm: true, // no confirmation email
        user_metadata: { robot: true, strategy: key },
      });
      if (made.error || !made.data.user) throw new Error(`Couldn't create the ${key} account: ${made.error?.message}`);
      id = made.data.user.id;
    }
    if (!id) continue;
    if (create) {
      // $100,000 and "opened now" are the table's defaults, same as a visitor's account.
      const { error: accErr } = await admin.from("paper_accounts").upsert({ user_id: id }, { onConflict: "user_id", ignoreDuplicates: true });
      if (accErr) throw new Error(`Couldn't open the ${key} paper account: ${accErr.message}`);
    }
    out.set(key, id);
  }
  if (kvConfigured() && out.size) await getRedis().hset(ACCOUNTS_KEY, Object.fromEntries(out)).catch(() => {});
  return out;
}

// --- Prices ------------------------------------------------------------------

// The last ~300 completed trading days. While the market is open, a final
// "today" column holds the latest trade price, so the strategies decide on
// live prices. A stock without a fresh price gets NaN there, which every
// rule reads as "no signal": copying yesterday's close forward instead would
// fake a flat day (and an "oversold" reading after a down day). With the
// market closed (a dry run), the last real close is "today".
// Split-adjusted only: dividend-adjusting history would put it on a
// different footing from today's raw price.
async function livePrices(symbols: string[], marketOpen: boolean): Promise<PriceTable> {
  const today = nyDate(new Date());
  const [bars, latest] = await Promise.all([getDailyBars(symbols, 300), getLatestPrices(symbols)]);
  for (const [s, list] of bars) bars.set(s, list.filter((b) => b.t.slice(0, 10) < today));
  const table = buildTable(bars);
  if (!marketOpen) return table;
  table.dates.push(today);
  for (const [s, series] of table.close) {
    const q = latest.get(s);
    const fresh = q && Date.now() - new Date(q.asOf).getTime() < 30 * 60_000;
    series.push(fresh ? q.price : NaN);
  }
  return table;
}

// --- The 15-minute run --------------------------------------------------------

const LOCK_KEY = "algo:lock";

export async function runAlgoPortfolios(opts: { dryRun?: boolean } = {}): Promise<AlgoRunReport> {
  const live = !opts.dryRun && process.env.ALGO_PORTFOLIOS_ENABLED !== "false";
  const base = { ranAt: new Date().toISOString(), live, bots: [] as AlgoRunReport["bots"] };

  const clock: { is_open: boolean } = await alpaca("/clock");
  if (!clock.is_open && !opts.dryRun) return { ...base, note: "Market closed." };

  // Two overlapping runs (cron-job.org and the GitHub backup) could both
  // see the same cash and double-buy.
  if (live && kvConfigured()) {
    const got = await getRedis().set(LOCK_KEY, base.ranAt, { nx: true, ex: 240 });
    if (!got) return { ...base, note: "Another run is in progress." };
  }
  try {
    return await runOnce(base, live, clock.is_open);
  } finally {
    if (live && kvConfigured()) await getRedis().del(LOCK_KEY).catch(() => {});
  }
}

async function runOnce(base: Omit<AlgoRunReport, "note">, live: boolean, marketOpen: boolean): Promise<AlgoRunReport> {
  const today = nyDate(new Date());

  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY is not set");
  const accounts = await getAccounts(admin, live);
  const universe = labUniverse();
  const table = await livePrices(["SPY", ...universe], marketOpen);
  const t = table.dates.length - 1;
  const ctx = { table, universe: universe.filter((s) => table.close.has(s)), spy: table.close.get("SPY")! };
  const price = (s: string) => table.close.get(s)?.[t] ?? NaN;

  for (const key of ALGO_KEYS) {
    const strategy = STRATEGIES.find((s) => s.key === key)!;
    const userId = accounts.get(key);
    const bot = { key, note: "", orders: [] as Order[], failed: [] as string[] };
    base.bots.push(bot);
    try {
      let trades: PaperTradeRow[] = [];
      if (userId) {
        const { data, error } = await admin
          .from("paper_trades")
          .select("id, symbol, side, qty, price, executed_at")
          .eq("user_id", userId)
          .order("executed_at");
        if (error) throw new Error(error.message);
        trades = (data ?? []) as PaperTradeRow[];
      }
      const { cash, holdings } = replay(trades, 100_000);
      const held = new Set(holdings.keys());
      let decision = strategy.decide(t, held, { ...ctx, first: trades.length === 0 });
      // Momentum's rule fires all day on the first trading day of a month;
      // rebalance on the first check that day only, not every 15 minutes.
      if (decision && key === "momentum" && trades.length > 0 && live && kvConfigured()) {
        const first = await getRedis().set(`algo:momentum-rebalanced:${today}`, base.ranAt, { nx: true, ex: 60 * 60 * 20 });
        if (!first) decision = null;
      }
      if (!decision) {
        bot.note = key === "momentum" ? "Holds until the first trading day of next month." : "No change.";
        continue;
      }

      // Sells first, then buys sized on today's account value.
      let equity = cash;
      for (const [s, h] of holdings) equity += h.qty * (Number.isFinite(price(s)) ? price(s) : h.cost / h.qty);
      let spendable = cash;
      for (const [s, h] of holdings) {
        if (decision.hold.has(s) || !Number.isFinite(price(s))) continue;
        bot.orders.push({ symbol: s, side: "sell", qty: h.qty, price: price(s), reason: `${strategy.name}: exit rule met` });
        spendable += h.qty * price(s);
      }
      for (const s of decision.hold) {
        if (held.has(s) || !Number.isFinite(price(s))) continue;
        const qty = Math.floor(Math.min(equity * decision.entryWeight, spendable) / price(s));
        if (qty < 1) continue;
        bot.orders.push({ symbol: s, side: "buy", qty, price: price(s), reason: `${strategy.name}: entry rule met` });
        spendable -= qty * price(s);
      }
      bot.note = bot.orders.length ? `${bot.orders.length} order${bot.orders.length === 1 ? "" : "s"}.` : "On target, nothing to trade.";

      if (!live || !userId || bot.orders.length === 0) continue;
      const filled: Order[] = [];
      for (const o of bot.orders) {
        const { error } = await admin.rpc("place_paper_trade", {
          p_user_id: userId,
          p_symbol: o.symbol,
          p_side: o.side,
          p_qty: o.qty,
          p_price: o.price,
        });
        if (error) bot.failed.push(`${o.side} ${o.qty} ${o.symbol}: ${error.message}`);
        else filled.push(o);
      }
      bot.orders = filled;
      await admin.from("paper_strategy_runs").insert({
        user_id: userId,
        status: bot.failed.length && !filled.length ? "error" : "rebalanced",
        reason: `Algo ${strategy.name}: ${filled.length} filled${bot.failed.length ? `, ${bot.failed.length} failed` : ""}.`,
        orders: filled,
      });
    } catch (err) {
      bot.note = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const report: AlgoRunReport = { ...base, note: live ? "Ran." : "Dry run, nothing traded." };
  if (live && kvConfigured()) {
    await getRedis().set(REPORT_KEY, report).catch(() => {});
    // Show new trades straight away; quiet checks leave the 2-minute cache be.
    if (base.bots.some((b) => b.orders.length)) await getRedis().del(VIEW_KEY).catch(() => {});
  }
  return report;
}

// --- Read side, for the Strategy Lab's Live tab --------------------------------

export type AlgoPortfolio = PortfolioSummary & { key: AlgoKey; name: string };
export type AlgoView = { portfolios: AlgoPortfolio[]; lastRun: AlgoRunReport | null; startsAt: string };

export async function getAlgoPortfolios(): Promise<AlgoView> {
  if (kvConfigured()) {
    try {
      const cached = await getRedis().get<AlgoView>(VIEW_KEY);
      if (cached) return cached;
    } catch {
      // Cache read failed — build it live this once.
    }
  }
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY is not set");
  const accounts = await getAccounts(admin, false);
  const portfolios: AlgoPortfolio[] = [];
  for (const key of ALGO_KEYS) {
    const userId = accounts.get(key);
    if (!userId) continue;
    const [{ data: account }, { data: trades }] = await Promise.all([
      admin.from("paper_accounts").select("user_id, starting_cash, created_at").eq("user_id", userId).maybeSingle(),
      admin.from("paper_trades").select("id, symbol, side, qty, price, executed_at").eq("user_id", userId).order("executed_at"),
    ]);
    if (!account) continue;
    const summary = await buildPortfolio(account as PaperAccountRow, (trades ?? []) as PaperTradeRow[]);
    portfolios.push({ ...summary, key, name: STRATEGIES.find((s) => s.key === key)!.name });
  }
  const lastRun = kvConfigured() ? await getRedis().get<AlgoRunReport>(REPORT_KEY).catch(() => null) : null;
  const view: AlgoView = { portfolios, lastRun, startsAt: "every 15 minutes while the market is open" };
  if (kvConfigured()) await getRedis().set(VIEW_KEY, view, { ex: VIEW_TTL_SECONDS }).catch(() => {});
  return view;
}
