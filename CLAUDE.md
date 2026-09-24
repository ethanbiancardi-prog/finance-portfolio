# CLAUDE.md

## The project

A Finance × AI portfolio site — "PRISM" in the masthead — for **Ethan
Biancardi**, a Bentley University student double-majoring in Finance and
Artificial Intelligence. The goal is landing finance/fintech internships by
showing *working tools* instead of a resume bullet: real market data, real
filings, real AI. Every feature has to survive the question "explain how this
works." Favour simple, readable code and comment the financial formulas.

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
- Vercel project `site`, root directory `site/`, Next.js preset.

## Where things are

The repo is **nested**: `finance-portfolio/finance-portfolio/` — the outer
folder is not the repo. Inside it, `site/` is **the entire app** (`src/app` =
pages + `/api` routes, `src/components`, `src/lib` = all finance logic,
`scripts/` = one-off Node); `projects/` is markdown only, no code, and holds
the live strategy write-up at `projects/paper-trading/STRATEGY.md`; `docs/` is
the long-form documentation listed at the bottom of this file.

Stack: Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · Recharts ·
`@anthropic-ai/sdk` · Upstash Redis · `pdf-parse` · `fflate`. No database, no
Python — server state is Redis plus one JSON file for the trade journal. AI
calls use `claude-opus-5` (red-flags still on `claude-opus-4-8`).

## Every route

**Pages**
- `/` — homepage: masthead, live account snapshot, ruled index of the projects
- `/about` — bio, coursework, skills
- `/research` — Stock Research: Search · Browse by Sector · Research Signals
- `/paper-trading` — live Alpaca paper account: equity, positions, buy/sell, journal, risk metrics
- `/rotation` — Momentum + Leverage strategy: current picks, regime state, rebalance
- `/dcf-builder` — interactive DCF with sensitivity grid and 10-K/TTM prefill
- `/optimizer` — efficient frontier across user-entered tickers
- `/monte-carlo` — 10,000 simulated portfolio paths and goal probability
- `/quant/backtester` — the live strategy run through four synthetic regimes
- `/quant/factor-risk` — market/rates/inflation variance attribution
- `/quant/vol-smile` — options volatility smile with Black-Scholes price and delta
- `/education` and `/education/[slug]` — two tracks: tool guides and finance fundamentals, with search
- `/client-work` — passcode-gated private client case studies
- Redirects: `/quant` → `/quant/backtester`, `/statement-analyzer` → `/research`, `/quant-notes(/:slug)` → `/education`

**API** (all server-side; no key ever reaches the browser)
- `/api/paper-trading/*` — `account`, `positions`, `orders`, `history`, `risk-metrics`, `search`, `journal`
- `/api/research/*` — `quote`, `news`, `summary` (AI), `playbook` (AI), `analysis` (AI six-persona panel), `simplify` (AI)
- `/api/statement-analyzer/*` — `search`, `lookup` (17 ratios), `industry`, `red-flags` (AI)
- `/api/dcf/prefill` — DCF assumptions from EDGAR facts, pure XBRL math; `/api/optimizer/frontier` and `/api/monte-carlo/simulate` — the two solvers
- `/api/rotation/status` — recomputes picks, places no orders; `/api/rotation/check` — manual regime check, secret-gated
- `/api/rotation/run` — **executes trades**; `CRON_SECRET`-gated on GET, open on POST for the demo button
- `/api/signals` — read-only, serves the Redis cache; `/api/signals/refresh` — forces a refresh, secret-gated
- `/api/cron/daily` — weekday regime check + all five signal refreshes; `/api/client-work/auth` — passcode → 30-day session cookie

## Data sources

**Alpaca paper API** (account, quotes, bars) · **SEC EDGAR** (filings, XBRL
facts, ratios) · **Anthropic API** (all AI features, the only paid one) ·
**political trade sources** — House Clerk PTR PDFs, efdsearch.senate.gov,
open-cabinet.org's OGE 278-T extraction, and the congress-legislators dataset
for committee overlap · Yahoo Finance RSS for headlines. Full table with
licences and caveats: `docs/DATA_AND_ENV.md`.

## Environment variables (names only — never commit or print values)

Local: `site/.env.local`, gitignored. Production: Vercel project settings.
**Required** `ANTHROPIC_API_KEY` (read implicitly by `new Anthropic()`),
`APCA_API_KEY_ID`, `APCA_API_SECRET_KEY`, `KV_REST_API_URL`,
`KV_REST_API_TOKEN`, `CRON_SECRET`. **Optional** `CLIENT_WORK_PASSCODE`,
`CLIENT_WORK_SECRET`, `SIGNALS_DEBUG`. `KV_URL`, `REDIS_URL`,
`KV_REST_API_READ_ONLY_TOKEN` and `VERCEL_OIDC_TOKEN` are Vercel-provisioned
and unread by app code.

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
6. **Frame research as signals, not recommendations.** No buy/sell language —
   these are leads worth reading about, with the evidence shown.
7. Never commit secrets, and never print a key's value.
8. Mobile-friendly is required, not optional.
9. Build from the UI kit in `src/components/ui` and the style tokens (`.caps`,
   `.section-title`, `rounded-[var(--radius)]`) — the site has two visual
   styles (Modern and Terminal) and hard-coding either one breaks the other.

## Windows setup — already solved, don't re-litigate

- **Run Claude Code from PowerShell, not Git Bash.**
- **Restart the dev server after changing `.env.local`** — Next.js reads it at
  startup only.
- **The nested folder:** repo root is `finance-portfolio/finance-portfolio`,
  the app one level deeper in `site/`. The working copy is
  `C:\Users\ethan\Downloads\finance-portfolio\finance-portfolio`; other
  `finance-portfolio` folders exist on this machine, and the one under
  `.gemini/antigravity/scratch` is Gemini Antigravity's clone, not yours.

## Off-limits

`/client-work`, `src/components/client-work/`, `src/data/clientWork.ts` and
`api/client-work/` are built by **Gemini Antigravity** as a separate,
non-finance project. Don't edit them — rebase over its commits instead.

## Status (as of Sep 24 2026)

**Built and working** — every route listed above. Stock Research covers search,
sector browse, the 17-ratio dashboard, AI summary/playbook/red-flags/persona
panel and "Explain simply"; all four Research Signals categories run daily.
Landed Sep 23-24: the homepage redesign and loaders, DCF and ratios built on
trailing-twelve-month numbers rather than the last annual report, and EDGAR
following a ticker back to its predecessor registrant (the XOM holding-company
case) — see `docs/FEATURES.md`.

**In progress** — the strategy switch. Code and docs are done, the trades are
waiting on Ethan: the old passive ETF core must be sold via
`site/scripts/sell-core.js --execute` before a rebalance will place anything.
Whether that has happened isn't visible from the code — check the live account.

**Next up** — stream the six-persona AI takes in as they generate (the panel
takes ~30s and shows only "Analyzing..."). Later: weekly full-portfolio review,
then a real strategy backtester (stretch).

**Known issue, parked** — `/client-work` falls back to a passcode hard-coded in
a public repo because `CLIENT_WORK_PASSCODE` is set neither locally nor in
Vercel. Ethan hasn't decided what the section becomes, so don't fix or redesign
it unless he raises it. Details in `docs/DATA_AND_ENV.md`.

## Longer docs

- `docs/ARCHITECTURE.md` — repo shape, every route and API, key libraries, UI conventions, visual identity
- `docs/FEATURES.md` — each feature in depth, including the EDGAR rules that must not be broken
- `docs/DATA_AND_ENV.md` — data sources, caching and TTLs, cron budget, env var names, local setup
- `docs/ROADMAP.md` build plan · `docs/PROJECT_IDEAS.md` backlog · `projects/paper-trading/STRATEGY.md` the live strategy
