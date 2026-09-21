// Factor risk attribution: split a multi-asset portfolio's risk into the
// macro factors that drive it.
//
// The model is a linear factor model — the same thing as running a multiple
// regression of each asset class's returns on the factors:
//
//   r_asset = alpha + beta_mkt × MARKET + beta_rate × RATES + beta_inf × INFLATION + noise
//
// A portfolio's betas are the weighted average of its holdings' betas, and
// its variance splits into "explained by the factors" plus "asset-specific
// noise". The loadings, factor volatilities and correlations below are
// stylised long-run figures for broad asset classes (rounded from the kind
// of numbers in BlackRock's and MSCI's published factor work) — good enough
// to teach the mechanics, not a live risk model.

export type AssetKey = "equities" | "bonds" | "commodities";
export type FactorKey = "market" | "rates" | "inflation";

export const FACTORS: { key: FactorKey; label: string; short: string; color: string; describe: string }[] = [
  { key: "market", label: "Market beta", short: "Equity", color: "#a5b4fc", describe: "Global equity market moves — the growth / risk-appetite factor." },
  { key: "rates", label: "Interest rate duration", short: "Rates", color: "#7dd3fc", describe: "Parallel shifts in real interest rates. Long-duration assets fall when rates rise." },
  { key: "inflation", label: "Macro inflation shock", short: "Inflation", color: "#fcd34d", describe: "Surprise inflation. Hurts nominal bonds, helps real assets like commodities." },
];

export const RESIDUAL_COLOR = "#a1a1aa";

export type Asset = {
  key: AssetKey;
  label: string;
  // Factor loadings (betas). Units: % return per 1% move in the factor.
  betas: Record<FactorKey, number>;
  // Annualised volatility of the part of the asset's return the factors do
  // not explain (the regression residual).
  residualVol: number;
  // Assumed expected excess return per year, before factor premia.
  expectedReturn: number;
};

export const ASSETS: Asset[] = [
  { key: "equities", label: "Equities", betas: { market: 1.0, rates: -0.3, inflation: -0.2 }, residualVol: 0.03, expectedReturn: 0.055 },
  { key: "bonds", label: "Bonds", betas: { market: 0.05, rates: 1.0, inflation: -0.6 }, residualVol: 0.015, expectedReturn: 0.015 },
  { key: "commodities", label: "Commodities", betas: { market: 0.25, rates: -0.1, inflation: 1.0 }, residualVol: 0.12, expectedReturn: 0.02 },
];

// Factor volatilities (annualised) and correlations. Rates and inflation
// are defined so that "rates" is a move in bond prices (duration), which is
// why it correlates negatively with inflation surprises.
const FACTOR_VOL: Record<FactorKey, number> = { market: 0.16, rates: 0.06, inflation: 0.05 };
const FACTOR_CORR: Record<FactorKey, Record<FactorKey, number>> = {
  market: { market: 1, rates: 0.1, inflation: -0.15 },
  rates: { market: 0.1, rates: 1, inflation: -0.4 },
  inflation: { market: -0.15, rates: -0.4, inflation: 1 },
};
// Expected annual reward for bearing each factor (the factor risk premium).
// Alpha is what is left of an asset's expected return after these are paid.
const FACTOR_PREMIUM: Record<FactorKey, number> = { market: 0.05, rates: 0.01, inflation: 0.0 };

const FACTOR_KEYS = FACTORS.map((f) => f.key);

// Covariance = corr × vol_i × vol_j
function factorCov(a: FactorKey, b: FactorKey) {
  return FACTOR_CORR[a][b] * FACTOR_VOL[a] * FACTOR_VOL[b];
}

export type Attribution = {
  weights: Record<AssetKey, number>;
  loadings: Record<FactorKey, number>; // portfolio betas
  volatility: number; // annualised, total
  factorVolatility: number; // annualised, explained part only
  rSquared: number;
  alpha: number;
  expectedReturn: number;
  systemicBeta: number;
  // Share of total variance from each factor (can be slightly negative when
  // a factor hedges another) plus the residual; sums to 1.
  contributions: { key: FactorKey | "residual"; label: string; color: string; share: number; volShare: number }[];
};

export function attribute(weightsPct: Record<AssetKey, number>): Attribution {
  const total = Object.values(weightsPct).reduce((s, w) => s + w, 0) || 1;
  const w = Object.fromEntries(ASSETS.map((a) => [a.key, weightsPct[a.key] / total])) as Record<AssetKey, number>;

  // Portfolio loading on each factor = Σ weight × asset beta.
  const loadings = Object.fromEntries(FACTOR_KEYS.map((f) => [f, ASSETS.reduce((s, a) => s + w[a.key] * a.betas[f], 0)])) as Record<FactorKey, number>;

  // Factor variance = bᵀ Σ_f b, expanded as Σ_i Σ_j b_i b_j cov(i, j).
  // Each factor's contribution is its row of that double sum: b_i × (Σ_f b)_i,
  // which is the loading times the factor's marginal contribution. The rows
  // add up to the whole, which is what makes it an attribution.
  const factorVar: Record<FactorKey, number> = { market: 0, rates: 0, inflation: 0 };
  for (const i of FACTOR_KEYS) for (const j of FACTOR_KEYS) factorVar[i] += loadings[i] * loadings[j] * factorCov(i, j);
  const explained = FACTOR_KEYS.reduce((s, f) => s + factorVar[f], 0);

  // Residual variance = Σ w² σ_ε² (residuals are assumed uncorrelated).
  const residual = ASSETS.reduce((s, a) => s + (w[a.key] * a.residualVol) ** 2, 0);
  const totalVar = explained + residual;

  // Alpha = expected return − Σ (loading × factor premium): the return not
  // explained by paid-for factor exposure.
  const expectedReturn = ASSETS.reduce((s, a) => s + w[a.key] * a.expectedReturn, 0);
  const alpha = expectedReturn - FACTOR_KEYS.reduce((s, f) => s + loadings[f] * FACTOR_PREMIUM[f], 0);

  const contributions = [
    ...FACTORS.map((f) => ({ key: f.key, label: f.label, color: f.color, share: factorVar[f.key] / totalVar, volShare: 0 })),
    { key: "residual" as const, label: "Asset-specific", color: RESIDUAL_COLOR, share: residual / totalVar, volShare: 0 },
  ].map((c) => ({ ...c, volShare: c.share * Math.sqrt(totalVar) })); // in volatility units, for display

  return {
    weights: w,
    loadings,
    volatility: Math.sqrt(totalVar),
    factorVolatility: Math.sqrt(explained),
    rSquared: explained / totalVar,
    alpha,
    expectedReturn,
    systemicBeta: loadings.market,
    contributions,
  };
}
