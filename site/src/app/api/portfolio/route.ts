import { NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { buildPortfolio, type PaperAccountRow, type PaperTradeRow } from "@/lib/portfolio";

// The signed-in user's paper portfolio: starting cash, current value,
// positions, and a daily equity curve against SPY.
//
// Reads run as the user, so Row Level Security limits them to that user's
// account and trades. See supabase/migrations/0002_paper_portfolios.sql.

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const supabase = await createClient();

  // First visit opens the account. ignoreDuplicates makes this a no-op on
  // every later visit (and safe if two requests race). The amount is not
  // sent: the column default supplies it, and the insert policy rejects any
  // other figure anyway.
  const { error: openError } = await supabase
    .from("paper_accounts")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  if (openError) return NextResponse.json({ error: openError.message }, { status: 500 });

  const [
    { data: account, error: accountError },
    { data: trades, error: tradesError },
    { data: strategy },
  ] = await Promise.all([
    supabase.from("paper_accounts").select("*").single(),
    supabase.from("paper_trades").select("*").order("executed_at"),
    supabase.from("paper_strategies").select("name, active").maybeSingle(),
  ]);
  if (accountError || !account) {
    return NextResponse.json({ error: accountError?.message ?? "No account" }, { status: 500 });
  }
  if (tradesError) return NextResponse.json({ error: tradesError.message }, { status: 500 });

  try {
    return NextResponse.json({
      ...(await buildPortfolio(account as PaperAccountRow, (trades ?? []) as PaperTradeRow[])),
      // The dashboard pauses its order form while a strategy runs the account.
      activeStrategy: strategy?.active ? strategy.name : null,
    });
  } catch (err) {
    // Market data is the only external call; say so rather than a bare 500.
    return NextResponse.json(
      { error: `Could not load market prices: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
