import { NextResponse } from "next/server";
import { alpaca, placeMarketOrder } from "@/lib/alpaca";
import { computeRotationPlan, diffRebalance, type SectorKey } from "@/lib/rotation";
import { getLastRebalance, saveRebalance } from "@/lib/rotationStore";

async function runRebalance() {
  const account = await alpaca("/account");
  const plan = await computeRotationPlan(Number(account.equity));

  const lastState = await getLastRebalance();

  // Trust our own persisted record for "what do we currently hold," rather
  // than cross-referencing live Alpaca positions: a "day" market order we
  // just placed may not be filled yet (after-hours, weekend, or simple fill
  // lag), which would make a just-bought position look like zero shares and
  // trigger a duplicate buy attempt. The same paper account also holds the
  // other two satellites' positions (see projects/paper-trading/STRATEGY.md)
  // — that's the actual reason we diff against our own remembered symbol
  // list instead of the account's full position list, not live drift.
  const currentQtyBySymbol = new Map((lastState?.positions ?? []).map((p) => [p.symbol, p.qty]));

  const orderIntents = diffRebalance(currentQtyBySymbol, plan.targets);
  const month = new Date().toISOString().slice(0, 7);

  // Sells (incl. full exits) before buys, to free up buying power first.
  const ordered = [
    ...orderIntents.filter((o) => o.side === "sell"),
    ...orderIntents.filter((o) => o.side === "buy"),
  ];

  const placedOrders: unknown[] = [];
  const failedOrders: { symbol: string; side: string; qty: number; error: string }[] = [];
  const skippedOrders: { symbol: string; side: string; qty: number; reason: string }[] = [];
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
      const message = err instanceof Error ? err.message : String(err);
      // Alpaca rejects a repeat client_order_id — this specific rejection
      // means an earlier run (or an earlier order in this same run, if
      // retried) already placed this exact order. Treat it as already
      // applied rather than failed, so a retried/duplicate cron invocation
      // converges on the correct state instead of persisting a false
      // "nothing happened" record over a real prior success.
      if (message.includes("client_order_id must be unique")) {
        const prevQty = appliedQtyBySymbol.get(intent.symbol) ?? 0;
        appliedQtyBySymbol.set(
          intent.symbol,
          intent.side === "buy" ? prevQty + intent.qty : prevQty - intent.qty,
        );
        continue;
      }
      // Alpaca blocks an opposite-side order while an existing order for the
      // same symbol is still open (a "wash trade" safety check) — this
      // happens when this month's earlier buy hasn't filled yet (e.g. it was
      // placed after-hours) and a rebalance tries to trim it before that
      // fill lands. Not a failure: the position just stays at its prior size
      // for now, and resolves naturally once the pending order fills and a
      // future run re-diffs against the real quantity.
      if (message.includes("potential wash trade")) {
        skippedOrders.push({
          symbol: intent.symbol,
          side: intent.side,
          qty: intent.qty,
          reason: "an existing open order for this symbol hasn't filled yet",
        });
        continue;
      }
      failedOrders.push({ symbol: intent.symbol, side: intent.side, qty: intent.qty, error: message });
    }
  }

  const sectorBySymbol = new Map<string, SectorKey>(plan.targets.map((t) => [t.symbol, t.sector]));
  const nameBySymbol = new Map<string, string>(plan.targets.map((t) => [t.symbol, t.name]));
  for (const p of lastState?.positions ?? []) {
    if (!sectorBySymbol.has(p.symbol)) sectorBySymbol.set(p.symbol, p.sector);
    if (!nameBySymbol.has(p.symbol)) nameBySymbol.set(p.symbol, p.name ?? p.symbol);
  }
  const weightBySymbol = new Map(plan.targets.map((t) => [t.symbol, t.targetWeight]));

  const newPositions = Array.from(appliedQtyBySymbol.entries())
    .filter(([, qty]) => qty > 0)
    .map(([symbol, qty]) => ({
      symbol,
      sector: sectorBySymbol.get(symbol)!,
      name: nameBySymbol.get(symbol) ?? symbol,
      qty,
      weight: weightBySymbol.get(symbol) ?? 0,
    }));

  await saveRebalance({
    month,
    ranAt: new Date().toISOString(),
    positions: newPositions,
    sleeveDollars: plan.sleeveDollars,
  });

  return { month, picks: plan.picks, orders: orderIntents, placedOrders, failedOrders, skippedOrders };
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
