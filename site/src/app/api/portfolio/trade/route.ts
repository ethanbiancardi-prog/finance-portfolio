import { NextResponse } from "next/server";
import { alpaca, getTradableAssets } from "@/lib/alpaca";
import { getQuote } from "@/lib/marketdata";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getUser } from "@/lib/supabase/server";

// Place a market order in the signed-in user's paper portfolio.
//
// The browser sends only symbol, side and quantity. The price is looked up
// here, from Alpaca, at the moment of the trade; nothing the browser sends
// can influence it. The write then goes through place_paper_trade(), which
// checks cash or shares under a row lock (0003_place_paper_trade.sql).

const MAX_QTY = 100_000;

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Trading is not switched on here yet (SUPABASE_SECRET_KEY is missing)." },
      { status: 503 },
    );
  }

  // While a strategy is on it owns the account; a manual trade would just be
  // undone at the next rebalance, and would muddy the strategy's record.
  const { data: strategy } = await (await createClient())
    .from("paper_strategies")
    .select("name, active")
    .maybeSingle();
  if (strategy?.active) {
    return NextResponse.json(
      {
        error: `"${strategy.name}" is managing this account, so manual trading is paused. Turn the strategy off to trade by hand.`,
      },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  const side = body.side;
  const qty = Number(body.qty);

  if (side !== "buy" && side !== "sell") {
    return NextResponse.json({ error: "Side must be buy or sell." }, { status: 400 });
  }
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
    return NextResponse.json(
      { error: `Quantity must be a whole number from 1 to ${MAX_QTY.toLocaleString()}.` },
      { status: 400 },
    );
  }
  const assets = await getTradableAssets();
  if (!assets.some((a) => a.symbol === symbol)) {
    return NextResponse.json({ error: `${symbol || "That"} isn't a tradable US stock or ETF.` }, { status: 400 });
  }

  // Market orders fill at the current price, which only means something
  // while the market is open. After hours the "latest price" is hours old,
  // and trading on it would let anyone buy at yesterday's close after good
  // news came out.
  const clock = await alpaca("/clock");
  if (!clock.is_open) {
    const opens = new Date(clock.next_open).toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    return NextResponse.json(
      { error: `The market is closed. Orders open again ${opens} ET.` },
      { status: 400 },
    );
  }

  let price: number;
  try {
    price = Math.round((await getQuote(symbol)).price * 10_000) / 10_000;
  } catch {
    return NextResponse.json({ error: `Couldn't get a live price for ${symbol}.` }, { status: 502 });
  }

  // Normally opened by the first dashboard visit; do it here too so a trade
  // never fails just because this request happened to come first.
  const supabase = await createClient();
  await supabase
    .from("paper_accounts")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });

  const { data, error } = await admin.rpc("place_paper_trade", {
    // From the verified session, never the request body.
    p_user_id: user.id,
    p_symbol: symbol,
    p_side: side,
    p_qty: qty,
    p_price: price,
  });

  if (error) {
    const message = error.message.startsWith("insufficient")
      ? error.message.replace(/^insufficient cash: (.*) available$/, (_, cash) =>
          `Not enough cash: ${qty} × $${price.toFixed(2)} costs $${(qty * price).toFixed(2)}, you have $${Number(cash).toFixed(2)}.`,
        ).replace(/^insufficient shares: (.*) held$/, (_, held) =>
          `You only hold ${Number(held)} ${symbol}.`,
        )
      : "The trade could not be saved.";
    return NextResponse.json({ error: message }, { status: error.message.startsWith("insufficient") ? 400 : 500 });
  }

  return NextResponse.json(data);
}
