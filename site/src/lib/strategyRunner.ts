// Runs every active paper-portfolio strategy. Called from api/cron/daily,
// which fires at 22:00 UTC on weekdays: 6pm New York in summer, 5pm in
// winter, after the close either way.
//
// Each run:
//   1. Skips the whole day if the market wasn't open (holidays).
//   2. Prices every symbol any active strategy touches with one batched
//      request, using today's closing price. Every user gets the same,
//      unchoosable price: the close.
//   3. For each strategy, decides whether a rebalance is due and, if so,
//      sells first (to free cash) then buys, through place_paper_trade().
//   4. Records what it did and why, for the dashboard captions.
//
// One user's failure is caught and logged; it never stops the others.

import { alpaca, getTradableAssets } from "./alpaca";
import { getDailyBars, getLatestPrices } from "./marketdata";
import { nyDate, replay, type PaperTradeRow } from "./portfolio";
import {
  parseStrategy,
  planRebalance,
  rebalanceDue,
  type RunOrder,
  type StrategyRow,
} from "./strategies";
import { createAdminClient } from "./supabase/admin";

type Outcome =
  | { user: string; result: "rebalanced"; orders: RunOrder[]; reason: string }
  | { user: string; result: "not-due" | "on-target"; reason: string }
  | { user: string; result: "error"; reason: string };

export async function runStrategies(opts: { dryRun?: boolean } = {}) {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY is not set");

  const today = nyDate(new Date());
  const calendar: unknown[] = await alpaca(`/calendar?start=${today}&end=${today}`);
  if (calendar.length === 0) return { date: today, marketOpen: false, outcomes: [] as Outcome[] };

  const { data, error } = await admin
    .from("paper_strategies")
    .select("*, paper_accounts(starting_cash)")
    .eq("active", true);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (StrategyRow & { paper_accounts: { starting_cash: string | number } })[];
  if (rows.length === 0) return { date: today, marketOpen: true, outcomes: [] as Outcome[] };

  const tradable = new Set((await getTradableAssets()).map((a) => a.symbol));

  // Load every active user's trades, then price the union of symbols once.
  const tradesByUser = new Map<string, PaperTradeRow[]>();
  for (const row of rows) {
    const { data: trades, error: tErr } = await admin
      .from("paper_trades")
      .select("*")
      .eq("user_id", row.user_id)
      .order("executed_at");
    if (tErr) throw new Error(tErr.message);
    tradesByUser.set(row.user_id, (trades ?? []) as PaperTradeRow[]);
  }
  const symbols = new Set<string>();
  for (const row of rows) {
    for (const h of row.holdings ?? []) symbols.add(String(h.symbol).toUpperCase());
    for (const t of tradesByUser.get(row.user_id) ?? []) symbols.add(t.symbol);
  }
  const bars = await getDailyBars([...symbols], 3);
  const prices = new Map<string, number>();
  for (const s of symbols) {
    const close = bars.get(s)?.find((b) => b.t.slice(0, 10) === today)?.c;
    if (close) prices.set(s, close);
  }
  // A thin ticker can lack an IEX bar for the day; its last trade after the
  // close is the next best thing.
  const missing = [...symbols].filter((s) => !prices.has(s));
  if (missing.length) {
    for (const [s, p] of await getLatestPrices(missing)) {
      if (nyDate(p.asOf) === today) prices.set(s, p.price);
    }
  }

  const outcomes: Outcome[] = [];
  for (const row of rows) {
    const user = row.user_id;
    const note = async (text: string) => {
      if (!opts.dryRun) {
        await admin
          .from("paper_strategies")
          .update({ last_checked_at: new Date().toISOString(), last_check_note: text })
          .eq("user_id", user);
      }
    };
    const logRun = async (status: "rebalanced" | "error", reason: string, orders: RunOrder[] = []) => {
      if (!opts.dryRun) await admin.from("paper_strategy_runs").insert({ user_id: user, status, reason, orders });
    };

    try {
      // The row is user-writable, so validate it exactly as the API does.
      const parsed = parseStrategy(
        { ...row, presetKey: row.preset_key, driftPct: row.drift_pct },
        (s) => tradable.has(s),
      );
      if (!parsed.ok) throw new Error(`The saved strategy is invalid: ${parsed.error}`);
      const config = parsed.config;

      const { cash, holdings } = replay(tradesByUser.get(user) ?? [], Number(row.paper_accounts.starting_cash));
      const current = new Map([...holdings].map(([s, h]) => [s, h.qty]));
      const unpriced = [...new Set([...config.holdings.map((h) => h.symbol), ...current.keys()])].filter(
        (s) => !prices.has(s),
      );
      if (unpriced.length) throw new Error(`No closing price today for ${unpriced.join(", ")}, so nothing was traded.`);

      const equity = cash + [...current].reduce((sum, [s, qty]) => sum + qty * prices.get(s)!, 0);
      const weights = new Map([...current].map(([s, qty]) => [s, ((qty * prices.get(s)!) / equity) * 100]));
      const last = row.last_rebalanced_at ? nyDate(row.last_rebalanced_at) : null;
      const due = rebalanceDue(config, last, today, weights);

      if (!due.due) {
        await note(due.reason);
        outcomes.push({ user, result: "not-due", reason: due.reason });
        continue;
      }

      const plan = planRebalance(config, equity, current, prices);
      // Sells first, so their proceeds are in cash before the buys are checked.
      const orders: RunOrder[] = plan.orders
        .filter((o) => o.orderQty !== 0)
        .sort((a, b) => a.orderQty - b.orderQty)
        .map((o) => ({
          symbol: o.symbol,
          side: o.orderQty > 0 ? "buy" : "sell",
          qty: Math.abs(o.orderQty),
          price: o.price,
        }));

      if (orders.length === 0) {
        const text = `${due.reason} Already on target, nothing to trade.`;
        if (!opts.dryRun) {
          await admin.from("paper_strategies").update({ last_rebalanced_at: new Date().toISOString() }).eq("user_id", user);
        }
        await note(text);
        outcomes.push({ user, result: "on-target", reason: text });
        continue;
      }

      if (opts.dryRun) {
        outcomes.push({ user, result: "rebalanced", orders, reason: `${due.reason} (dry run, nothing traded)` });
        continue;
      }

      const filled: RunOrder[] = [];
      const failed: string[] = [];
      for (const o of orders) {
        const { error: tradeError } = await admin.rpc("place_paper_trade", {
          p_user_id: user,
          p_symbol: o.symbol,
          p_side: o.side,
          p_qty: o.qty,
          p_price: o.price,
        });
        if (tradeError) failed.push(`${o.side} ${o.qty} ${o.symbol} (${tradeError.message})`);
        else filled.push(o);
      }

      const reason = failed.length
        ? `${due.reason} ${filled.length} of ${orders.length} orders filled; failed: ${failed.join("; ")}.`
        : due.reason;
      await logRun(failed.length && !filled.length ? "error" : "rebalanced", reason, filled);
      await admin
        .from("paper_strategies")
        .update({
          last_rebalanced_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString(),
          last_check_note: `Rebalanced: ${filled.length} order${filled.length === 1 ? "" : "s"} at today's close.`,
        })
        .eq("user_id", user);
      outcomes.push({ user, result: "rebalanced", orders: filled, reason });
    } catch (err) {
      const reason = (err as Error).message;
      await logRun("error", reason).catch(() => {});
      await note(`Skipped: ${reason}`).catch(() => {});
      outcomes.push({ user, result: "error", reason });
    }
  }

  return { date: today, marketOpen: true, outcomes };
}
