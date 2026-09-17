import { resolveTickerNames } from "@/lib/edgar";
import { getDailyBars, type DailyBar } from "@/lib/marketdata";
import { SECTOR_KEYS, SECTORS, type SectorKey as StockSectorKey } from "@/lib/sectors";

// Every constant here is a deliberate, tunable choice — see the comment on
// each — not a magic number. Tune them in one place if the strategy changes.
// The strategy itself is written up in projects/paper-trading/STRATEGY.md.

// The eight stock sectors from lib/sectors.ts. "leveraged" is the leveraged
// index sleeve (not a stock sector, but it's grouped like one on the
// dashboard); "indexes" is kept so rebalance records saved before Sep 2026
// still type-check.
export const ROTATION_SECTOR_KEYS = [...SECTOR_KEYS, "leveraged", "indexes"] as const;
export type SectorKey = StockSectorKey | "leveraged" | "indexes";

// ~3 months of trading days — long enough to filter out single-week noise,
// short enough that the book actually turns over month to month.
export const LOOKBACK_TRADING_DAYS = 63;

// --- Momentum sleeve -------------------------------------------------------
// Top N stocks by risk-adjusted momentum across the whole universe, not per
// sector: an aggressive book should own the strongest trends wherever they
// are, not the best name in a sector that's falling. The per-sector cap
// stops it becoming a single-sector bet (10 energy names in an oil spike).
export const TOP_N_OVERALL = 10;
export const MAX_PER_SECTOR = 3;
// No single stock may exceed this share of its sleeve. At 10 equal-weight
// picks (10% each) it isn't binding; it's a ceiling for when fewer names
// have usable price data.
export const POSITION_CAP_PCT = 0.2;
// Share of account equity in the momentum sleeve.
export const MOMENTUM_SLEEVE_PCT = 0.6;

// --- Leveraged index sleeve -----------------------------------------------
// 3x daily-leveraged ETFs: TQQQ tracks 3x the Nasdaq-100, SOXL 3x the
// semiconductor index. They compound daily, so they beat 3x the index in a
// steady uptrend and lose far more than 3x in a choppy or falling one (TQQQ
// fell 79% in 2022) — which is exactly why the regime filter below exists.
export const LEVERAGED_TARGETS: { symbol: string; name: string; weight: number }[] = [
  { symbol: "TQQQ", name: "ProShares UltraPro QQQ (3x Nasdaq-100)", weight: 0.2 },
  { symbol: "SOXL", name: "Direxion Daily Semiconductor Bull 3x", weight: 0.1 },
];

// --- Regime filter (the circuit breaker) ----------------------------------
// If SPY closes below its 200-day moving average at rebalance time, the
// market is in a downtrend by the most common trend-following definition:
// the leveraged sleeve goes to cash and the momentum sleeve shrinks. Momentum
// strategies suffer their worst crashes at trend reversals, and 3x ETFs
// bleed in choppy markets — this rule side-steps the worst of both.
export const REGIME_SMA_DAYS = 200;
export const RISK_OFF_TOP_N = 5;
export const RISK_OFF_MOMENTUM_SLEEVE_PCT = 0.3;

// The remaining ~10% of equity stays in cash as a buffer: 3x ETFs can gap
// several percent overnight, and the run refuses to buy on margin.

export type Candidate = { symbol: string; sector: SectorKey; name: string };
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
  name: string;
  targetWeight: number; // share of account equity, not of a sleeve
  targetQty: number;
};
export type Regime = { riskOn: boolean; spyClose: number; spySma: number; asOf: string };

// The curated tickers per sector, with company names looked up from SEC's
// ticker file (one cached fetch for all of them).
export async function buildUniverse(): Promise<Candidate[]> {
  const symbolsBySector = SECTOR_KEYS.map((key): [SectorKey, readonly string[]] => [key, SECTORS[key].tickers]);
  const names = await resolveTickerNames(symbolsBySector.flatMap(([, symbols]) => [...symbols]));
  return symbolsBySector.flatMap(([sector, symbols]) =>
    symbols.map((symbol) => ({ symbol, sector, name: names.get(symbol) ?? symbol })),
  );
}

// SPY's last close vs. its 200-day simple moving average. Needs a little
// more than 200 bars; getDailyBars pads the calendar window for that.
export function computeRegime(spyBars: DailyBar[]): Regime {
  const closes = spyBars.map((b) => b.c);
  const window = closes.slice(-REGIME_SMA_DAYS);
  const spySma = window.reduce((sum, c) => sum + c, 0) / window.length;
  const spyClose = closes[closes.length - 1];
  return { riskOn: spyClose >= spySma, spyClose, spySma, asOf: spyBars[spyBars.length - 1].t };
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

// Walk the whole universe from strongest momentum down, taking a name
// unless its sector already has maxPerSector picks. A stock listed in two
// sectors (Sustainability overlaps several) is only taken once, under
// whichever sector it's seen first.
export function rankAndPick(scored: ScoredCandidate[], topN: number, maxPerSector: number): ScoredCandidate[] {
  const picks: ScoredCandidate[] = [];
  const taken = new Set<string>();
  const perSector = new Map<SectorKey, number>();
  for (const s of [...scored].sort((a, b) => b.momentumScore - a.momentumScore)) {
    if (picks.length >= topN) break;
    if (taken.has(s.symbol)) continue;
    if ((perSector.get(s.sector) ?? 0) >= maxPerSector) continue;
    taken.add(s.symbol);
    perSector.set(s.sector, (perSector.get(s.sector) ?? 0) + 1);
    picks.push(s);
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

export function buildTargetPositions(picks: Pick[], sleeveDollars: number, accountEquity: number): TargetPosition[] {
  return picks.map((p) => ({
    symbol: p.symbol,
    sector: p.sector,
    name: p.name,
    targetWeight: (p.weight * sleeveDollars) / accountEquity,
    targetQty: Math.floor((p.weight * sleeveDollars) / p.lastPrice),
  }));
}

// Leveraged sleeve targets — fixed weights, sized off equity, or nothing at
// all when the regime is risk-off.
export function buildLeveragedTargets(
  regime: Regime,
  lastPriceBySymbol: Map<string, number>,
  accountEquity: number,
): TargetPosition[] {
  if (!regime.riskOn) return [];
  return LEVERAGED_TARGETS.flatMap((t) => {
    const price = lastPriceBySymbol.get(t.symbol);
    if (!price) return [];
    return [
      {
        symbol: t.symbol,
        sector: "leveraged" as const,
        name: t.name,
        targetWeight: t.weight,
        targetQty: Math.floor((t.weight * accountEquity) / price),
      },
    ];
  });
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
export async function computeRotationPlan(accountEquity: number) {
  const universe = await buildUniverse();
  const leveragedSymbols = LEVERAGED_TARGETS.map((t) => t.symbol);
  const [bars, regimeBars] = await Promise.all([
    getDailyBars(
      [...new Set([...universe.map((c) => c.symbol), ...leveragedSymbols])], // overlapping sectors share bars
      LOOKBACK_TRADING_DAYS,
    ),
    getDailyBars(["SPY"], REGIME_SMA_DAYS + 5),
  ]);
  const regime = computeRegime(regimeBars.get("SPY") ?? []);

  const scored = scoreCandidates(universe, bars);
  const topN = regime.riskOn ? TOP_N_OVERALL : RISK_OFF_TOP_N;
  const sleevePct = regime.riskOn ? MOMENTUM_SLEEVE_PCT : RISK_OFF_MOMENTUM_SLEEVE_PCT;
  const ranked = rankAndPick(scored, topN, MAX_PER_SECTOR);
  const picks = applyPositionCap(ranked, POSITION_CAP_PCT);
  const sleeveDollars = accountEquity * sleevePct;

  const lastPriceBySymbol = new Map<string, number>(
    leveragedSymbols.map((sym) => [sym, bars.get(sym)?.at(-1)?.c ?? 0]),
  );
  const leveraged = buildLeveragedTargets(regime, lastPriceBySymbol, accountEquity);
  const targets = [...buildTargetPositions(picks, sleeveDollars, accountEquity), ...leveraged];

  return { regime, scored, picks, targets, leveraged, sleeveDollars };
}
