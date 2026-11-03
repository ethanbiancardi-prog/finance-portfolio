# ML stock model: test results, trained on the S&P 500, market-regime features hidden

Generated 2026-11-03 by `site/scripts/ml/train.ts --universe sp500 --no-macro`. 507 stocks, 237,866 stock-weeks, 2017-01-03 to 2026-10-02, 50 features, predicting each stock's next 20 trading days vs SPY.

Educational research, not investment advice. The stock lists are today's (today's S&P 500, today's household names), so no company that collapsed or was delisted is in them, and every backtest here flatters reality; compare the rows with each other, not with what you'd have earned.

## Walk-forward test (2019 onwards, every prediction made blind)

Scored on the 94 core stocks. ML model IC across every stock it was tested on:  0.016 (t 0.9).

| Score | IC | t-stat | Years right sign |
|---|---:|---:|---:|
| ML model |  0.019 | 0.8 | 7/8 |
| Signal Trader price rules |  0.019 | 0.7 | 6/8 |
| Plain 12-month momentum |  0.020 | 0.8 | 5/8 |

| Test year | ML IC | ML top 10 / yr | Rules top 10 / yr | SPY / yr |
|---|---:|---:|---:|---:|
| 2019 |  0.052 | 26.7% | 28.0% | 31.9% |
| 2020 |  0.011 | -8.4% | 38.9% | 18.9% |
| 2021 |  0.054 | 26.4% | 20.6% | 20.0% |
| 2022 | -0.074 | -35.4% | 14.5% | -16.2% |
| 2023 |  0.062 | 36.2% | 25.2% | 25.0% |
| 2024 |  0.009 | 28.2% | 70.8% | 26.1% |
| 2025 |  0.036 | 38.8% | 43.9% | 17.8% |
| 2026 |  0.000 | 10.0% | 42.4% | 14.1% |

Portfolios, rebalanced every 20 trading days, after 0.1% trading costs:

| Portfolio | Return / yr | Volatility | Sharpe | Worst drop | Months beating SPY |
|---|---:|---:|---:|---:|---:|
| Top 10: ML model | 24.9% | 29.5% | 0.92 | -37.9% | 54% |
| Top 10: Signal Trader price rules | 34.0% | 24.5% | 1.33 | -22.1% | 66% |
| Top 10: Plain 12-month momentum | 36.0% | 26.1% | 1.32 | -22.2% | 62% |
| All core stocks, equal weight | 20.8% | 18.7% | 1.12 | -28.4% | 56% |
| SPY | 16.8% | 17.5% | 0.99 | -24.5% | 0% |

## Purged 5-fold cross-validation (train on 4 blocks of time, test on the 5th)

Scored on the 94 core stocks. ML model IC across every stock it was tested on:  0.020 (t 1.3).

| Score | IC | t-stat | Years right sign |
|---|---:|---:|---:|
| ML model |  0.017 | 0.9 | 7/10 |
| Signal Trader price rules |  0.022 | 0.9 | 8/10 |
| Plain 12-month momentum |  0.021 | 0.9 | 7/10 |

| Test block | ML IC | ML top 10 / yr | Rules top 10 / yr | SPY / yr |
|---|---:|---:|---:|---:|
| 1 (2017-01 to 2018-12) | -0.005 | 11.9% | 13.7% | 6.7% |
| 2 (2018-12 to 2020-12) |  0.025 | 26.3% | 37.1% | 24.9% |
| 3 (2020-12 to 2022-11) | -0.020 | 1.0% | 19.1% | 6.4% |
| 4 (2022-11 to 2024-11) |  0.049 | 29.2% | 40.3% | 23.5% |
| 5 (2024-11 to 2026-10) |  0.036 | 28.1% | 45.1% | 15.5% |

Portfolios, rebalanced every 20 trading days, after 0.1% trading costs:

| Portfolio | Return / yr | Volatility | Sharpe | Worst drop | Months beating SPY |
|---|---:|---:|---:|---:|---:|
| Top 10: ML model | 21.8% | 29.7% | 0.81 | -40.4% | 60% |
| Top 10: Signal Trader price rules | 30.3% | 24.0% | 1.23 | -22.6% | 59% |
| Top 10: Plain 12-month momentum | 32.0% | 25.0% | 1.25 | -23.0% | 59% |
| All core stocks, equal weight | 18.8% | 15.8% | 1.18 | -23.2% | 53% |
| SPY | 15.0% | 14.9% | 1.02 | -22.6% | 0% |

## Each driver on its own (2017 onwards, all 507 stocks)

Positive IC = higher values went with better next-month returns; negative = the opposite. Sorted by t-stat. Market-regime features aren't listed: they're the same for every stock on a day, so alone they can't rank stocks.

| Driver | Group | IC | t-stat | Years same sign |
|---|---|---:|---:|---:|
| 1-month volatility | Volatility |  0.028 | 1.4 | 7/10 |
| Volatility rank in the universe | Cross-section |  0.028 | 1.4 | 7/10 |
| Beta to SPY (1 year) | Volatility |  0.035 | 1.3 | 8/10 |
| Revenue growth (TTM, year on year) | Fundamental |  0.016 | 1.2 | 7/10 |
| Up-day vs down-day volume (10 weeks) | Volume | -0.015 | -1.2 | 6/10 |
| Distance from 50-day average | Price | -0.018 | -1.1 | 7/10 |
| 1-month return | Price | -0.018 | -1.1 | 7/10 |
| Distance from 52-week low | Price |  0.018 | 1.1 | 6/10 |
| Equity / assets (low = more debt) | Fundamental | -0.009 | -1.0 | 6/10 |
| Days since the last 10-Q/10-K | Fundamental | -0.006 | -1.0 | 8/10 |
| Distance from 52-week high | Price | -0.019 | -1.0 | 7/10 |
| Net income growth (TTM) | Fundamental |  0.008 | 0.9 | 6/10 |
| Net margin | Fundamental | -0.008 | -0.9 | 7/10 |
| Operating margin | Fundamental | -0.009 | -0.9 | 8/10 |
| 3-month return | Price | -0.014 | -0.8 | 7/10 |
| 3-month return minus SPY's | Price | -0.014 | -0.8 | 7/10 |
| 3-month return rank in the universe | Cross-section | -0.014 | -0.8 | 7/10 |
| Operating margin change (1 year) | Fundamental |  0.007 | 0.8 | 5/10 |
| RSI (14-day) | Price | -0.011 | -0.8 | 6/10 |
| 1-week vs 10-week average volume | Volume | -0.005 | -0.7 | 4/10 |
| Golden cross: 50-day crossed above 200-day (20 days) | Pattern | -0.003 | -0.7 | 8/10 |
| Cup with handle breakout (10 days) | Pattern | -0.003 | -0.7 | 5/10 |
| 1-month vs 6-month volatility | Volatility | -0.006 | -0.6 | 6/10 |
| Gross margin change (1 year) | Fundamental |  0.005 | 0.6 | 5/10 |
| 1-week return | Price | -0.009 | -0.6 | 8/10 |
| Gross margin | Fundamental |  0.008 | 0.6 | 6/10 |
| Flat base breakout (10 days) | Pattern | -0.002 | -0.5 | 6/10 |
| 12-month momentum (skipping the last month) | Price |  0.009 | 0.5 | 5/10 |
| Momentum rank in the universe | Cross-section |  0.009 | 0.5 | 5/10 |
| Free cash flow yield | Fundamental | -0.006 | -0.4 | 5/10 |
| Double bottom breakout (10 days) | Pattern | -0.002 | -0.4 | 5/10 |
| Free cash flow margin | Fundamental | -0.003 | -0.4 | 4/10 |
| Earnings yield (inverse P/E) | Fundamental | -0.005 | -0.4 | 4/10 |
| Bear trap / shakeout (10 days) | Pattern |  0.002 | 0.3 | 6/10 |
| 3-month return vs its sector | Cross-section | -0.004 | -0.3 | 5/10 |
| New 52-week high (5 days) | Pattern | -0.002 | -0.3 | 4/10 |
| Sales yield (inverse P/S) | Fundamental |  0.004 | 0.2 | 5/10 |
| 6-month return | Price | -0.004 | -0.2 | 5/10 |
| Distance from 200-day average | Price | -0.003 | -0.2 | 4/10 |
| 50-day average vs 200-day | Price |  0.001 | 0.1 | 5/10 |

## What the final model leans on

Share of the model's total improvement that came from splits on each feature.

| Feature | Group | Share |
|---|---|---:|
| Beta to SPY (1 year) | Volatility | 8.2% |
| 3-month return | Price | 8.0% |
| 3-month return minus SPY's | Price | 5.4% |
| Revenue growth (TTM, year on year) | Fundamental | 4.9% |
| Sales yield (inverse P/S) | Fundamental | 4.9% |
| Distance from 52-week low | Price | 4.4% |
| Equity / assets (low = more debt) | Fundamental | 4.3% |
| Gross margin | Fundamental | 4.0% |
| Distance from 52-week high | Price | 3.9% |
| 50-day average vs 200-day | Price | 3.8% |
| 1-month vs 6-month volatility | Volatility | 3.7% |
| 3-month return vs its sector | Cross-section | 3.5% |
| Days since the last 10-Q/10-K | Fundamental | 3.0% |
| Momentum rank in the universe | Cross-section | 3.0% |
| Free cash flow yield | Fundamental | 2.7% |
| 1-month volatility | Volatility | 2.6% |
| 3-month return rank in the universe | Cross-section | 2.5% |
| Operating margin | Fundamental | 2.5% |
| Operating margin change (1 year) | Fundamental | 2.3% |
| Up-day vs down-day volume (10 weeks) | Volume | 2.2% |
