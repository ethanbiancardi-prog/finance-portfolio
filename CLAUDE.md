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
Live at https://site-theta-drab-22.vercel.app. All app code is in `site/src`; `projects/` holds docs only.

**Built & working**
- Homepage — project cards, contact links, theme switcher; terminal-style design system shared across every page (`components/ui/`)
- Paper trading (`/paper-trading`) — Alpaca paper account: equity, positions, buy/sell; trade journal (thesis + exit condition per trade, `site/data/journal.json`); Sharpe / vol / max drawdown / beta risk metrics
- Strategy doc (`projects/paper-trading/STRATEGY.md`) — core-satellite plan, 3 satellites; `TODO(ethan)` placeholders for real tickers/allocations are Ethan's to fill, not a build task
- 10-K analyzer, now inside Stock Research (`/research`; `/statement-analyzer` redirects) — ticker/company search, 17-ratio EDGAR dashboard with color flags, AI red-flag scan, merged news feed (Yahoo RSS + Alpaca), six-persona AI takes
- DCF builder, portfolio optimizer (efficient frontier), Monte Carlo simulator, Quant Notes (7 concepts w/ detail pages)
- Sector rotation — monthly momentum rebalance on the Alpaca account via Vercel Cron (1st of month); Upstash Redis + CRON_SECRET provisioned, live
- `lib/portfolioMath.ts` — shared return/cov/Sharpe/drawdown/beta math used by risk metrics, optimizer, Monte Carlo

**In progress**
- Persona panel wording on `/research` — Ethan still deciding the direction
- EDGAR revenue bug: `lib/edgar.ts` only tries two revenue tags, so some filers show wrong/missing revenue (NVDA, CRWD) — needs a fallback tag list

**Planned next**
- 10-K analyzer: AI-written one-page filing summary
- DCF "AI assumptions mode" (pre-fill from a filing)
- Client-work case study pages (`projects/client-work` is a README placeholder)
- Later: weekly full-portfolio review, strategy backtester (stretch)

Full phase breakdown in `docs/ROADMAP.md`.
