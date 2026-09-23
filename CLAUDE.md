# CLAUDE.md

## The project

A Finance × AI portfolio site for **Ethan Biancardi**, a Bentley University
student double-majoring in Finance and Artificial Intelligence. The goal is
landing finance/fintech internships by showing *working tools* instead of a
resume bullet — real market data, real filings, real AI.

Every feature has to survive the question "explain how this works." Favour
simple, readable code and comment the financial formulas.

## How Ethan wants to work

- **He is a beginner.** Explain things simply and skip the jargon. If a term is
  unavoidable, define it once in a few words.
- **Be concise.** Short answers, no preamble, no restating the task.
- **Stop after each phase so he can test.** Don't chain three features
  together — build one, say what to check, wait.
- Say plainly when something is broken, unverified, or skipped.

## Live site & deploy

- **Live:** https://site-theta-drab-22.vercel.app
- **Deploy:** push to `main` on `github.com/ethanbiancardi-prog/finance-portfolio`
  → Vercel auto-deploys to production. No manual step.
- Vercel project `site`, root directory `site/`, Next.js preset, Node 24.

## Where things are

The repo is **nested**: `finance-portfolio/finance-portfolio/` — the outer
folder is not the repo. Inside it:

- `site/` — **the entire app.** `src/app` (pages + `/api` routes),
  `src/components`, `src/lib` (all finance logic).
- `projects/` — markdown only, no code. `projects/paper-trading/STRATEGY.md` is
  the live strategy write-up.
- `docs/` — the long-form documentation listed at the bottom of this file.

Stack: Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · Recharts ·
`@anthropic-ai/sdk` · Upstash Redis. No database, no Python.

## Every route

**Pages**
- `/` — homepage, project cards with screenshot thumbnails and contact links
- `/about` — bio, coursework, skills
- `/research` — Stock Research: Search · Browse by Sector · Research Signals
- `/paper-trading` — live Alpaca paper account: equity, positions, buy/sell, journal, risk metrics
- `/rotation` — Momentum + Leverage strategy: current picks, regime state, rebalance
- `/dcf-builder` — interactive DCF with sensitivity grid and 10-K prefill
- `/optimizer` — efficient frontier across user-entered tickers
- `/monte-carlo` — 10,000 simulated portfolio paths and goal probability
- `/quant/backtester` — the live strategy run through four synthetic regimes
- `/quant/factor-risk` — market/rates/inflation variance attribution
- `/quant/vol-smile` — options volatility smile with Black-Scholes price and delta
- `/quant-notes` and `/quant-notes/[slug]` — 7 plain-language quant explainers
- `/client-work` — passcode-gated private client case studies
- Redirects: `/quant` → `/quant/backtester`, `/statement-analyzer` → `/research`

**API** (all server-side; no key ever reaches the browser)
- `/api/paper-trading/*` — `account`, `positions`, `orders`, `history`, `risk-metrics`, `search`, `journal`
- `/api/research/*` — `quote`, `news`, `summary` (AI), `playbook` (AI), `analysis` (AI panel), `simplify` (AI)
- `/api/statement-analyzer/*` — `search`, `lookup` (17 ratios), `industry`, `red-flags` (AI)
- `/api/dcf/prefill` — DCF assumptions from a 10-K, pure XBRL math
- `/api/optimizer/frontier`, `/api/monte-carlo/simulate` — the two solvers
- `/api/rotation/status` — recomputes picks, places no orders; `/api/rotation/check` — manual regime check, secret-gated
- `/api/rotation/run` — **executes trades**; `CRON_SECRET`-gated on GET, open on POST for the demo button
- `/api/signals` — read-only, serves the Redis cache; `/api/signals/refresh` — forces a refresh, secret-gated
- `/api/cron/daily` — weekday regime check + all five signal refreshes
- `/api/client-work/auth` — passcode → 30-day httpOnly session cookie

## Data sources

**Alpaca paper API** (account, quotes, bars) · **SEC EDGAR** (filings, XBRL
facts, ratios) · **Anthropic API** (all AI features, the only paid one) ·
**political trade sources** — House Clerk PTR PDFs, efdsearch.senate.gov,
open-cabinet.org's OGE 278-T extraction, and the congress-legislators dataset
for committee overlap. Plus Yahoo Finance RSS for headlines.

Full table with licences and caveats: `docs/DATA_AND_ENV.md`.

## Project rules

1. **Keys stay server-side.** Everything external goes through an API route.
   No key in a client component, ever.
2. **Cache external data. Never call a paid API on page load.** `/api/signals`
   reads cache only; refreshes run on the cron or a secret-gated route. Redis
   via `lib/kv.ts` (`getRedis()`, guarded by `kvConfigured()`).
3. **Cron budget is 2 on Vercel's free tier and both are used** — monthly
   rebalance and `api/cron/daily`. Add new daily work *inside* `api/cron/daily`.
4. **Every AI claim needs a source and a date.** AI features are grounded on
   `lib/researchBriefing.ts` and must cite it; unfetchable data is labelled
   "not available" rather than invented. AI signals are dropped unless the
   source URL appeared in that run's search results, the event is inside the
   window, and the ticker resolves at SEC.
5. **Disclaimers stay on research features.** "Educational, not investment
   advice" / "research leads, not advice" is visible on the signals panel and
   the quant tools. Don't remove or bury them.
6. **Frame research as signals, not recommendations.** No buy/sell language.
   These are leads worth reading about, with the evidence shown.
7. Never commit secrets. `site/.env.local` is gitignored.
8. Mobile-friendly is required, not optional.
9. Use the UI kit in `src/components/ui` and the style tokens (`.caps`,
   `.section-title`, `rounded-[var(--radius)]`) — the site has two visual
   styles (Modern and Terminal) and hard-coding either one breaks the other.

## Windows setup — already solved, don't re-litigate

- **Run Claude Code from PowerShell, not Git Bash.**
- **Restart the dev server after changing `.env.local`** — Next.js reads it at
  startup only.
- **The nested folder:** repo root is `finance-portfolio/finance-portfolio`,
  and the app is one level deeper in `site/`.
- The working copy is `C:\Users\ethan\Downloads\finance-portfolio\finance-portfolio`.
  Other `finance-portfolio` folders exist on this machine — the one under
  `.gemini/antigravity/scratch` is Gemini Antigravity's clone, not yours.

## Off-limits

`/client-work`, `src/components/client-work/`, `src/data/clientWork.ts` and
`api/client-work/` are built by **Gemini Antigravity** as a separate,
non-finance project. Don't edit them — rebase over its commits instead.

## Status (as of Sep 22 2026)

**Built and working** — homepage, About, Stock Research (search, sector browse,
10-K ratio dashboard, AI summary/playbook/red-flags/persona panel, "Explain
simply"), all four Research Signals categories, paper trading with journal and
risk metrics, DCF builder with 10-K prefill, optimizer, Monte Carlo, the three
`/quant/*` tools, Quant Notes, the Momentum + Leverage dashboard and its crons.

**In progress** — the strategy switch: code and docs are done, but the actual
trades are waiting on Ethan. The old passive ETF core (~$80k) must be sold via
`site/scripts/sell-core.js --execute` before the first rebalance.

**Next up** — stream the six-persona AI takes in as they generate (the panel
takes ~30s and shows only "Analyzing..."). Later: weekly full-portfolio review,
then a real strategy backtester (stretch).

**Known issue, parked** — `/client-work` falls back to a passcode hard-coded in
a public repo because `CLIENT_WORK_PASSCODE` is set neither locally nor in
Vercel. Ethan hasn't decided what the section becomes, so don't fix it or
redesign it unless he raises it. Details in `docs/DATA_AND_ENV.md`.

## Longer docs

- `docs/ARCHITECTURE.md` — repo shape, every route and API, key libraries, UI conventions
- `docs/FEATURES.md` — what each feature does in depth, including the EDGAR rules that must not be broken
- `docs/DATA_AND_ENV.md` — data sources, caching and TTLs, cron budget, env var names, local setup, Windows notes
- `docs/ROADMAP.md` — phase-by-phase build plan; `docs/PROJECT_IDEAS.md` — the backlog
- `projects/paper-trading/STRATEGY.md` — the live strategy write-up
