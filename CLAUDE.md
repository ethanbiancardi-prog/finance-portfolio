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
- Homepage — project cards with screenshot thumbnails (`public/screenshots/`, regenerate with `site/scripts/screenshots.js` when pages change; thumbnails hidden on phones), contact links. **Two visual styles**, switchable next to Theme: Modern (default — Geist sans, sentence case, 10px radius, soft panels) and Terminal (the original all-mono uppercase look). Both are CSS variables on `<html data-style>` in `globals.css`; components use `.caps` / `.section-title` / `.page-title` / `rounded-[var(--radius)]` instead of hard-coding either look — keep it that way when adding UI. Nav is Home · Tools ▾ · Research · Quant Notes · About; pages fade in via `.page-enter`
- Paper trading (`/paper-trading`) — Alpaca paper account: equity, positions, buy/sell, auto-refresh every 60s with an "updated" stamp; trade journal (thesis + exit condition per trade, `site/data/journal.json`); Sharpe / vol / max drawdown / beta risk metrics
- Strategy doc (`projects/paper-trading/STRATEGY.md`) — rewritten Sep 2026 for the Momentum + Leverage strategy; no TODOs left
- 10-K analyzer, now inside Stock Research (`/research`; `/statement-analyzer` redirects) — ticker/company search, auto-loaded "About the business" summary (AI-written from the 10-K's Item 1, cached in Redis per filing — `api/research/summary`), "Catalysts & what you could do" (`api/research/playbook`, auto-loads, 3h Redis cache): catalysts from the headlines, a financial-health verdict from the ratios, and 2-3 options each with an action button that pre-fills the paper-trading order/journal (`/paper-trading?ticker=&side=&thesis=` or `?journal=&thesis=`) or opens the DCF; live quote with timestamp, 17-ratio EDGAR dashboard with color flags, AI red-flag scan, merged news feed (Yahoo RSS + Alpaca), six-persona AI takes (`api/research/analysis`). Both AI features share `lib/researchBriefing.ts` — ratios, price + market cap/P-E from the cover-page share count, headlines — and show "based on" under the output
- DCF builder — "Load from a 10-K" fills every assumption from a real filing (`api/dcf/prefill` + `lib/dcfPrefill.ts`, pure XBRL arithmetic, no AI) and shows a "where these numbers come from" panel with the formula and caveats per field; WACC/terminal growth stay the user's; `?ticker=` deep link from the research dashboard ("Build a DCF from this filing") and back
- Portfolio optimizer (efficient frontier), Monte Carlo simulator, Quant Notes (7 concepts w/ detail pages)
- Momentum + Leverage strategy (`/rotation`, was "Sector Rotation") — aggressive rule-based book: 60% top-10 risk-adjusted momentum across the 8 curated sectors (max 3/sector), 30% TQQQ+SOXL, 10% cash; SPY-below-200-day circuit breaker checked every weekday after the close (`api/rotation/check`, rebalances only on a flip); monthly Vercel Cron (1st); refuses to buy on margin. Trade execution lives in `lib/rotationRun.ts`. Designed Sep 17 2026 at Ethan's request for high risk/high reward; NOT yet executed — the old passive ETF core (VOO/BND/VEA/VXF/VWO/VNQ/GLD, ~$80k) must be sold first (`site/scripts/sell-core.js --execute`), then Run Rebalance. Universe in `lib/sectors.ts` (Sustainability = BIG fund holdings, keep in sync). Full write-up: `projects/paper-trading/STRATEGY.md`
- `lib/portfolioMath.ts` — shared return/cov/Sharpe/drawdown/beta math used by risk metrics, optimizer, Monte Carlo
- Hover glossary — `components/ui/Term` + `lib/glossary.ts`; `StatCard term="sharpe"` etc. shows a definition on hover/tap with a link to the Quant Note. Definitions come from the notes where one exists, so add new terms there first

**In progress**
- Strategy switch: code + docs are done; the actual trades (sell core, first rebalance) are waiting on Ethan.
- Persona names/character are staying as-is (Ethan's call, Sep 2026); the stale-data problem was fixed by briefing the model, not by rewording.

**Planned next**
- Client-work case study pages (`projects/client-work` is a README placeholder)
- Stream the AI takes in as they generate — the panel takes ~30s and only shows "Analyzing..." meanwhile
- Later: weekly full-portfolio review, strategy backtester (stretch)

Full phase breakdown in `docs/ROADMAP.md`.
