// Implied volatility smile: a small, explicit model of how option-implied
// volatility varies across strikes, plus Black-Scholes so a hovered strike
// can show what that volatility means in dollars.
//
// The smile uses Gatheral's SVI ("stochastic volatility inspired") form,
// the parameterisation most desks actually fit to listed options:
//
//   k     = ln(K / S)                       log-moneyness
//   w(k)  = a + b · [ ρ (k − m) + sqrt((k − m)² + s²) ]     total variance = IV² × T
//   IV(K) = sqrt( w(k) / T )
//
//   a  level      — set so the at-the-money vol equals the "fear" dial
//   b  wings      — how fast variance grows away from the money (both sides)
//   ρ  skew       — −1 … 1; negative tilts the left (put) wing up and the
//                   right (call) wing down, which is the index-option shape
//   m  centre     — where the smile bottoms; a touch above spot in practice
//   s  smoothness — how rounded the bottom is (0 would be a sharp V)
//
// b is scaled by sqrt(T): the same wing steepness in variance terms gives a
// much steeper smile in vol terms for short expiries, which is what you see
// on a real screen — 7-day smiles are V-shaped, 1-year smiles are gentle.

export type SmileParams = {
  spot: number;
  fear: number; // ATM implied vol, e.g. 0.20 = 20%
  skew: number; // 0 = symmetric, 0.95 = extreme put skew (this is −ρ)
  wings: number; // b before the sqrt(T) scaling; 0.06 is a normal index market
  days: number; // days to expiry
  rate: number; // risk-free rate, continuous
};

const SMILE_CENTRE = 0.03; // m: the smile bottoms ~3% above spot
const SMILE_SMOOTHNESS = 0.08; // s

export const DEFAULT_SMILE: SmileParams = { spot: 100, fear: 0.2, skew: 0.8, wings: 0.06, days: 30, rate: 0.04 };

export type SmilePoint = { strike: number; iv: number; k: number };

export function impliedVol(strike: number, p: SmileParams): number {
  const T = p.days / 365;
  const rho = -p.skew;
  const b = p.wings * Math.sqrt(T);
  const shape = (k: number) => rho * (k - SMILE_CENTRE) + Math.sqrt((k - SMILE_CENTRE) ** 2 + SMILE_SMOOTHNESS ** 2);
  // Solve for a so that w(0) = fear² × T, i.e. the ATM vol is the dial.
  const a = p.fear * p.fear * T - b * shape(0);
  const w = a + b * shape(Math.log(strike / p.spot));
  return Math.sqrt(Math.max(w, 1e-6) / T);
}

export function smileCurve(p: SmileParams, lo = 0.7, hi = 1.3, steps = 60): SmilePoint[] {
  const pts: SmilePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const strike = Math.round(p.spot * (lo + ((hi - lo) * i) / steps) * 100) / 100;
    pts.push({ strike, iv: impliedVol(strike, p), k: Math.log(strike / p.spot) });
  }
  return pts;
}

// ---- Black-Scholes ---------------------------------------------------------

// Standard normal CDF via the Abramowitz–Stegun approximation of erf
// (max error ~1.5e-7 — plenty for a teaching tool).
export function normCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const a = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * a);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-a * a);
  return 0.5 * (1 + sign * erf);
}

export type OptionType = "call" | "put";

// Black-Scholes (no dividends):
//   d1 = [ln(S/K) + (r + σ²/2) T] / (σ √T),   d2 = d1 − σ √T
//   call = S N(d1) − K e^{−rT} N(d2)
//   put  = K e^{−rT} N(−d2) − S N(−d1)
// Delta is N(d1) for a call and N(d1) − 1 for a put: how much the option
// price moves per $1 move in the stock.
export function blackScholes(type: OptionType, S: number, K: number, T: number, r: number, sigma: number): { price: number; delta: number } {
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const disc = Math.exp(-r * T);
  if (type === "call") return { price: S * normCdf(d1) - K * disc * normCdf(d2), delta: normCdf(d1) };
  return { price: K * disc * normCdf(-d2) - S * normCdf(-d1), delta: normCdf(d1) - 1 };
}

// ITM / ATM / OTM for the chosen option type. "At the money" is a band of
// ±1% around spot so the label is readable while hovering near the centre.
export function moneyness(type: OptionType, strike: number, spot: number): "ITM" | "ATM" | "OTM" {
  const ratio = strike / spot;
  if (Math.abs(ratio - 1) <= 0.01) return "ATM";
  const callItm = ratio < 1;
  return (type === "call" ? callItm : !callItm) ? "ITM" : "OTM";
}
