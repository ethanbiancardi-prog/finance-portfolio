// Calibration Tracker (/calibration): types and the scoring math. The table
// and its lock-in rules are in supabase/migrations/0007_prediction_logs.sql.

export type PredictionRow = {
  id: string;
  question: string;
  my_probability: number | string; // numeric columns can arrive as strings
  market_probability_at_entry: number | string;
  market_source: string;
  entry_date: string;
  resolution_date: string;
  outcome: boolean | null;
  resolved_at: string | null;
  reasoning: string;
  created_at: string;
};

export type Prediction = {
  id: string;
  question: string;
  myProbability: number; // 0-1
  marketProbability: number; // 0-1, what the market priced when I logged it
  marketSource: string;
  entryDate: string;
  resolutionDate: string;
  outcome: boolean | null; // null = still open
  resolvedAt: string | null;
  reasoning: string;
  // Open predictions logged from a Kalshi market: where that market is now.
  kalshi?: { status: string; probability: number | null; result: "yes" | "no" | null };
  // Kalshi-linked predictions: the market's probability, one point per day
  // (prediction_prices). The entry price is the first point.
  history?: { date: string; probability: number }[];
};

export const rowToPrediction = (r: PredictionRow): Prediction => ({
  id: r.id,
  question: r.question,
  myProbability: Number(r.my_probability),
  marketProbability: Number(r.market_probability_at_entry),
  marketSource: r.market_source,
  entryDate: r.entry_date,
  resolutionDate: r.resolution_date,
  outcome: r.outcome,
  resolvedAt: r.resolved_at,
  reasoning: r.reasoning,
});

export type Scores = {
  resolved: number;
  // null until at least one prediction has resolved.
  myBrier: number | null;
  marketBrier: number | null;
  // marketBrier - myBrier: positive means I beat the market (lower is better).
  edge: number | null;
};

// Brier score: the average of (probability - outcome)^2, where outcome is
// 1 if it happened and 0 if it didn't. 0 is perfect, 0.25 is what always
// saying 50% earns, 1 is confidently wrong every time. Lower is better.
export function brier(pairs: { p: number; outcome: boolean }[]): number | null {
  if (pairs.length === 0) return null;
  const total = pairs.reduce((sum, { p, outcome }) => sum + (p - (outcome ? 1 : 0)) ** 2, 0);
  return total / pairs.length;
}

export function score(predictions: Prediction[]): Scores {
  const done = predictions.filter((p): p is Prediction & { outcome: boolean } => p.outcome !== null);
  const myBrier = brier(done.map((p) => ({ p: p.myProbability, outcome: p.outcome })));
  const marketBrier = brier(done.map((p) => ({ p: p.marketProbability, outcome: p.outcome })));
  return {
    resolved: done.length,
    myBrier,
    marketBrier,
    edge: myBrier === null || marketBrier === null ? null : marketBrier - myBrier,
  };
}

// Below this many resolved predictions, luck dominates the comparison.
export const MEANINGFUL_SAMPLE = 100;

// A calibration (reliability) table: group predictions into 10%-wide bins by
// the probability given, then compare each bin's average probability with
// how often those events actually happened. Perfectly calibrated means the
// two match: things called at ~70% happen ~70% of the time.
export type CalibrationBin = {
  lo: number; // bin covers [lo, lo + 0.1); the last bin includes 1.0
  count: number;
  avgProbability: number;
  hitRate: number; // share that resolved yes
};

export function calibrationBins(points: { p: number; outcome: boolean }[]): CalibrationBin[] {
  const bins = Array.from({ length: 10 }, (_, i) => ({ lo: i / 10, count: 0, sumP: 0, yes: 0 }));
  for (const { p, outcome } of points) {
    const b = bins[Math.min(9, Math.floor(p * 10))];
    b.count++;
    b.sumP += p;
    if (outcome) b.yes++;
  }
  return bins
    .filter((b) => b.count > 0)
    .map((b) => ({ lo: b.lo, count: b.count, avgProbability: b.sumP / b.count, hitRate: b.yes / b.count }));
}
