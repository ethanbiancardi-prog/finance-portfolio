# CLAUDE.md

## Project
Finance + AI portfolio for a Bentley University student (Finance major, AI secondary major).
Goal: land finance/fintech internships by showcasing working tools.

## Stack
Next.js + Tailwind + Recharts. Python/FastAPI only for heavy analysis. Deployed on Vercel.

## Conventions
- Each project lives in projects/<name>, self-contained
- Prefer simple, readable code over clever code — I'm learning
- Explain financial formulas in comments (I want to be able to defend every line in an interview)
- Mobile-friendly is required
- Never commit API keys; use .env.local

## Current Status

**Built & working:**
- Homepage — project cards, contact links (deployed: https://site-theta-drab-22.vercel.app)
- Shared UI system (`site/src/components/ui/`) — Card, Button, Field, StatusDot/Badge, StatCard, Tabs, Chip, PageShell, plus `lib/format.ts` and shared Recharts/table styling — every page is built from these
- DCF builder — full FCF build, 5yr projection, Gordon growth terminal value, WACC x terminal growth sensitivity grid vs. current price
- Statement analyzer (10-K) — SEC EDGAR lookup by ticker or browse-by-industry, ratio dashboard with color-coded flags
- Paper trading — Alpaca paper account (equity, positions, orders, buy/sell), trade journal (thesis/exit condition per trade), six-persona AI commentary panel (Bull/Bear/Accountant/Risk Manager/Historian/Indexer), Sharpe/volatility/max-drawdown/beta-vs-SPY risk metrics
- Sector rotation strategy — automated monthly rebalance across tech/biotech/consumer by risk-adjusted momentum, 20% position-size cap, scheduled via Vercel Cron (Upstash Redis + CRON_SECRET provisioned, fully live)
- Portfolio optimizer — samples the efficient frontier across user-entered tickers, max-Sharpe/min-variance highlights, risk slider
- Monte Carlo simulator — 10,000 simulated paths from real SPY/AGG history, percentile fan chart, probability of hitting a savings goal
- Quant Notes — plain-language write-up of the math behind the above, each section linking to the live page that demonstrates it
- `lib/portfolioMath.ts` — shared return/covariance/Sharpe/drawdown/beta primitives used by risk metrics, the optimizer, and Monte Carlo
- `projects/paper-trading/STRATEGY.md` — core-satellite strategy doc, now 3 satellites (still has TODO placeholders for actual tickers/allocations — that's on Ethan, not a build task)

**In progress / next up:**
- Client-work case study pages (`projects/client-work` is still a placeholder)
- 10-K analyzer: AI-written one-page filing summary
- DCF "AI assumptions mode" (pre-fill from a filing)

**Planned later:** weekly full-portfolio review (paper trading v2b), strategy backtester (v3, stretch)

See `docs/ROADMAP.md` for full detail and phase breakdown.
