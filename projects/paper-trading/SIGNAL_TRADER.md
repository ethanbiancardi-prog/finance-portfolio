# Signal Trader

The algorithm that trades my showcase portfolio (`/paper-trading`) on its
own. Code: `site/src/lib/signalTrader.ts`; numbers: `site/src/lib/signalTraderRules.ts`.
Paper money, built to learn from, not investment advice.

## The idea

Score every stock in my universe (the ~94 stocks in the sector lists,
`site/src/lib/sectors.ts`) on four drivers, then buy the strongest ones
while their price trend is up. Each driver uses data that's fresh: insider
filings arrive within two business days, prices every day.

Until Oct 2026 the score came from Congress members' disclosed trades and the
President's trades. I dropped both: by the time a congressional trade is
disclosed it's ~50 days old on average (some over 100), so the algorithm was
reacting to old news. Both still appear as Research Signals; they just don't
drive trades.

## Score

| Driver | What it means | Points |
|---|---|---|
| Insider buying (`signals/insider.ts`) | Executives or directors bought their own company's stock on the open market in the last 60 days (SEC Form 4, code "P", at least $10K each, 10b5-1 plan trades ignored) | +2 / +4 / +6 for one / two / three or more insiders, +1 if one is the CEO, CFO or President; max +6 |
| 10-K story (`signals/financial.ts`) | The latest annual report tells a good story (margins expanding, cash machine, turnaround) or a bad one (margins compressing, leverage rising) | +2 / −2 |
| Price trend (`signals/chart.ts`) | Above its 200-day average; and the 50-day above the 200-day with the price above both | 0 to +2 |
| Momentum (`signals/chart.ts`) | 12-month return, skipping the last month, ranked against the universe: top fifth / second fifth; nothing if it's down on the year | +2 / +1 |

Insider buying gets the most weight because it's the only driver that
reflects someone with inside knowledge putting their own money in. Sales are
ignored: insiders sell for taxes, houses and diversifying, but buy for one
reason.

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
it needs 2 more from somewhere: an insider buy, a good 10-K, or top-fifth
momentum.

## How it runs

Every 15 minutes on weekdays, cron-job.org calls `/api/signal-trader/run`
(Vercel's free plan only allows two scheduled jobs and both are used). A
GitHub Actions schedule does the same as a backup; on its own it never fired
on day one, which is why cron-job.org runs it. The
route checks Alpaca's clock and does nothing when the market is closed.

Insider filings and 10-K stories refresh once a night in `api/cron/daily`;
trend and momentum are computed from completed daily closes on the first run
of each day and cached. So new buys mostly happen on the first run of the
morning; the runs during the day mostly watch the stops. Prices are the
latest IEX trade, which can lag the full market by a few minutes.

It only trades when `SIGNAL_TRADER_ENABLED=true` in Vercel. Otherwise every
run is a dry run that reports what it would do.

## Known weaknesses

- No backtest of this exact score yet: the rules are reasonable, not proven.
  (The Strategy Lab tests momentum on its own.)
- Insider buying in mega-caps is rare, so most of the time the score is
  trend + momentum + 10-K, and the algorithm behaves like a trend-following
  momentum strategy with fundamental tie-breaks.
- It sells anything whose score falls under 2, so it can't hold a position
  on conviction the data doesn't capture.
