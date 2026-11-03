# Signal Trader rule combinations: backtest

Generated 2026-11-03 by `site/scripts/backtest-timing.ts --grid`. 576 combinations of 7 rules, 94 sector-list stocks. **Picked on 2017-03-01 to 2021-12, then checked on 2022-01 to 2026-11-03** (years the picking never saw). Price-only (trend + momentum score), today's stock lists, 0.05% cost per trade. Educational, not investment advice.

Sharpe = return per unit of risk (higher is better). A combination that tops the first period but not the second got lucky.

## Top 15 combinations by 2017–2021 Sharpe, and how they did afterwards

| Rules | 2017–21 / yr | Sharpe | Worst drop | 2022–26 / yr | Sharpe | Worst drop | Rank in 2022–26 |
|---|---:|---:|---:|---:|---:|---:|---:|
| cap 2/sector, stop 8%, no trail, jumpy sizing, skip run-ups, confirm 2d | 18.4% | 1.15 | −16.9% | 14.9% | 0.98 | −17.7% | 265 of 576 |
| cap 2/sector, stop 8%, trail 20%, jumpy sizing, skip run-ups, confirm 2d | 16.9% | 1.10 | −16.2% | 12.6% | 0.98 | −16.8% | 266 of 576 |
| cap 2/sector, stop 8%, no trail, skip run-ups, confirm 2d | 20.3% | 1.09 | −18.1% | 19.7% | 0.98 | −21.1% | 260 of 576 |
| cap 2/sector, stop 8%, no trail | 21.1% | 1.08 | −19.7% | 21.9% | 1.08 | −18.7% | 122 of 576 |
| cap 3/sector, stop 12%, trail 20%, jumpy sizing, skip run-ups, confirm 2d | 16.8% | 1.08 | −17.4% | 12.1% | 0.90 | −18.6% | 373 of 576 |
| cap 3/sector, stop 8%, no trail | 21.8% | 1.08 | −20.3% | 30.2% | 1.19 | −26.5% | 8 of 576 |
| cap 3/sector, stop 12%, no trail, skip run-ups, confirm 2d | 21.1% | 1.08 | −21.4% | 26.8% | 1.16 | −25.5% | 23 of 576 |
| cap 3/sector, stop 12%, no trail, jumpy sizing, skip run-ups, confirm 2d | 17.5% | 1.07 | −19.4% | 18.9% | 1.07 | −20.5% | 126 of 576 |
| cap 2/sector, stop 8%, no trail, jumpy sizing | 17.1% | 1.07 | −18.0% | 17.7% | 1.08 | −17.9% | 117 of 576 |
| cap 2/sector, no stop, no trail, jumpy sizing | 16.9% | 1.07 | −18.6% | 19.1% | 1.12 | −22.1% | 51 of 576 |
| cap 3/sector, stop 12%, no trail, jumpy sizing, confirm 2d | 17.5% | 1.07 | −18.8% | 20.1% | 1.12 | −22.0% | 52 of 576 |
| cap 2/sector, no stop, no trail | 21.0% | 1.06 | −22.2% | 30.5% | 1.23 | −25.0% | 2 of 576 |
| cap 2/sector, no stop, trail 20%, jumpy sizing, skip run-ups | 15.5% | 1.06 | −17.9% | 12.3% | 0.96 | −18.0% | 293 of 576 |
| cap 3/sector, stop 8%, no trail, jumpy sizing, skip run-ups, confirm 2d | 16.5% | 1.06 | −17.4% | 17.7% | 1.02 | −18.1% | 201 of 576 |
| cap 3/sector, stop 12%, no trail, mkt filter, jumpy sizing | 18.3% | 1.06 | −20.4% | 18.8% | 1.05 | −22.9% | 159 of 576 |
| **Current rules** | 18.9% | 1.04 | −17.8% | 19.4% | 1.00 | −26.1% | 235 of 576 |
| SPY | 17.2% | 0.95 | −33.8% | 11.5% | 0.72 | −24.5% | – |

## Top 5 by 2022–2026 Sharpe (hindsight, for reference)

| Rules | 2017–21 / yr | Sharpe | Worst drop | 2022–26 / yr | Sharpe | Worst drop | Rank in 2022–26 |
|---|---:|---:|---:|---:|---:|---:|---:|
| cap 2/sector, stop 8%, trail 15%, skip run-ups, confirm 2d | 14.3% | 0.89 | −17.3% | 20.8% | 1.24 | −16.3% | 1 of 576 |
| cap 2/sector, no stop, no trail | 21.0% | 1.06 | −22.2% | 30.5% | 1.23 | −25.0% | 2 of 576 |
| cap 2/sector, stop 8%, trail 15%, mkt filter, confirm 2d | 14.2% | 0.89 | −16.1% | 20.4% | 1.22 | −18.4% | 3 of 576 |
| cap 2/sector, stop 12%, no trail | 18.6% | 0.97 | −21.0% | 27.5% | 1.20 | −24.7% | 4 of 576 |
| cap 3/sector, no stop, no trail | 18.7% | 0.93 | −22.7% | 31.0% | 1.20 | −27.0% | 5 of 576 |

## Each setting on its own, averaged over every combination that uses it

| Rule | Setting | Avg Sharpe 2017–21 | Avg Sharpe 2022–26 |
|---|---|---:|---:|
| Sector cap | none | 0.85 | 0.88 |
| Sector cap | 2 per sector | 0.96 | 1.02 |
| Sector cap | 3 per sector | 0.95 | 0.95 |
| Sector cap | 4 per sector | 0.87 | 0.94 |
| Stop-loss | 8% | 0.92 | 0.97 |
| Stop-loss | 12% | 0.90 | 0.95 |
| Stop-loss | none | 0.90 | 0.91 |
| Trailing stop | 15% | 0.92 | 0.89 |
| Trailing stop | 20% | 0.89 | 0.91 |
| Trailing stop | none | 0.92 | 1.04 |
| Market filter | off | 0.95 | 1.00 |
| Market filter | on | 0.87 | 0.89 |
| Jumpiness sizing | off | 0.90 | 0.98 |
| Jumpiness sizing | on | 0.92 | 0.91 |
| Skip run-ups | off | 0.92 | 0.98 |
| Skip run-ups | on | 0.90 | 0.91 |
| Confirm 2 days | off | 0.92 | 0.94 |
| Confirm 2 days | on | 0.90 | 0.96 |
