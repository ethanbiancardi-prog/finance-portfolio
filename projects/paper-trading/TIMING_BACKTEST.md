# Signal Trader timing fixes: backtest

Generated 2026-11-03 by `site/scripts/backtest-timing.ts`. 94 sector-list stocks, 2017-03-01 to 2026-11-03, $100K, up to 10 positions at 9% each, 0.05% cost per trade.

**Price-only version of the Signal Trader.** Insider buying and 10-K stories have no saved history, so a stock's score here is trend + momentum only (buy at 4, sell under 2). Today's stock lists, so no stock that collapsed is in them: compare the rows with each other, not with what you'd have earned. Educational, not investment advice.

| Rules | Return / yr | Volatility | Sharpe | Worst drop | Buys / yr | Stop-loss sells | Avg loss on those |
|---|---:|---:|---:|---:|---:|---:|---:|
| Current rules (8% stop, 15% trailing) | 19.2% | 19.0% | 1.02 | −26.1% | 39 | 153 | −8.2% |
| Fix 1: skip stocks >15% above 50-day avg | 17.2% | 18.9% | 0.94 | −25.7% | 40 | 149 | −8.3% |
| Fix 2a: 12% stop-loss | 17.5% | 19.3% | 0.93 | −27.8% | 34 | 52 | −12.6% |
| Fix 2b: stop sized to each stock's jumpiness | 15.6% | 19.2% | 0.85 | −28.0% | 42 | 159 | −7.6% |
| Fix 1 + 2a together | 14.5% | 18.8% | 0.81 | −26.7% | 33 | 48 | −12.6% |
| Fix 3: score must hold 2 days before buying | 18.6% | 18.9% | 1.00 | −26.1% | 39 | 152 | −8.3% |
| No stops at all (trend and signal exits only) | 24.4% | 24.9% | 1.00 | −28.0% | 18 | 0 | – |
| SPY (buy and hold) | 14.3% | 17.9% | 0.84 | −33.8% | – | – | – |

## Year by year

| Year | Current | #1 | #2 | #3 | #4 | #5 | No stops | SPY |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2017 | 20% | 22% | 19% | 25% | 20% | 22% | 15% | 14% |
| 2018 | 7% | 6% | 6% | 2% | 3% | 4% | 10% | −5% |
| 2019 | 19% | 18% | 14% | 19% | 15% | 19% | 20% | 31% |
| 2020 | 32% | 22% | 27% | 30% | 25% | 36% | 26% | 18% |
| 2021 | 14% | 6% | 18% | 8% | 9% | 3% | 18% | 29% |
| 2022 | −2% | 7% | −4% | −9% | 1% | −4% | 0% | −18% |
| 2023 | 8% | 9% | 10% | 8% | 6% | 9% | 12% | 26% |
| 2024 | 59% | 47% | 46% | 54% | 40% | 59% | 90% | 25% |
| 2025 | 16% | 19% | 17% | 13% | 23% | 18% | 43% | 18% |
| 2026 | 21% | 15% | 21% | 13% | 3% | 25% | 20% | 11% |

Columns: #1 = #1 Fix 1: skip stocks >15% above 50-day avg; #2 Fix 2a: 12% stop-loss; #3 Fix 2b: stop sized to each stock's jumpiness; #4 Fix 1 + 2a together; #5 Fix 3: score must hold 2 days before buying.

## How each version's sells happened

| Rules | Stop-loss | Trailing stop | Trend broke | Signal faded | Winning sells |
|---|---:|---:|---:|---:|---:|
| Current rules (8% stop, 15% trailing) | 153 | 154 | 37 | 23 | 38% |
| Fix 1: skip stocks >15% above 50-day avg | 149 | 158 | 38 | 28 | 39% |
| Fix 2a: 12% stop-loss | 52 | 191 | 49 | 25 | 43% |
| Fix 2b: stop sized to each stock's jumpiness | 159 | 176 | 38 | 20 | 35% |
| Fix 1 + 2a together | 48 | 186 | 52 | 26 | 44% |
| Fix 3: score must hold 2 days before buying | 152 | 154 | 40 | 24 | 38% |
| No stops at all (trend and signal exits only) | 0 | 0 | 140 | 23 | 48% |
