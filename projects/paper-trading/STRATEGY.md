# Strategy: Momentum + Leverage

An aggressive, high-risk / high-reward book, chosen deliberately (Sep 2026)
over the passive core-satellite plan that ran before it. Every rule below is
implemented in `site/src/lib/rotation.ts` and executed by a scheduled job;
nothing is discretionary.

## The bet

Two things I'm betting on, and one thing I'm not:

1. **Momentum persists.** Stocks that led on risk-adjusted momentum over the
   last quarter are more likely than not to keep leading into the next one.
   Owning only the very strongest trends — not the best name in every sector —
   concentrates that edge.
2. **Bull markets run longer than people expect.** In an uptrend, daily-reset
   3x ETFs compound faster than 3x the index. The cost is that they get
   destroyed in choppy or falling markets, so they are only held when the
   trend is up.
3. **I am not betting on picking bottoms.** The circuit breaker sells into
   weakness by rule and does not try to buy the dip.

## Allocation (share of account equity)

| Sleeve | Risk-on | Risk-off | What |
|---|---|---|---|
| Momentum | 60% | 30% | Top 10 (risk-off: top 5) stocks by momentum score across the whole 8-sector universe, max 3 per sector, equal weight |
| Leveraged index | 30% | 0% | TQQQ 20% (3x Nasdaq-100), SOXL 10% (3x semiconductors) |
| Cash | ~10% | ~70% | Buffer; never borrowed against |

## Mechanics

- **Universe:** the curated 8-sector list in `site/src/lib/sectors.ts` (~100
  household names; Sustainability mirrors the Bentley Investment Group
  Sustainability Fund's holdings). No index ETFs in the momentum universe —
  index exposure comes from the leveraged sleeve.
- **Momentum score:** trailing 63-trading-day return ÷ standard deviation of
  daily returns over the same window. Risk-adjusted, so a smooth climb
  outranks a one-day spike.
- **Selection:** walk the universe from strongest score down, taking a name
  unless its sector already has 3. Stop at 10. A stock that appears in two
  sectors is taken once.
- **Regime / circuit breaker:** at each rebalance, compare SPY's last close to
  its 200-day simple moving average. Above = risk-on. Below = risk-off: the
  leveraged sleeve is sold to cash and the momentum sleeve halves. This is the
  most common trend-following rule there is; it's here because momentum
  strategies crash hardest at trend reversals and 3x ETFs bleed in sideways
  markets.
- **Position cap:** no single stock over 20% of its sleeve (not binding at 10
  equal-weight picks; a safety ceiling for thin data).
- **Rebalance:** monthly, on the 1st, via Vercel Cron → `/api/rotation/run`.
  Sells before buys. Idempotent client order IDs so a retried run can't
  double-buy.
- **No margin, ever:** the run estimates the cash its buys need against cash
  on hand plus that run's sells and refuses to place anything if it doesn't
  cover. Alpaca's paper account would otherwise happily fill ~4x equity.

## Evidence that proves me right

- Over a full year the account beats SPY buy-and-hold on total return, and the
  circuit breaker fires at least once and avoids a meaningful part of a
  drawdown (measure: account drawdown during a SPY sub-200-day period vs.
  TQQQ's drawdown over the same period).

## Evidence that proves me wrong

- A whipsaw year: SPY crosses its 200-day repeatedly, the strategy sells low
  and buys back high each time, and the leveraged sleeve's volatility decay
  eats the return. If the account trails SPY after 12 months with two or more
  regime flips, the leverage sleeve should be cut or removed.
- Momentum picks cluster into one theme (three energy names on an oil spike is
  allowed by the sector cap; a whole book of AI beneficiaries across sectors
  isn't caught by it) and crater together.

## What I expect the ride to look like

Violent. TQQQ fell 79% in 2022 and 55% in the 2020 crash month; a
concentrated momentum book can lose 30-40% in a bad month. The account's max
drawdown will be several times SPY's. That is the trade-off being made on
purpose — the risk metrics on the paper-trading page (Sharpe, drawdown, beta
vs SPY) are there to keep it honest.

## Switching over from the old strategy

The account held a passive ETF core (VOO, BND, VEA, VXF, VWO, VNQ, GLD, funded
10 Sep 2026 — see the trade journal) plus a small rotation sleeve. The new
strategy only manages positions it has recorded itself, so the core has to be
sold once, by hand, before the first rebalance will run:

1. Sell VOO, BND, VEA, VXF, VWO, VNQ, GLD and the stray AAPL (paper-trading
   page → Place Order, or `node scripts/sell-core.js` in `site/`).
2. Press **Run Rebalance Now** on the strategy page (or wait for the 1st).
   Until step 1 is done the run reports itself as blocked and places nothing.

## Benchmark

SPY buy-and-hold over the same period, always. If the strategy doesn't beat it
after a full cycle including at least one risk-off period, that's the signal
to simplify.

## Retired satellites

The quantum-computing thesis and rules-based dip-buying satellites from the
original core-satellite plan were never built and are dropped.
