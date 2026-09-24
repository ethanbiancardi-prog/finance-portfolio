import { NextResponse } from "next/server";
import { getTradableAssets } from "@/lib/alpaca";
import { getLatestPrices } from "@/lib/marketdata";
import { replay, type PaperTradeRow } from "@/lib/portfolio";
import { parseStrategy, planRebalance, type StrategyConfig } from "@/lib/strategies";
import { createClient, getUser } from "@/lib/supabase/server";

// The signed-in user's saved strategy.
//
//   GET    → { strategy } (null if none saved)
//   PUT    → save { name, presetKey, holdings, rebalance, driftPct }
//   DELETE → remove it
//   POST   → preview: the orders a config would place right now, without
//            saving or trading anything
//
// Everything runs as the user, so RLS limits it to their own row
// (0004_paper_strategies.sql). Nothing here trades: automatic rebalancing is
// a later step.

type StrategyRow = {
  name: string;
  preset_key: string | null;
  holdings: { symbol: string; weight: number }[];
  rebalance: StrategyConfig["rebalance"];
  drift_pct: string | number | null;
  updated_at: string;
};

const toConfig = (row: StrategyRow): StrategyConfig & { updatedAt: string } => ({
  name: row.name,
  presetKey: row.preset_key,
  holdings: row.holdings,
  rebalance: row.rebalance,
  driftPct: row.drift_pct == null ? null : Number(row.drift_pct),
  updatedAt: row.updated_at,
});

async function tradableCheck() {
  const symbols = new Set((await getTradableAssets()).map((a) => a.symbol));
  return (symbol: string) => symbols.has(symbol);
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("paper_strategies").select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ strategy: data ? toConfig(data as StrategyRow) : null });
}

export async function PUT(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = parseStrategy(await request.json().catch(() => null), await tradableCheck());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const c = parsed.config;

  const supabase = await createClient();
  // The strategy row hangs off the paper account, so make sure it exists.
  await supabase
    .from("paper_accounts")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });

  const { data, error } = await supabase
    .from("paper_strategies")
    .upsert({
      user_id: user.id,
      name: c.name,
      preset_key: c.presetKey,
      holdings: c.holdings,
      rebalance: c.rebalance,
      drift_pct: c.driftPct,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ strategy: toConfig(data as StrategyRow) });
}

export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const supabase = await createClient();
  const { error } = await supabase.from("paper_strategies").delete().eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ strategy: null });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = parseStrategy(await request.json().catch(() => null), await tradableCheck());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = await createClient();
  const [{ data: account }, { data: trades, error }] = await Promise.all([
    supabase.from("paper_accounts").select("starting_cash").maybeSingle(),
    supabase.from("paper_trades").select("*").order("executed_at"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { cash, holdings } = replay((trades ?? []) as PaperTradeRow[], Number(account?.starting_cash ?? 100000));
  const current = new Map([...holdings].map(([symbol, h]) => [symbol, h.qty]));
  const symbols = [...new Set([...parsed.config.holdings.map((h) => h.symbol), ...current.keys()])];

  let prices: Map<string, number>;
  try {
    prices = new Map([...(await getLatestPrices(symbols))].map(([s, p]) => [s, p.price]));
  } catch (err) {
    return NextResponse.json({ error: `Could not load prices: ${(err as Error).message}` }, { status: 502 });
  }

  const equity = cash + [...current].reduce((sum, [s, qty]) => sum + qty * (prices.get(s) ?? 0), 0);
  return NextResponse.json({ equity, ...planRebalance(parsed.config, equity, current, prices) });
}
