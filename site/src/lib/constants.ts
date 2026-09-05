// Single source of truth for the risk-free rate, so every Sharpe ratio on
// the site (paper-trading metrics, portfolio optimizer, Monte Carlo) uses
// the same number. This is a fixed constant, not fetched live — there's no
// Treasury-data source anywhere in this repo, and pulling one just for a
// slow-moving rate isn't worth a new dependency. Update by hand occasionally.
export const RISK_FREE_RATE_ANNUAL = 0.04; // ~current 3-month T-bill yield
