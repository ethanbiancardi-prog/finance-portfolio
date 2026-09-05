import { INDUSTRY_CATEGORIES, getCompaniesBySic } from "@/lib/edgar";
import { getDailyBars, type DailyBar } from "@/lib/marketdata";

// Every constant here is a deliberate, tunable choice — see the comment on
// each — not a magic number. Tune them in one place if the strategy changes.
export const ROTATION_SECTOR_KEYS = ["tech", "biotech", "consumer"] as const;
export type SectorKey = (typeof ROTATION_SECTOR_KEYS)[number];

// Top N of EDGAR's ~40-per-sector (sorted by public float) we bother scoring.
// Keeps the monthly momentum lookup to ~45 tickers instead of ~120.
export const UNIVERSE_SIZE_PER_SECTOR = 15;
// ~3 months of trading days — long enough to filter out single-week noise,
// short enough that the "rotation" actually rotates month to month.
export const LOOKBACK_TRADING_DAYS = 63;
// Picks per sector. 2 x 3 sectors = 6 total positions.
export const TOP_N_PER_SECTOR = 2;
// No single stock may exceed this share of the rotation sleeve. At
// TOP_N_PER_SECTOR=2 the natural equal weight (~16.7%) already respects
// this — the cap exists as a safety ceiling for when a sector returns fewer
// usable candidates than TOP_N_PER_SECTOR (thin/missing price data).
export const POSITION_CAP_PCT = 0.2;
// % of current account equity dedicated to this strategy. See
// projects/paper-trading/STRATEGY.md "Satellite 3" for the TODO(ethan) on
// tuning this against the other satellites.
export const DEFAULT_ROTATION_SLEEVE_PCT = 0.1;

export type Candidate = { symbol: string; sector: SectorKey };
export type ScoredCandidate = Candidate & {
  trailingReturn: number;
  volatility: number;
  momentumScore: number;
  lastPrice: number;
};
export type Pick = ScoredCandidate & { weight: number; capped: boolean };
export type TargetPosition = {
  symbol: string;
  sector: SectorKey;
  targetWeight: number;
  targetQty: number;
};

export async function buildUniverse(): Promise<Candidate[]> {
  const bySector = await Promise.all(
    ROTATION_SECTOR_KEYS.map(async (sector) => {
      const companies = await getCompaniesBySic(INDUSTRY_CATEGORIES[sector].sic);
      return companies.slice(0, UNIVERSE_SIZE_PER_SECTOR).map((c) => ({
        symbol: c.ticker,
        sector,
      }));
    }),
  );
  return bySector.flat();
}

// Momentum = trailing return over the lookback window, divided by the
// standard deviation of daily returns over that same window — a
// risk-adjusted momentum score, similar in spirit to a Sharpe ratio: a stock
// up 20% in a smooth climb ranks above one up 20% in a choppy ride, since
// the smooth climb is more likely a persistent trend than noise. Volatility
// here is NOT annualized (no x sqrt(252)) — this score only ranks stocks
// against each other over the same window, and a constant scale factor
// doesn't change the ranking.
export function computeMomentum(
  bars: DailyBar[],
): { trailingReturn: number; volatility: number; momentumScore: number } | null {
  if (bars.length < 2) return null;

  const closes = bars.map((b) => b.c);
  const dailyReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    dailyReturns.push(closes[i] / closes[i - 1] - 1);
  }

  const trailingReturn = closes[closes.length - 1] / closes[0] - 1;
  const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (dailyReturns.length - 1);
  const volatility = Math.sqrt(variance);

  // Zero volatility means every close was identical — halted or illiquid,
  // not a real trend to rank.
  if (volatility === 0) return null;

  return { trailingReturn, volatility, momentumScore: trailingReturn / volatility };
}

export function scoreCandidates(
  candidates: Candidate[],
  barsBySymbol: Map<string, DailyBar[]>,
): ScoredCandidate[] {
  const scored: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    const bars = barsBySymbol.get(candidate.symbol);
    if (!bars || bars.length === 0) continue;

    const momentum = computeMomentum(bars);
    if (!momentum) continue;

    scored.push({ ...candidate, ...momentum, lastPrice: bars[bars.length - 1].c });
  }
  return scored;
}

export function rankAndPick(scored: ScoredCandidate[], topN: number): ScoredCandidate[] {
  const picks: ScoredCandidate[] = [];
  for (const sector of ROTATION_SECTOR_KEYS) {
    const inSector = scored
      .filter((s) => s.sector === sector)
      .sort((a, b) => b.momentumScore - a.momentumScore);
    picks.push(...inSector.slice(0, topN));
  }
  return picks;
}

// Starts everyone at equal weight, then repeatedly clips anyone over the cap
// and redistributes their excess pro-rata across the still-uncapped names
// (the same "water-filling" idea capped indices use). If everyone ends up
// capped, the leftover excess is simply left undeployed as sleeve cash
// rather than pushed over the cap.
export function applyPositionCap(picks: ScoredCandidate[], capPct: number): Pick[] {
  if (picks.length === 0) return [];

  const weights = new Map<string, number>(picks.map((p) => [p.symbol, 1 / picks.length]));
  const cappedSymbols = new Set<string>();

  for (let iteration = 0; iteration < picks.length; iteration++) {
    const overCap = picks.filter((p) => weights.get(p.symbol)! > capPct && !cappedSymbols.has(p.symbol));
    if (overCap.length === 0) break;

    let excess = 0;
    for (const p of overCap) {
      excess += weights.get(p.symbol)! - capPct;
      weights.set(p.symbol, capPct);
      cappedSymbols.add(p.symbol);
    }

    const uncapped = picks.filter((p) => !cappedSymbols.has(p.symbol));
    const uncappedTotal = uncapped.reduce((sum, p) => sum + weights.get(p.symbol)!, 0);
    if (uncappedTotal === 0) break;

    for (const p of uncapped) {
      const share = weights.get(p.symbol)! / uncappedTotal;
      weights.set(p.symbol, weights.get(p.symbol)! + excess * share);
    }
  }

  return picks.map((p) => ({
    ...p,
    weight: weights.get(p.symbol)!,
    capped: cappedSymbols.has(p.symbol),
  }));
}

export function buildTargetPositions(picks: Pick[], sleeveDollars: number): TargetPosition[] {
  return picks.map((p) => ({
    symbol: p.symbol,
    sector: p.sector,
    targetWeight: p.weight,
    targetQty: Math.floor((p.weight * sleeveDollars) / p.lastPrice),
  }));
}

// Sells (including full exits for dropped picks) are listed before buys so
// the caller can free up buying power first.
export function diffRebalance(
  currentQtyBySymbol: Map<string, number>,
  targets: TargetPosition[],
): { symbol: string; side: "buy" | "sell"; qty: number }[] {
  const targetQtyBySymbol = new Map(targets.map((t) => [t.symbol, t.targetQty]));
  const orders: { symbol: string; side: "buy" | "sell"; qty: number }[] = [];

  for (const [symbol, currentQty] of currentQtyBySymbol) {
    const targetQty = targetQtyBySymbol.get(symbol) ?? 0;
    if (targetQty < currentQty) orders.push({ symbol, side: "sell", qty: currentQty - targetQty });
  }
  for (const [symbol, targetQty] of targetQtyBySymbol) {
    const currentQty = currentQtyBySymbol.get(symbol) ?? 0;
    if (targetQty > currentQty) orders.push({ symbol, side: "buy", qty: targetQty - currentQty });
  }

  return orders;
}

// Read-only orchestrator: builds this month's target basket without placing
// any orders or touching persisted state. Used by GET /status (display
// only) and by the first half of POST/GET /run (before it diffs and trades).
export async function computeRotationPlan(
  accountEquity: number,
  sleevePct: number = DEFAULT_ROTATION_SLEEVE_PCT,
) {
  const universe = await buildUniverse();
  const bars = await getDailyBars(
    universe.map((c) => c.symbol),
    LOOKBACK_TRADING_DAYS,
  );
  const scored = scoreCandidates(universe, bars);
  const ranked = rankAndPick(scored, TOP_N_PER_SECTOR);
  const picks = applyPositionCap(ranked, POSITION_CAP_PCT);
  const sleeveDollars = accountEquity * sleevePct;
  const targets = buildTargetPositions(picks, sleeveDollars);

  return { scored, picks, targets, sleeveDollars };
}
