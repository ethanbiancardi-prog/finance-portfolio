// The showcase portfolio: Ethan's own dashboard paper account (traded by hand
// from /dashboard), shown publicly on /paper-trading and the homepage.
//
// Visitors aren't signed in as Ethan, so Row Level Security would hide his
// rows. Instead the server reads exactly one account, the one named by
// SHOWCASE_USER_ID, with the admin client. The user id never leaves the
// server and nothing here can write. The result is cached so page loads
// don't each re-price the portfolio.

import { getRedis, kvConfigured } from "./kv";
import { getDailyBars } from "./marketdata";
import { buildPortfolio, type PaperAccountRow, type PaperTradeRow, type PortfolioSummary } from "./portfolio";
import { computeRiskMetrics, type RiskMetrics } from "./riskMetrics";
import { REPORT_KEY, type RunReport } from "./signalTrader";
import type { AlgoStatus, SignalOrder } from "./signalTraderRules";
import { createAdminClient } from "./supabase/admin";

export type Showcase = PortfolioSummary & { risk: RiskMetrics | null; algo: AlgoStatus };

const CACHE_KEY = "showcase:portfolio:v2";
const TTL_SECONDS = 60 * 2; // live prices, but no need to re-price on every visit

async function loadShowcase(): Promise<Showcase | null> {
  const userId = process.env.SHOWCASE_USER_ID;
  const admin = createAdminClient();
  if (!userId || !admin) return null;

  const [{ data: account }, { data: trades, error }] = await Promise.all([
    admin.from("paper_accounts").select("user_id, starting_cash, created_at").eq("user_id", userId).maybeSingle(),
    admin.from("paper_trades").select("id, symbol, side, qty, price, executed_at").eq("user_id", userId).order("executed_at"),
  ]);
  if (!account || error) return null;

  const portfolio = await buildPortfolio(account as PaperAccountRow, (trades ?? []) as PaperTradeRow[]);

  // Sharpe / volatility / drawdown / beta from the daily equity curve. Needs
  // a few days of history; before that they'd be noise, so leave them out.
  let risk: RiskMetrics | null = null;
  if (portfolio.history.length >= 5) {
    const spyBars = (await getDailyBars(["SPY"], portfolio.history.length + 10)).get("SPY") ?? [];
    risk = computeRiskMetrics(
      portfolio.history.map((p) => ({ date: p.date, equity: p.equity })),
      spyBars,
    );
  }
  return { ...portfolio, risk, algo: await loadAlgoStatus(userId) };
}

// The Signal Trader's side of the page: its last check (Redis, written by
// every scheduled run) and its recent orders with their reasons (the runs
// it logged to paper_strategy_runs).
async function loadAlgoStatus(userId: string): Promise<AlgoStatus> {
  const admin = createAdminClient()!;
  const [report, { data: runs }] = await Promise.all([
    kvConfigured() ? getRedis().get<RunReport>(REPORT_KEY).catch(() => null) : Promise.resolve(null),
    admin
      .from("paper_strategy_runs")
      .select("ran_at, orders, reason")
      .eq("user_id", userId)
      .like("reason", "Signal Trader:%")
      .order("ran_at", { ascending: false })
      .limit(10),
  ]);
  return {
    live: process.env.SIGNAL_TRADER_ENABLED === "true",
    lastCheck: report ? { ranAt: report.ranAt, note: report.note, orders: report.orders.length } : null,
    recent: (runs ?? []).flatMap((r) => (r.orders as SignalOrder[]).map((o) => ({ ...o, ranAt: r.ran_at as string }))).slice(0, 25),
  };
}

export async function getShowcase(): Promise<Showcase | null> {
  if (kvConfigured()) {
    try {
      const cached = await getRedis().get<Showcase>(CACHE_KEY);
      if (cached) return cached;
    } catch {
      // Cache read failed — load it live this once.
    }
  }
  try {
    const showcase = await loadShowcase();
    if (showcase && kvConfigured()) {
      await getRedis().set(CACHE_KEY, showcase, { ex: TTL_SECONDS }).catch(() => {});
    }
    return showcase;
  } catch {
    return null;
  }
}
