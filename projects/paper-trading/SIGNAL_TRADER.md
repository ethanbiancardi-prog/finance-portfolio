# Signal Trader

The algorithm that trades my showcase portfolio (`/paper-trading`) on its
own. Code: `site/src/lib/signalTrader.ts`; numbers: `site/src/lib/signalTraderRules.ts`.
Paper money, built to learn from, not investment advice.

## The idea

Score every stock in my universe (the ~94 stocks in the sector lists,
`site/src/lib/sectors.ts`) on three drivers, then buy the strongest ones
while their price trend is up.

Until Oct 2026 the score came from Congress members' disclosed trades and the
President's trades. I dropped both: by the time a congressional trade is
disclosed it's ~50 days old on average (some over 100), so the algorithm was
reacting to old news. Both still appear as Research Signals; they just don't
drive trades.

Insider buying (SEC Form 4 open-market purchases) was a fourth driver from
Oct to Nov 2026. I dropped it from the strategy in Nov 2026.

## Score

| Driver | What it means | Points |
|---|---|---|
| 10-K story (`signals/financial.ts`) | The latest annual report tells a good story (margins expanding, cash machine, turnaround) or a bad one (margins compressing, leverage rising) | +2 / −2 |
| Price trend (`signals/chart.ts`) | Above its 200-day average; and the 50-day above the 200-day with the price above both | 0 to +2 |
| Momentum (`signals/chart.ts`) | 12-month return, skipping the last month, ranked against the universe: top fifth / second fifth; nothing if it's down on the year | +2 / +1 |

## Rules

- **Buy** a score of 4+ when the price is above its 50- and 200-day averages.
  ~9% of the account each, max 10 stocks, ~10% stays cash. Skip it if it's
  under $5 or if it was sold in the last 14 days. Strongest score first, the
  stronger trend as the tie-break.
- **Sell** when any of these happen:
  - 8% below what I paid (stop-loss)
  - 15% below its highest close since buying (trailing stop)
  - price falls below its 200-day average (trend broke)
  - score drops below 2 (signal faded)
- **Swap** when all 10 slots are full and a stock that passes every buy check
  scores 3+ points more than the weakest holding: sell the weakest (lowest
  score; the worst performer breaks ties) and buy the stronger one. At most
  one swap per 15-minute check, never a holding owned under 5 days, and the
  one swapped out can't be re-bought for 14 days. Without this, a strong new
  name could wait weeks for a stop to free a slot.

In practice, a stock that qualifies to buy already has +2 from its trend, so
it needs 2 more from somewhere: a good 10-K or top-fifth momentum.

## How it runs

Every 15 minutes on weekdays, cron-job.org calls `/api/signal-trader/run`
(Vercel's free plan only allows two scheduled jobs and both are used). A
GitHub Actions schedule does the same as a backup; on its own it never fired
on day one, which is why cron-job.org runs it. The
route checks Alpaca's clock and does nothing when the market is closed.

10-K stories refresh once a night in `api/cron/daily`;
trend and momentum are computed from completed daily closes on the first run
of each day and cached. So new buys mostly happen on the first run of the
morning; the runs during the day mostly watch the stops. Prices are the
latest IEX trade, which can lag the full market by a few minutes.

It only trades when `SIGNAL_TRADER_ENABLED=true` in Vercel. Otherwise every
run is a dry run that reports what it would do.

## Known weaknesses

- Backtested on price only (trend + momentum, no 10-K history, Nov 2026):
  ~19%/yr 2017–2026 vs SPY ~14%, on today's stock lists (flattered).
  The 10-K part is untested.
- It behaves like a trend-following momentum strategy with fundamental
  tie-breaks.
- It sells anything whose score falls under 2, so it can't hold a position
  on conviction the data doesn't capture.
