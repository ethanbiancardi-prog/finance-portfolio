# ML stock model: test results

Generated 2026-11-03 by `site/scripts/ml/train.ts`. 45,078 stock-weeks, 2017-01-03 to 2026-10-02, 50 features, predicting each stock's next 20 trading days vs SPY.

Educational research, not investment advice. The universe is today's ~94 household names, picked with hindsight (no company that collapsed or was delisted is in it), so every backtest here flatters reality; compare the rows with each other, not with what you'd have earned.

## Walk-forward test (2019 onwards, every prediction made blind)

| Score | IC | t-stat | Years right sign |
|---|---:|---:|---:|
| ML model | -0.007 | -0.3 | 3/8 |
| Signal Trader price rules |  0.019 | 0.7 | 6/8 |
| Plain 12-month momentum |  0.020 | 0.8 | 5/8 |

IC by year (ML model): 2019  0.007 · 2020  0.012 · 2021  0.025 · 2022 -0.091 · 2023 -0.029 · 2024 -0.012 · 2025  0.014 · 2026  0.025

Portfolios, rebalanced every 20 trading days, after 0.1% trading costs:

| Portfolio | Return / yr | Volatility | Sharpe | Worst drop | Months beating SPY |
|---|---:|---:|---:|---:|---:|
| Top 10: ML model | 16.3% | 30.2% | 0.66 | -41.3% | 44% |
| Top 10: Signal Trader price rules | 34.0% | 24.5% | 1.33 | -22.1% | 66% |
| Top 10: Plain 12-month momentum | 36.0% | 26.1% | 1.32 | -22.2% | 62% |
| All ~94 stocks, equal weight | 20.8% | 18.7% | 1.12 | -28.4% | 56% |
| SPY | 16.8% | 17.5% | 0.99 | -24.5% | 0% |

## Each driver on its own (2017 onwards)

Positive IC = higher values went with better next-month returns; negative = the opposite. Sorted by t-stat. Market-regime features aren't listed: they're the same for every stock on a day, so alone they can't rank stocks.

| Driver | Group | IC | t-stat | Years same sign |
|---|---|---:|---:|---:|
| Double bottom breakout (10 days) | Pattern |  0.027 | 1.9 | 8/10 |
| New 52-week high (5 days) | Pattern |  0.028 | 1.8 | 8/10 |
| Distance from 52-week low | Price |  0.033 | 1.6 | 8/10 |
| Bear trap / shakeout (10 days) | Pattern |  0.026 | 1.6 | 8/10 |
| Flat base breakout (10 days) | Pattern |  0.025 | 1.6 | 7/10 |
| Golden cross: 50-day crossed above 200-day (20 days) | Pattern |  0.020 | 1.5 | 8/10 |
| 1-month volatility | Volatility |  0.032 | 1.4 | 7/10 |
| Volatility rank in the universe | Cross-section |  0.032 | 1.4 | 7/10 |
| Beta to SPY (1 year) | Volatility |  0.038 | 1.3 | 7/10 |
| Revenue growth (TTM, year on year) | Fundamental |  0.024 | 1.2 | 9/10 |
| Cup with handle breakout (10 days) | Pattern |  0.017 | 1.2 | 8/10 |
| Distance from 200-day average | Price |  0.022 | 0.9 | 6/10 |
| 12-month momentum (skipping the last month) | Price |  0.021 | 0.9 | 7/10 |
| Momentum rank in the universe | Cross-section |  0.021 | 0.9 | 7/10 |
| Free cash flow yield | Fundamental | -0.017 | -0.9 | 7/10 |
| Net income growth (TTM) | Fundamental |  0.015 | 0.9 | 7/10 |
| 50-day average vs 200-day | Price |  0.018 | 0.8 | 6/10 |
| Days since the last 10-Q/10-K | Fundamental |  0.008 | 0.7 | 7/10 |
| Up-day vs down-day volume (10 weeks) | Volume | -0.011 | -0.6 | 6/10 |
| 6-month return | Price |  0.014 | 0.6 | 6/10 |
| Earnings yield (inverse P/E) | Fundamental | -0.011 | -0.6 | 6/10 |
| 3-month return vs its sector | Cross-section |  0.006 | 0.4 | 5/10 |
| Sales yield (inverse P/S) | Fundamental | -0.007 | -0.3 | 6/10 |
| Gross margin | Fundamental |  0.005 | 0.3 | 5/10 |
| Equity / assets (low = more debt) | Fundamental |  0.004 | 0.3 | 5/10 |
| RSI (14-day) | Price |  0.003 | 0.2 | 5/10 |
| Distance from 50-day average | Price | -0.003 | -0.2 | 6/10 |
| Distance from 52-week high | Price | -0.004 | -0.2 | 5/10 |
| Net margin | Fundamental | -0.002 | -0.1 | 5/10 |
| 1-month vs 6-month volatility | Volatility |  0.002 | 0.1 | 4/10 |
| 1-week return | Price |  0.002 | 0.1 | 6/10 |
| 1-month return | Price | -0.002 | -0.1 | 4/10 |
| 3-month return | Price |  0.001 | 0.1 | 4/10 |
| 3-month return minus SPY's | Price |  0.001 | 0.1 | 4/10 |
| 3-month return rank in the universe | Cross-section |  0.001 | 0.1 | 4/10 |
| Free cash flow margin | Fundamental | -0.001 | -0.1 | 6/10 |
| Operating margin change (1 year) | Fundamental | -0.001 | -0.0 | 6/10 |
| Operating margin | Fundamental | -0.001 | -0.0 | 5/10 |
| 1-week vs 10-week average volume | Volume | -0.000 | -0.0 | 5/10 |
| Gross margin change (1 year) | Fundamental |  0.000 | 0.0 | 5/10 |

## What the final model leans on

Share of the model's total improvement that came from splits on each feature.

| Feature | Group | Share |
|---|---|---:|
| SPY 3-month return | Macro | 6.8% |
| 10-year yield change (3 months) | Macro | 5.8% |
| Beta to SPY (1 year) | Volatility | 5.0% |
| Net margin | Fundamental | 4.6% |
| Yield curve (10-year minus 2-year) | Macro | 4.1% |
| Free cash flow yield | Fundamental | 4.0% |
| Distance from 52-week low | Price | 3.3% |
| Equity / assets (low = more debt) | Fundamental | 3.2% |
| Gross margin change (1 year) | Fundamental | 3.2% |
| Earnings yield (inverse P/E) | Fundamental | 3.1% |
| Revenue growth (TTM, year on year) | Fundamental | 3.1% |
| 10-year Treasury yield | Macro | 3.0% |
| VIX level | Macro | 2.9% |
| Gross margin | Fundamental | 2.8% |
| 3-month return | Price | 2.8% |
| 50-day average vs 200-day | Price | 2.7% |
| Operating margin change (1 year) | Fundamental | 2.6% |
| Free cash flow margin | Fundamental | 2.4% |
| Days since the last 10-Q/10-K | Fundamental | 2.3% |
| Sales yield (inverse P/S) | Fundamental | 2.3% |
