# Signal Trader rule additions: backtest

Generated 2026-11-03 by `site/scripts/backtest-timing.ts`. 94 sector-list stocks, 2017-03-01 to 2026-11-03, $100K, up to 10 positions at 9% each, 0.05% cost per trade. All versions keep the current 8% stop-loss and 15% trailing stop.

**Price-only version of the Signal Trader.** Insider buying and 10-K stories have no saved history, so a stock's score here is trend + momentum only (buy at 4, sell under 2). Today's stock lists, so no stock that collapsed is in them: compare the rows with each other, not with what you'd have earned. Educational, not investment advice.

| Rules | Return / yr | Volatility | Sharpe | Worst drop | Buys / yr | Stop-loss sells | Avg loss on those |
|---|---:|---:|---:|---:|---:|---:|---:|
| Current rules | 19.2% | 19.0% | 1.02 | −26.1% | 39 | 153 | −8.2% |
| Sector cap: max 3 per sector | 19.9% | 18.3% | 1.08 | −18.1% | 37 | 135 | −8.3% |
| Market filter: no buys while SPY < 200-day avg | 14.7% | 18.0% | 0.85 | −28.1% | 38 | 166 | −8.2% |
| Jumpiness sizing: calm stocks get more money | 12.9% | 13.8% | 0.95 | −18.7% | 39 | 153 | −8.2% |
| All three together | 10.9% | 13.2% | 0.85 | −19.8% | 36 | 146 | −8.3% |
| SPY (buy and hold) | 14.3% | 17.9% | 0.84 | −33.8% | – | – | – |

## Year by year

| Year | Current | #1 | #2 | #3 | #4 | SPY |
|---|---:|---:|---:|---:|---:|---:|
| 2017 | 20% | 22% | 20% | 23% | 21% | 14% |
| 2018 | 7% | 7% | 6% | 6% | 6% | −5% |
| 2019 | 19% | 17% | 17% | 17% | 16% | 31% |
| 2020 | 32% | 31% | 25% | 13% | 10% | 18% |
| 2021 | 14% | 17% | 7% | 9% | 10% | 29% |
| 2022 | −2% | 2% | −7% | −2% | −6% | −18% |
| 2023 | 8% | 14% | 6% | 6% | 6% | 26% |
| 2024 | 59% | 51% | 59% | 35% | 28% | 25% |
| 2025 | 16% | 26% | 11% | 10% | 14% | 18% |
| 2026 | 21% | 13% | 8% | 11% | 4% | 11% |

Columns: #1 Sector cap: max 3 per sector; #2 Market filter: no buys while SPY < 200-day avg; #3 Jumpiness sizing: calm stocks get more money; #4 All three together.

## How each version's sells happened

| Rules | Stop-loss | Trailing stop | Trend broke | Signal faded | Winning sells |
|---|---:|---:|---:|---:|---:|
| Current rules | 153 | 154 | 37 | 23 | 38% |
| Sector cap: max 3 per sector | 135 | 148 | 39 | 26 | 40% |
| Market filter: no buys while SPY < 200-day avg | 166 | 142 | 24 | 23 | 35% |
| Jumpiness sizing: calm stocks get more money | 153 | 154 | 37 | 23 | 38% |
| All three together | 146 | 139 | 29 | 25 | 37% |
