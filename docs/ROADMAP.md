# Roadmap (semester-friendly)

## Phase 0 — Foundation (week 1)
- [x] Create GitHub repo, push this scaffold
- [x] Write CLAUDE.md at repo root (conventions, stack, goals) so Claude Code has context every session
- [x] Ship a one-page portfolio site: name, headline ("Finance × AI @ Bentley"), placeholder project cards, contact links
- [x] Deploy it (Vercel) — https://site-theta-drab-22.vercel.app

## Phase 1 — Quick wins (weeks 2–3)
- [ ] Client-work case study pages (projects/client-work)
- [x] DCF builder v1: manual inputs, live valuation, sensitivity table (full FCF build —
      revenue growth, EBIT margin, tax, D&A/capex/NWC as % of revenue — 5yr projection,
      Gordon growth terminal value, EV/equity/per-share output, WACC x terminal growth
      sensitivity grid color-coded vs. an optional current price)

## Phase 2 — AI wow-factor (weeks 4–6)
- [x] 10-K analyzer: pull from SEC EDGAR, compute ratio dashboard (Search by ticker + Browse by Industry, sorted by public float)
- [ ] 10-K analyzer: AI-written one-page summary per filing
- [ ] Add "AI assumptions mode" to the DCF builder (pre-fill assumptions from a filing)

## Phase 3 — Flagship (weeks 7–12)
- [x] Paper trading simulator v1: manual trades, real prices, P&L dashboard (Alpaca paper account — equity, positions, recent orders, buy/sell form)
- [x] v2a: AI analyst commentary — six-persona panel per ticker (Bull, Bear, Accountant, Risk Manager, Historian, Indexer)
- [ ] v2b: weekly full-portfolio review
- [x] v3: sector rotation strategy — automated monthly rebalance across tech/biotech/consumer
      by risk-adjusted momentum, position-size-capped at 20%, executed via a scheduled job
      on the Alpaca paper account (fully live — Upstash Redis + CRON_SECRET provisioned,
      runs monthly on the 1st)
- [ ] simple strategy backtester (stretch)

## Phase 4 — Quant toolkit
- [x] Risk/performance metrics on the paper-trading page: Sharpe ratio, annualized volatility,
      max drawdown, beta vs. SPY
- [x] Portfolio optimizer: samples the efficient frontier across user-entered tickers
      (max-Sharpe and min-variance highlighted), risk slider shows weights at any point
- [x] Monte Carlo simulator: 10,000 simulated paths blending real SPY/AGG history,
      10th/50th/90th percentile fan chart, probability of hitting a savings goal
- [x] Quant Notes write-up page: plain-language explanation of the math behind the above,
      each section linking to the live page that demonstrates it

## Ongoing
- [ ] One short blog post / LinkedIn post per shipped feature
- [ ] Update resume bullet points as projects ship ("Built X used by Y, resulting in Z")

## Shipped beyond the original plan
- [x] Trade journal on the paper-trading page (date/ticker/action/thesis/exit condition, local JSON store)
- [x] `projects/paper-trading/STRATEGY.md` — core-satellite strategy doc with quantum-computing and dip-buying satellite templates, SPY benchmark
- [x] Shared nav bar across all pages
- [x] Dark mode consistency fix (`color-scheme` so native form controls follow the theme too)
- [x] 10-K analyzer ratio color-coding (green/yellow/red dot + label per ratio vs. rough thresholds)

## To do
- [ ] Research candidate stocks for the paper-trading account (using the 10-K analyzer + AI persona panel) — Ethan, not a build task

## Open blockers
- `STRATEGY.md` still has `TODO(ethan)` placeholders for your actual allocation %, tickers, and thresholds.

## Definition of "done" for each project
1. Works on mobile
2. Has a 2-minute demo path a recruiter can follow without instructions
3. Has a short write-up: what it does, what you learned, tech used
4. Linked from the portfolio homepage with a screenshot
