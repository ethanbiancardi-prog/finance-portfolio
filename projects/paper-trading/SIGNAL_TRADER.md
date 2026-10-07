# Signal Trader

The algorithm that trades my showcase portfolio (`/paper-trading`) on its
own. Code: `site/src/lib/signalTrader.ts`; numbers: `site/src/lib/signalTraderRules.ts`.
Paper money, built to learn from, not investment advice.

## The idea

My Research Signals already collect evidence about stocks: what members of
Congress disclose buying and selling, what a company's latest 10-K says, and
the President's disclosed trades. The Signal Trader turns that evidence into
a score, then only acts when the price trend agrees with it.

## Score

| Evidence | Points |
|---|---|
| Congress conviction (distinct buyers − sellers, +1 if one-sided, +2 if a buyer sits on a committee overseeing the company) | −6 to +6 |
| Latest 10-K story: good (margins expanding, cash machine, turnaround, ...) / bad (margins compressing, leverage rising) | +2 / −2 |
| President: net buyer / net seller | +2 / −2 |

Legislation and geopolitics signals are left out: their write-ups don't say
which way the news cuts for the stock.

## Rules

- **Buy** a score of 4+ when the price is above its 50- and 200-day averages.
  ~9% of the account each, max 10 stocks, ~10% stays cash. Skip it if it's
  already up 25%+ since Congress bought (the move already happened), if it's
  under $5, or if it was sold in the last 14 days.
- **Sell** when any of these happen:
  - 8% below what I paid (stop-loss)
  - 15% below its highest close since buying (trailing stop)
  - price falls below its 200-day average (trend broke)
  - score drops below 2 (signal faded)

## How it runs

Every 15 minutes on weekdays, cron-job.org calls `/api/signal-trader/run`
(Vercel's free plan only allows two scheduled jobs and both are used). A
GitHub Actions schedule does the same as a backup; on its own it never fired
on day one, which is why cron-job.org runs it. The
route checks Alpaca's clock and does nothing when the market is closed.
Signals refresh once a night, so new buys mostly happen on the first run of
the morning; the runs during the day mostly watch the stops. Prices are the
latest IEX trade, which can lag the full market by a few minutes.

It only trades when `SIGNAL_TRADER_ENABLED=true` in Vercel. Otherwise every
run is a dry run that reports what it would do.

## Known weaknesses

- Congress trades are disclosed up to 45 days late, so the signal is old news.
- No backtest yet: the rules are reasonable, not proven.
- It sells everything without a signal, so it can't hold a position on
  conviction the data doesn't capture.
