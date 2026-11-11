# Growth checklist, lenient versions: backtest

Generated 2026-11-11 by `site/scripts/backtest-growth-checklist.ts`. Today's S&P 500 (503 stocks), 2017-03-01 to 2026-11-03, split into 2017–21 and 2022–26. Educational, not investment advice.

The question: the Growth Stocks screen's checklist left a bot mostly in cash when it demanded every check. What if it buys stocks that pass **most** of them?

**The checks** (the screen's own, `lib/growthScreen.ts`). The original 7: profitable · profits +25%/yr for 3 years, up every year · net margin ≥10% · ROE ≥17% · sales +20% and speeding up · industry leader (Relative Price Score 80+, 75+ in its sector) · healthy chart (above 50/200-day, within 15% of the 52-week high). Two new ways to see big funds buying:
- **Funds buying (13F)**: the number of funds holding it, from SEC 13F filings, rose last quarter faster than the median stock's. Quarterly and 45+ days late. Passed on 48.2% of stock-days with data.
- **Volume shows buying**: 1.2x+ as many shares traded on up days as down days over the last 50 days. Daily. Passed on 36.6% of stock-days.

**Mechanics** (same as the live bot and FUNDAMENTALS_BACKTEST.md): decide at the close, trade at the next open, 8% stop-loss on the day's low, sell below the 200-day average or when the company starts losing money, 10 positions at 9%, at most 2 per sector, 14-day cooldown, 0.05% cost per trade. Candidates ranked by checks passed, then Relative Price Score. Fundamentals count from the day after filing; a quarter's 13F counts from 46 days after the quarter ends.

- **Current bot**: The live Signal Trader's price-only rule (trend + momentum score 4), for reference
- **6+ of 7**: The original 7 checks, miss at most one
- **5+ of 7**: The original 7 checks, miss at most two
- **7+ of 8 (13F)**: 7 + funds buying (13F), miss at most one
- **6+ of 8 (13F)**: 7 + funds buying (13F), miss at most two
- **5+ of 8 (13F)**: 7 + funds buying (13F), miss at most three
- **7+ of 8 (volume)**: 7 + volume shows buying, miss at most one
- **6+ of 8 (volume)**: 7 + volume shows buying, miss at most two
- **5+ of 8 (volume)**: 7 + volume shows buying, miss at most three
- **8+ of 9**: All nine checks, miss at most one
- **7+ of 9**: All nine checks, miss at most two
- **6+ of 9**: All nine checks, miss at most three

| Version | 2017–21 / yr | Sharpe | Worst drop | 2022–26 / yr | Sharpe | Worst drop | Whole period / yr | Trades | Stop-outs | Avg invested | Avg stocks qualifying |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Current bot | 22.3% | 0.87 | −41.1% | 32.5% | 0.99 | −30.8% | 27.0% | 533 | 162 | 95.0% | 79 |
| 6+ of 7 | 21.6% | 1.20 | −17.1% | 16.8% | 0.66 | −38.7% | 18.8% | 457 | 96 | 81.0% | 4 |
| 5+ of 7 | 14.3% | 0.76 | −29.4% | 15.1% | 0.67 | −34.8% | 14.5% | 592 | 146 | 94.5% | 27 |
| 7+ of 8 (13F) | 18.4% | 1.09 | −16.1% | 4.3% | 0.30 | −33.9% | 10.9% | 421 | 107 | 72.3% | 2 |
| 6+ of 8 (13F) | 21.6% | 1.06 | −27.5% | 12.2% | 0.62 | −21.6% | 16.5% | 540 | 133 | 94.5% | 17 |
| 5+ of 8 (13F) | 15.7% | 0.80 | −31.7% | 11.6% | 0.58 | −23.3% | 13.4% | 650 | 151 | 94.7% | 64 |
| 7+ of 8 (volume) | 18.3% | 1.07 | −16.6% | 5.7% | 0.35 | −31.3% | 11.5% | 431 | 112 | 76.2% | 2 |
| 6+ of 8 (volume) | 17.1% | 0.93 | −20.9% | 23.7% | 0.81 | −34.2% | 20.0% | 499 | 121 | 93.8% | 18 |
| 5+ of 8 (volume) | 16.9% | 0.88 | −28.6% | 24.6% | 0.83 | −34.8% | 20.6% | 525 | 123 | 94.7% | 63 |
| 8+ of 9 | 14.3% | 0.91 | −17.2% | 3.2% | 0.26 | −29.7% | 8.4% | 387 | 111 | 68.0% | 1 |
| 7+ of 9 | 19.9% | 1.07 | −20.2% | 13.9% | 0.61 | −30.0% | 16.6% | 466 | 106 | 93.1% | 12 |
| 6+ of 9 | 20.9% | 1.00 | −27.1% | 19.9% | 0.75 | −29.5% | 20.1% | 527 | 119 | 94.9% | 42 |
| SPY | 17.2% | 0.95 | −33.8% | 11.4% | 0.71 | −24.5% | 14.3% | – | – | – | – |
| Every stock, equal weight | 21.2% | 1.04 | −38.2% | 13.9% | 0.86 | −20.6% | 17.5% | – | – | – | – |

**Read with care:** this uses *today's* S&P 500, so companies that grew fast (and got added to the index for it) are overrepresented; compare with "every stock, equal weight" (same list, same bias), not only SPY. The live screen covers ~1,700 stocks; this test covers only the ~500 with cached price and filing history. O'Neil's own sell rules (beyond the 8% stop) aren't modelled. 13F tickers come from today's CUSIP mapping, so a company whose CUSIP changed has no fund data before the change (the check counts as failed, not passed).
