import { NextResponse } from "next/server";
import { alpaca, placeMarketOrder } from "@/lib/alpaca";
import { computeRotationPlan, diffRebalance, type SectorKey } from "@/lib/rotation";
import { getLastRebalance, saveRebalance } from "@/lib/rotationStore";

type AlpacaPosition = { symbol: string; qty: string };

async function runRebalance() {
  const account = await alpaca("/account");
  const plan = await computeRotationPlan(Number(account.equity));

  const lastState = await getLastRebalance();
  const accountPositions: AlpacaPosition[] = await alpaca("/positions");
  const liveQtyBySymbol = new Map(
    accountPositions.map((p) => [p.symbol, Math.max(0, Math.floor(Number(p.qty)))]),
  );

  // Only diff against symbols this strategy remembers owning — the same
  // paper account also holds the other two satellites' positions (see
  // projects/paper-trading/STRATEGY.md), and a blind read of every open
  // position would risk selling shares this strategy doesn't own.
  const currentQtyBySymbol = new Map(
    (lastState?.positions ?? []).map((p) => [p.symbol, liveQtyBySymbol.get(p.symbol) ?? 0]),
  );

  const orderIntents = diffRebalance(currentQtyBySymbol, plan.targets);
  const month = new Date().toISOString().slice(0, 7);

  // Sells (incl. full exits) before buys, to free up buying power first.
  const ordered = [
    ...orderIntents.filter((o) => o.side === "sell"),
    ...orderIntents.filter((o) => o.side === "buy"),
  ];

  const placedOrders: unknown[] = [];
  const failedOrders: { symbol: string; side: string; qty: number; error: string }[] = [];
  // Tracks what actually executed, starting from the prior known state — if
  // an order fails (e.g. insufficient buying power), we must persist reality,
  // not the full intended target, or next month's diff would be wrong.
  const appliedQtyBySymbol = new Map(currentQtyBySymbol);

  for (const intent of ordered) {
    const clientOrderId = `rotation-${month}-${intent.symbol}-${intent.side}`;
    try {
      const order = await placeMarketOrder(intent.symbol, intent.qty, intent.side, clientOrderId);
      placedOrders.push(order);
      const prevQty = appliedQtyBySymbol.get(intent.symbol) ?? 0;
      appliedQtyBySymbol.set(
        intent.symbol,
        intent.side === "buy" ? prevQty + intent.qty : prevQty - intent.qty,
      );
    } catch (err) {
      failedOrders.push({
        symbol: intent.symbol,
        side: intent.side,
        qty: intent.qty,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const sectorBySymbol = new Map<string, SectorKey>(plan.targets.map((t) => [t.symbol, t.sector]));
  for (const p of lastState?.positions ?? []) {
    if (!sectorBySymbol.has(p.symbol)) sectorBySymbol.set(p.symbol, p.sector);
  }
  const weightBySymbol = new Map(plan.targets.map((t) => [t.symbol, t.targetWeight]));

  const newPositions = Array.from(appliedQtyBySymbol.entries())
    .filter(([, qty]) => qty > 0)
    .map(([symbol, qty]) => ({
      symbol,
      sector: sectorBySymbol.get(symbol)!,
      qty,
      weight: weightBySymbol.get(symbol) ?? 0,
    }));

  await saveRebalance({
    month,
    ranAt: new Date().toISOString(),
    positions: newPositions,
    sleeveDollars: plan.sleeveDollars,
  });

  return { month, picks: plan.picks, orders: orderIntents, placedOrders, failedOrders };
}

// Vercel Cron always sends GET requests. This is the one route on the site
// that executes trades with no human in the loop, so — unlike every other
// route here — it's worth gating behind a shared secret.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runRebalance());
}

// Manual trigger for the "Run Rebalance Now" demo button — no secret check,
// consistent with every other mutating route on this site having none.
export async function POST() {
  return NextResponse.json(await runRebalance());
}
