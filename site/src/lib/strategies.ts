// Paper portfolio strategies (supabase/migrations/0004_paper_strategies.sql).
//
// A strategy is a recipe: target weights per ticker plus a rebalance rule.
// Presets are just recipes written here; a custom strategy is the same shape
// filled in by the user, so one planner handles both.

export type Rebalance = "monthly" | "weekly" | "drift";
export type Holding = { symbol: string; weight: number };

export type StrategyConfig = {
  name: string;
  presetKey: string | null;
  holdings: Holding[];
  rebalance: Rebalance;
  driftPct: number | null;
};

export type Preset = StrategyConfig & { presetKey: string; description: string };

export const PRESETS: Preset[] = [
  {
    presetKey: "spy",
    name: "S&P 500 buy and hold",
    description: "Everything in SPY. The benchmark the dashboard chart already compares you to.",
    holdings: [{ symbol: "SPY", weight: 100 }],
    rebalance: "monthly",
    driftPct: null,
  },
  {
    presetKey: "sixty-forty",
    name: "60/40",
    description: "60% US stocks, 40% US bonds. The classic balanced portfolio.",
    holdings: [
      { symbol: "SPY", weight: 60 },
      { symbol: "BND", weight: 40 },
    ],
    rebalance: "monthly",
    driftPct: null,
  },
  {
    presetKey: "three-fund",
    name: "Three-fund portfolio",
    description: "Total US market, total international market, and bonds.",
    holdings: [
      { symbol: "VTI", weight: 50 },
      { symbol: "VXUS", weight: 30 },
      { symbol: "BND", weight: 20 },
    ],
    rebalance: "drift",
    driftPct: 5,
  },
  {
    presetKey: "diversified-core",
    name: "Diversified ETF core",
    description:
      "US large and small-mid caps, developed and emerging markets, bonds, real estate and gold.",
    holdings: [
      { symbol: "VOO", weight: 30 },
      { symbol: "VXF", weight: 10 },
      { symbol: "VEA", weight: 15 },
      { symbol: "VWO", weight: 5 },
      { symbol: "BND", weight: 25 },
      { symbol: "VNQ", weight: 5 },
      { symbol: "GLD", weight: 10 },
    ],
    rebalance: "drift",
    driftPct: 5,
  },
];

export const MAX_HOLDINGS = 20;

// Validates and normalises a strategy from untrusted input (the request
// body, or a row a user could have written directly). Returns the cleaned
// config or a message saying what's wrong.
export function parseStrategy(
  input: unknown,
  isTradable: (symbol: string) => boolean,
): { ok: true; config: StrategyConfig } | { ok: false; error: string } {
  const body = (input ?? {}) as Record<string, unknown>;
  const name = String(body.name ?? "").trim().slice(0, 60);
  if (!name) return { ok: false, error: "Give the strategy a name." };

  const rebalance = body.rebalance;
  if (rebalance !== "monthly" && rebalance !== "weekly" && rebalance !== "drift") {
    return { ok: false, error: "Rebalance must be monthly, weekly or on drift." };
  }
  let driftPct: number | null = null;
  if (rebalance === "drift") {
    driftPct = Number(body.driftPct);
    if (!(driftPct > 0 && driftPct <= 50)) {
      return { ok: false, error: "Drift threshold must be between 0 and 50 percentage points." };
    }
  }

  if (!Array.isArray(body.holdings) || body.holdings.length === 0) {
    return { ok: false, error: "Add at least one holding." };
  }
  if (body.holdings.length > MAX_HOLDINGS) {
    return { ok: false, error: `At most ${MAX_HOLDINGS} holdings.` };
  }
  const seen = new Set<string>();
  const holdings: Holding[] = [];
  for (const h of body.holdings as Record<string, unknown>[]) {
    const symbol = String(h?.symbol ?? "").trim().toUpperCase();
    const weight = Math.round(Number(h?.weight) * 10) / 10;
    if (!symbol) return { ok: false, error: "Every holding needs a ticker." };
    if (seen.has(symbol)) return { ok: false, error: `${symbol} is listed twice.` };
    if (!isTradable(symbol)) return { ok: false, error: `${symbol} isn't a tradable US stock or ETF.` };
    if (!(weight > 0 && weight <= 100)) {
      return { ok: false, error: `${symbol}'s weight must be between 0 and 100%.` };
    }
    seen.add(symbol);
    holdings.push({ symbol, weight });
  }
  const total = holdings.reduce((sum, h) => sum + h.weight, 0);
  if (total > 100.05) {
    return { ok: false, error: `Weights add up to ${total.toFixed(1)}%; they can't exceed 100%.` };
  }

  const presetKey = typeof body.presetKey === "string" && PRESETS.some((p) => p.presetKey === body.presetKey)
    ? body.presetKey
    : null;
  return { ok: true, config: { name, presetKey, holdings, rebalance, driftPct } };
}

export type PlannedOrder = {
  symbol: string;
  targetWeight: number; // percent
  currentWeight: number; // percent
  price: number;
  currentQty: number;
  targetQty: number;
  // Positive buys, negative sells.
  orderQty: number;
};

// The orders that would move an account from its current holdings to the
// strategy's targets, in whole shares. Anything the account holds that the
// strategy doesn't gets sold. Rounding down means a little cash is always
// left over, and buys never need more than the account has.
export function planRebalance(
  config: StrategyConfig,
  equity: number,
  current: Map<string, number>,
  prices: Map<string, number>,
): { orders: PlannedOrder[]; cashAfter: number; missingPrices: string[] } {
  const orders: PlannedOrder[] = [];
  const missingPrices: string[] = [];
  const symbols = new Set([...config.holdings.map((h) => h.symbol), ...current.keys()]);
  let cashAfter = equity;

  for (const symbol of symbols) {
    const price = prices.get(symbol);
    const currentQty = current.get(symbol) ?? 0;
    if (!price) {
      missingPrices.push(symbol);
      continue;
    }
    const targetWeight = config.holdings.find((h) => h.symbol === symbol)?.weight ?? 0;
    const targetQty = Math.floor((equity * targetWeight) / 100 / price);
    cashAfter -= targetQty * price;
    orders.push({
      symbol,
      targetWeight,
      currentWeight: equity ? ((currentQty * price) / equity) * 100 : 0,
      price,
      currentQty,
      targetQty,
      orderQty: targetQty - currentQty,
    });
  }

  orders.sort((a, b) => b.targetWeight - a.targetWeight || a.symbol.localeCompare(b.symbol));
  return { orders, cashAfter, missingPrices };
}
