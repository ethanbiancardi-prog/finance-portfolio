# Fundamentals-first rules: backtest

Generated 2026-11-04 by `site/scripts/backtest-fundamentals.ts`. Today's S&P 500 (503 stocks), 2017-03-01 to 2026-11-03, split into 2017–21 and 2022–26. Educational, not investment advice.

Every version uses the live bot's mechanics: decide at the close, trade at the next open, 8% stop-loss on the day's low, sell below the 200-day average, 10 positions at 9%, at most 2 per sector, 14-day cooldown, 0.05% cost per trade. Fundamentals are point-in-time (a filing counts from the day after it was filed).

- **Current bot**: Current bot: price only (trend + momentum score 4)
- **Quality first**: Quality first: profitable, net margin ≥10%, ROE ≥17%, then the chart
- **Growth ≥30%**: Growth first: ROE ≥17%, profits up ≥30%/yr for 3 years (every year), short-term uptrend
- **Growth ≥20%**: Growth first, 20% bar: same as C with profits up ≥20%/yr
- **Growth + leader**: Growth + leader: C, plus leading its sector (top quarter of its sector and top fifth of the market over 12 months)
- **Full checklist**: Full checklist: profitable, ROE ≥17%, profits up ≥20%/yr for 3 years, sales up ≥15% and speeding up, sector leader, short-term uptrend
- **Blend, buy at 4+**: Blend: price score + fundamental points (growth up to +2, ROE +1, losing money −2), buy at 4+
- **Blend, buy at 5+**: Blend, higher bar: as G, buy at 5+ (price strength alone isn't enough)
- **Blend, profitable only**: Blend, profitable only: as G, but never buy a company losing money

| Version | 2017–21 / yr | Sharpe | Worst drop | 2022–26 / yr | Sharpe | Worst drop | Whole period / yr | Trades | Stop-outs | Avg invested | Avg stocks qualifying |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Current bot | 21.5% | 0.84 | −40.2% | 39.3% | 1.11 | −38.4% | 29.8% | 521 | 153 | 95.1% | 79 |
| Quality first | 18.9% | 0.95 | −26.9% | 18.8% | 0.76 | −38.8% | 18.7% | 687 | 128 | 94.3% | 61 |
| Growth ≥30% | 21.4% | 1.22 | −19.6% | 14.2% | 0.63 | −36.7% | 17.7% | 822 | 67 | 81.5% | 4 |
| Growth ≥20% | 18.6% | 1.10 | −21.0% | 12.9% | 0.58 | −34.5% | 15.4% | 944 | 72 | 88.8% | 9 |
| Growth + leader | 12.1% | 0.91 | −13.5% | 15.8% | 0.71 | −33.4% | 13.8% | 273 | 57 | 54.3% | 1 |
| Full checklist | 1.8% | 0.29 | −9.1% | 10.7% | 0.53 | −38.0% | 6.1% | 185 | 44 | 28.8% | 0 |
| Blend, buy at 4+ | 21.0% | 0.99 | −32.3% | 24.0% | 0.85 | −32.5% | 22.3% | 672 | 113 | 95.1% | 130 |
| Blend, buy at 5+ | 19.9% | 0.97 | −31.3% | 23.9% | 0.85 | −32.5% | 21.5% | 634 | 103 | 94.8% | 53 |
| Blend, profitable only | 22.7% | 1.05 | −32.5% | 22.8% | 0.82 | −32.5% | 22.5% | 686 | 114 | 95.2% | 122 |
| SPY | 17.2% | 0.95 | −33.8% | 11.4% | 0.71 | −24.5% | 14.3% | – | – | – | – |
| Every stock, equal weight | 21.2% | 1.04 | −38.2% | 13.9% | 0.86 | −20.6% | 17.5% | – | – | – | – |

**Read with care:** this uses *today's* S&P 500. Companies that grew fast are exactly the ones that got added to the index, so a growth-first strategy is flattered more than the rest. Compare each version with "every stock, equal weight" (same list, same bias), not only with SPY. Profit growth uses total net income (cover-page share counts aren't split-adjusted, so per-share numbers would be wrong).
