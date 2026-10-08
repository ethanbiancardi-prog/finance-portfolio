// Algo portfolios: four of the Strategy Lab's strategies each trading their
// own live $100,000 paper account, so the backtest's claims get tested on
// prices nobody had seen when the rules were written.
//
// The rules are the Strategy Lab's own (STRATEGIES in lib/strategyLab.ts),
// run once a day at ~3:45pm New York time, close to the daily closes the
// backtest used. One difference: the backtest decides on a close and fills
// at the next day's close; live, the decision and the fill both use the
// 3:45pm price, since waiting a day would mean trading on a stale signal.
//
// Each strategy's account belongs to a server-created "robot" user in
// Supabase (random password, never stored, so nobody can sign in as it).
// The accounts are created on the first live run, so each one opens the day
// it starts trading. Trades go through place_paper_trade(), like everyone's.
//
// Triggered by /api/signal-trader/run (cron-job.org, every 15 minutes): it
// calls runAlgoPortfolios(), which acts only inside the 3:40-3:58pm window
// and only once a day. ALGO_PORTFOLIOS_ENABLED=false pauses trading.

import { randomBytes } from "node:crypto";
import { alpaca } from "./alpaca";
import { getRedis, kvConfigured } from "./kv";
import { getDailyBars, getLatestPrices } from "./marketdata";
import { buildPortfolio, nyDate, replay, type PaperAccountRow, type PaperTradeRow, type PortfolioSummary } from "./portfolio";
import { STRATEGIES, buildTable, type PriceTable, type StrategyKey } from "./strategyLab";
import { labUniverse } from "./strategyLabData";
import { createAdminClient } from "./supabase/admin";

export const ALGO_KEYS = ["momentum", "trend", "breakout", "meanrev"] as const satisfies readonly StrategyKey[];
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
// 3:45pm prices. A stock without a fresh price gets NaN there, which every
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

// --- The daily run -----------------------------------------------------------

function inWindow(now = new Date()): boolean {
  const [h, m] = now
    .toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour12: false })
    .split(":")
    .map(Number);
  const minutes = h * 60 + m;
  return minutes >= 15 * 60 + 40 && minutes <= 15 * 60 + 58;
}

export async function runAlgoPortfolios(opts: { dryRun?: boolean; force?: boolean } = {}): Promise<AlgoRunReport> {
  const live = !opts.dryRun && process.env.ALGO_PORTFOLIOS_ENABLED !== "false";
  const base = { ranAt: new Date().toISOString(), live, bots: [] as AlgoRunReport["bots"] };
  if (!opts.force && !opts.dryRun && !inWindow()) return { ...base, note: "Outside the 3:40-3:58pm window." };

  const clock: { is_open: boolean } = await alpaca("/clock");
  if (!clock.is_open && !opts.dryRun) return { ...base, note: "Market closed." };

  // Once a day, whichever scheduler call lands in the window first.
  const today = nyDate(new Date());
  if (live && kvConfigured()) {
    const first = await getRedis().set(`algo:ran:${today}`, base.ranAt, { nx: true, ex: 60 * 60 * 20 });
    if (!first) return { ...base, note: "Already ran today." };
  }

  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY is not set");
  const accounts = await getAccounts(admin, live);
  const universe = labUniverse();
  const table = await livePrices(["SPY", ...universe], clock.is_open);
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
      const decision = strategy.decide(t, held, { ...ctx, first: trades.length === 0 });
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
    await getRedis().del(VIEW_KEY).catch(() => {}); // show the new trades straight away
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
  const view: AlgoView = { portfolios, lastRun, startsAt: "3:45pm New York time, weekdays" };
  if (kvConfigured()) await getRedis().set(VIEW_KEY, view, { ex: VIEW_TTL_SECONDS }).catch(() => {});
  return view;
}
