# Roadmap (semester-friendly)

## Phase 0 — Foundation (week 1)
- [x] Create GitHub repo, push this scaffold
- [x] Write CLAUDE.md at repo root (conventions, stack, goals) so Claude Code has context every session
- [x] Ship a one-page portfolio site: name, headline ("Finance × AI @ Bentley"), placeholder project cards, contact links
- [x] Deploy it (Vercel) — https://site-theta-drab-22.vercel.app

## Phase 1 — Quick wins (weeks 2–3)
- [ ] Client-work case study pages (projects/client-work)
- [ ] DCF builder v1: manual inputs, live valuation, sensitivity table

## Phase 2 — AI wow-factor (weeks 4–6)
- [x] 10-K analyzer: pull from SEC EDGAR, compute ratio dashboard (Search by ticker + Browse by Industry, sorted by public float)
- [ ] 10-K analyzer: AI-written one-page summary per filing
- [ ] Add "AI assumptions mode" to the DCF builder (blocked on DCF builder existing)

## Phase 3 — Flagship (weeks 7–12)
- [x] Paper trading simulator v1: manual trades, real prices, P&L dashboard (Alpaca paper account — equity, positions, recent orders, buy/sell form)
- [x] v2a: AI analyst commentary — six-persona panel per ticker (Bull, Bear, Accountant, Risk Manager, Historian, Indexer), blocked on Anthropic account credits
- [ ] v2b: weekly full-portfolio review
- [ ] v3 (stretch): simple strategy backtester

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
- Anthropic API key has no credit balance — add credits at console.anthropic.com before the AI Analysis panel returns real results.
- `STRATEGY.md` still has `TODO(ethan)` placeholders for your actual allocation %, tickers, and thresholds.

## Definition of "done" for each project
1. Works on mobile
2. Has a 2-minute demo path a recruiter can follow without instructions
3. Has a short write-up: what it does, what you learned, tech used
4. Linked from the portfolio homepage with a screenshot
