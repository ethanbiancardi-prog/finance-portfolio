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
- Homepage — project cards with screenshot thumbnails (`public/screenshots/`, regenerate with `site/scripts/screenshots.js` when pages change), contact links, theme switcher; mono/dark design system shared across every page (`components/ui/`) — terminal glyphs (`//`, `[ ]`, `$ ~/`, blinking cursor, custom cursor) were removed Sep 2026 for a cleaner look
- Paper trading (`/paper-trading`) — Alpaca paper account: equity, positions, buy/sell, auto-refresh every 60s with an "updated" stamp; trade journal (thesis + exit condition per trade, `site/data/journal.json`); Sharpe / vol / max drawdown / beta risk metrics
- Strategy doc (`projects/paper-trading/STRATEGY.md`) — core-satellite plan, 3 satellites; `TODO(ethan)` placeholders for real tickers/allocations are Ethan's to fill, not a build task
- 10-K analyzer, now inside Stock Research (`/research`; `/statement-analyzer` redirects) — ticker/company search, live quote with timestamp, 17-ratio EDGAR dashboard with color flags, AI red-flag scan, merged news feed (Yahoo RSS + Alpaca), six-persona AI takes (`api/research/analysis` briefs the model with the ratios, price, and headlines and shows "based on" under the output)
- DCF builder, portfolio optimizer (efficient frontier), Monte Carlo simulator, Quant Notes (7 concepts w/ detail pages)
- Sector rotation — monthly momentum rebalance on the Alpaca account via Vercel Cron (1st of month); Upstash Redis + CRON_SECRET provisioned, live. Universe is the curated list in `lib/sectors.ts` (8 sectors x ~12 household names + 4 index ETFs, 18 positions) — same list drives the research page's Browse by Sector tab
- `lib/portfolioMath.ts` — shared return/cov/Sharpe/drawdown/beta math used by risk metrics, optimizer, Monte Carlo

**In progress**
- Nothing mid-flight. Persona names/character are staying as-is (Ethan's call, Sep 2026); the stale-data problem was fixed by briefing the model, not by rewording.

**Planned next**
- 10-K analyzer: AI-written one-page filing summary
- DCF "AI assumptions mode" (pre-fill from a filing)
- Client-work case study pages (`projects/client-work` is a README placeholder)
- Stream the AI takes in as they generate — the panel takes ~30s and only shows "Analyzing..." meanwhile
- Later: weekly full-portfolio review, strategy backtester (stretch)

Full phase breakdown in `docs/ROADMAP.md`.
