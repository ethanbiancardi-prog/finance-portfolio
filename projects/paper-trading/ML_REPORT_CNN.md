# Chart-reading neural network: test results

Generated 2026-11-03 by `site/scripts/ml/train-cnn.ts`. Trained on 507 S&P 500 stocks (237,866 weekly charts, 2017-01-03 to 2026-10-02). Each chart: the last 60 days of high, low, close and volume, scaled to fit 0–1. Predicts whether the stock beats the median stock over the next 20 trading days. 3 networks per test period, averaged.

Educational research, not investment advice. The stock lists are today's (today's S&P 500, today's household names), so no company that collapsed or was delisted is in them, and every backtest here flatters reality; compare the rows with each other, not with what you'd have earned.

## Walk-forward test (2019 onwards, every prediction made blind)

Scored on the 94 core stocks. IC across every stock tested: Chart network  0.010 (t 0.7), Trees (no macro)  0.016 (t 0.9).

| Score | IC | t-stat | Years right sign |
|---|---:|---:|---:|
| Chart network |  0.000 | 0.0 | 5/8 |
| Trees (no macro) |  0.019 | 0.8 | 7/8 |
| Signal Trader price rules |  0.019 | 0.7 | 6/8 |
| Plain 12-month momentum |  0.020 | 0.8 | 5/8 |
| Trees + chart network |  0.011 | 0.5 | 4/8 |

Top 10 return per year in each test year (IC in brackets):

| Test year | Chart network | Trees (no macro) | Trees + chart network | Signal Trader price rules | SPY |
|---|---:|---:|---:|---:|---:|
| 2019 | 24.7% ( 0.008) | 26.7% ( 0.052) | 31.0% ( 0.039) | 28.0% ( 0.002) | 31.9% |
| 2020 | 0.8% (-0.012) | -8.4% ( 0.011) | -1.7% (-0.002) | 38.9% ( 0.034) | 18.9% |
| 2021 | 12.9% ( 0.058) | 26.4% ( 0.054) | 9.0% ( 0.063) | 20.6% (-0.049) | 20.0% |
| 2022 | -18.4% (-0.019) | -35.4% (-0.074) | -21.5% (-0.059) | 14.5% ( 0.073) | -16.2% |
| 2023 | 28.3% ( 0.017) | 36.2% ( 0.062) | 36.3% ( 0.059) | 25.2% (-0.054) | 25.0% |
| 2024 | 6.7% (-0.068) | 28.2% ( 0.009) | 24.0% (-0.038) | 70.8% ( 0.106) | 26.1% |
| 2025 | 13.3% ( 0.012) | 38.8% ( 0.036) | 43.2% ( 0.028) | 43.9% ( 0.013) | 17.8% |
| 2026 | 21.2% ( 0.009) | 10.0% ( 0.000) | 13.7% (-0.005) | 42.4% ( 0.026) | 14.1% |

Portfolios, rebalanced every 20 trading days, after 0.1% trading costs:

| Portfolio | Return / yr | Volatility | Sharpe | Worst drop | Months beating SPY |
|---|---:|---:|---:|---:|---:|
| Top 10: Chart network | 17.1% | 22.0% | 0.84 | -32.3% | 45% |
| Top 10: Trees (no macro) | 24.9% | 29.5% | 0.92 | -37.9% | 54% |
| Top 10: Signal Trader price rules | 34.0% | 24.5% | 1.33 | -22.1% | 66% |
| Top 10: Plain 12-month momentum | 36.0% | 26.1% | 1.32 | -22.2% | 62% |
| Top 10: Trees + chart network | 26.3% | 27.3% | 1.01 | -38.5% | 59% |
| All core stocks, equal weight | 20.8% | 18.7% | 1.12 | -28.4% | 56% |
| SPY | 16.8% | 17.5% | 0.99 | -24.5% | 0% |

## Purged 5-fold cross-validation (train on 4 blocks of time, test on the 5th)

Scored on the 94 core stocks. IC across every stock tested: Chart network  0.005 (t 0.4), Trees (no macro)  0.020 (t 1.3).

| Score | IC | t-stat | Years right sign |
|---|---:|---:|---:|
| Chart network | -0.001 | -0.1 | 6/10 |
| Trees (no macro) |  0.017 | 0.9 | 7/10 |
| Signal Trader price rules |  0.022 | 0.9 | 8/10 |
| Plain 12-month momentum |  0.021 | 0.9 | 7/10 |
| Trees + chart network |  0.009 | 0.5 | 5/10 |

Top 10 return per year in each test block (IC in brackets):

| Test block | Chart network | Trees (no macro) | Trees + chart network | Signal Trader price rules | SPY |
|---|---:|---:|---:|---:|---:|
| 1 (2017-01 to 2018-12) | 4.5% (-0.006) | 11.9% (-0.005) | 6.2% (-0.006) | 13.7% ( 0.039) | 6.7% |
| 2 (2018-12 to 2020-12) | 30.0% (-0.004) | 26.3% ( 0.025) | 23.3% ( 0.007) | 37.1% ( 0.019) | 24.9% |
| 3 (2020-12 to 2022-11) | 15.9% ( 0.009) | 1.0% (-0.020) | 12.4% (-0.003) | 19.1% ( 0.009) | 6.4% |
| 4 (2022-11 to 2024-11) | 19.4% (-0.014) | 29.2% ( 0.049) | 32.6% ( 0.024) | 40.3% ( 0.010) | 23.5% |
| 5 (2024-11 to 2026-10) | 17.0% ( 0.007) | 28.1% ( 0.036) | 24.3% ( 0.026) | 45.1% ( 0.032) | 15.5% |

Portfolios, rebalanced every 20 trading days, after 0.1% trading costs:

| Portfolio | Return / yr | Volatility | Sharpe | Worst drop | Months beating SPY |
|---|---:|---:|---:|---:|---:|
| Top 10: Chart network | 15.0% | 23.9% | 0.70 | -24.2% | 46% |
| Top 10: Trees (no macro) | 21.8% | 29.7% | 0.81 | -40.4% | 60% |
| Top 10: Signal Trader price rules | 30.3% | 24.0% | 1.23 | -22.6% | 59% |
| Top 10: Plain 12-month momentum | 32.0% | 25.0% | 1.25 | -23.0% | 59% |
| Top 10: Trees + chart network | 20.9% | 28.2% | 0.81 | -31.2% | 51% |
| All core stocks, equal weight | 18.8% | 15.8% | 1.18 | -23.2% | 53% |
| SPY | 15.0% | 14.9% | 1.02 | -22.6% | 0% |

## What the network learned to favour

Average chart of the core stocks it ranked in its top 10% vs bottom 10% each week (walk-forward test), on its 0–1 scale: 0 = the window's lowest low, 1 = its highest high.

| Close, days ago → | 59 | 44 | 29 | 14 | 4 | today | Volume, last 5 days | Daily range, recent |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Top 10% | 0.57 | 0.54 | 0.53 | 0.42 | 0.36 | 0.36 | 0.32 | 0.100 |
| Bottom 10% | 0.43 | 0.36 | 0.38 | 0.56 | 0.72 | 0.74 | 0.41 | 0.116 |

Best epoch per network (training stopped early once validation stopped improving): 1: 18, 2: 11, 3: 5, 4: 1, 5: 2, 6: 2.
