# Architecture

How the site is put together. Companion to `CLAUDE.md` (the short version) and
`docs/FEATURES.md` (what each feature actually does).

## Shape of the repo

```
finance-portfolio/            ← git root (the OUTER folder is not the project)
├── CLAUDE.md
├── docs/                     ← this folder: architecture, features, data/env, roadmap
├── projects/                 ← markdown only. No code lives here.
│   ├── paper-trading/STRATEGY.md   ← the live strategy write-up
│   ├── dcf-builder/, statement-analyzer/, client-work/  ← README stubs
├── shared/                   ← README stub, unused
└── site/                     ← THE ACTUAL APP. Everything real is here.
    ├── src/app/              ← Next.js App Router: pages + /api routes
    ├── src/components/       ← Nav, theme, UI kit (src/components/ui)
    ├── src/lib/              ← all the finance/data logic
    ├── src/data/             ← clientWork.ts case studies
    ├── public/screenshots/   ← homepage card thumbnails
    ├── scripts/              ← screenshots.js, sell-core.js
    └── vercel.json           ← cron definitions
```

`projects/` is documentation. If you are changing behaviour, you are editing `site/src`.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 ·
Recharts · `@anthropic-ai/sdk` · `@upstash/redis` · `@supabase/ssr` · `pdf-parse`.
Node 24 on Vercel.

There is no Python. Server state is Upstash Redis (via Vercel KV) for caches and
strategy state, plus Supabase (auth + Postgres) for per-user data — currently the
trade journal, with Row Level Security enforcing ownership
(`supabase/migrations/`).

## Pages

| Route | What it does |
|---|---|
| `/` | Homepage — project cards with screenshot thumbnails, contact links |
| `/about` | Bio, coursework, skills, contact |
| `/research` | **Stock Research** — three tabs: Search, Browse by Sector, Research Signals |
| `/paper-trading` | Live Alpaca paper account: equity, positions, buy/sell, risk metrics |
| `/login` | Email + password sign-in / sign-up (Supabase) |
| `/dashboard` | Signed-in only: account details and your trade journal |
| `/rotation` | Momentum + Leverage strategy dashboard: current picks, regime state, rebalance button |
| `/dcf-builder` | Interactive DCF with sensitivity grid; "Load from a 10-K" prefill |
| `/optimizer` | Efficient frontier sampled across user-entered tickers |
| `/monte-carlo` | 10,000 simulated portfolio paths, fan chart, goal probability |
| `/quant/backtester` | Regime Backtester — the live strategy through four synthetic regimes |
| `/quant/factor-risk` | Factor Risk Attribution — market/rates/inflation variance breakdown |
| `/quant/vol-smile` | Options volatility smile (SVI) with Black-Scholes price/delta |
| `/quant` | Redirects to `/quant/backtester` |
| `/quant-notes` | Index of 7 plain-language quant explainers |
| `/quant-notes/[slug]` | One explainer: momentum, sharpe-ratio, max-drawdown, beta-capm, correlation-diversification, mean-variance, monte-carlo |
| `/client-work` | Passcode-gated private client case studies (see the warning in CLAUDE.md) |
| `/statement-analyzer` | 301 redirect → `/research` (configured in `next.config.ts`) |

`/quant/*` pages share `app/quant/layout.tsx`, which renders `QuantHubHeader`
(sticky sub-nav). Optimizer and Monte Carlo render that header themselves.

## API routes

All under `site/src/app/api`. Everything runs server-side; no API key ever
reaches the browser.

**Paper trading (Alpaca)**
- `GET /api/paper-trading/account` — account equity/buying power
- `GET /api/paper-trading/positions` — positions, enriched with EDGAR company names
- `GET /api/paper-trading/orders` — recent orders (`?limit=`)
- `GET /api/paper-trading/history` — 1-month equity curve for the chart
- `GET /api/paper-trading/risk-metrics` — Sharpe / vol / max drawdown / beta over 3M
- `GET /api/paper-trading/search` — ticker autocomplete from Alpaca assets
- `GET|POST|DELETE /api/paper-trading/journal` — the signed-in user's trade journal (Postgres `journal_entries`, RLS; 401 when signed out)

**Per-user paper portfolio (Supabase)**
- `GET /api/portfolio` — opens the user's $100,000 account on first call, then returns cash, positions and a daily equity curve vs SPY, all rebuilt from `paper_trades` (`lib/portfolio.ts`)

**Research**
- `GET /api/research/quote` — live quote for one symbol
- `GET /api/research/news` — merged Yahoo RSS + Alpaca headlines
- `GET /api/research/summary` — AI "About the business" from the 10-K's Item 1 (Redis, 90d)
- `GET /api/research/playbook` — AI catalysts + financial verdict + 2-3 actions (Redis, 3h)
- `POST /api/research/analysis` — six-persona AI panel (no cache; ~30s)
- `POST /api/research/simplify` — plain-English rewrite + analogy (Redis, 7d, keyed by text hash)

**10-K / EDGAR**
- `GET /api/statement-analyzer/search` — company/ticker search
- `GET /api/statement-analyzer/lookup` — 17-ratio dashboard from XBRL company facts
- `GET /api/statement-analyzer/industry` — the curated tickers for one sector
- `POST /api/statement-analyzer/red-flags` — AI red-flag scan (3 of 5 checks are pure arithmetic)

**Tools**
- `GET /api/dcf/prefill` — DCF assumptions from the latest 10-K (pure XBRL math, no AI)
- `POST /api/optimizer/frontier` — efficient frontier for a ticker list
- `POST /api/monte-carlo/simulate` — path simulation with SPY/AGG-blended assumptions

**Strategy**
- `GET /api/rotation/status` — recomputes this month's picks live; places no orders
- `GET /api/rotation/run` — **executes trades.** Gated by `CRON_SECRET`. Monthly cron
- `POST /api/rotation/run` — manual "Run Rebalance Now" button (no secret)
- `GET /api/rotation/check` — manual regime check; secret-gated

**Signals**
- `GET /api/signals` — read-only, serves the Redis cache. Never calls upstream or the model
- `POST /api/signals/refresh` — forces a refresh. Secret-gated. `?category=` optional

**Other**
- `GET /api/cron/daily` — weekdays 22:00 UTC: regime check + all five signal refreshes
- `POST /api/client-work/auth` — passcode → 30-day httpOnly session cookie

## Key libraries (`site/src/lib`)

- `alpaca.ts` — Alpaca paper REST wrapper, asset search (1h in-memory cache)
- `marketdata.ts` — quotes and daily bars
- `edgar.ts` — SEC EDGAR: ticker resolution, company facts, 17 ratios, filing text
- `dcf.ts` / `dcfPrefill.ts` — DCF model and the XBRL-derived assumptions
- `portfolioMath.ts` — shared return/covariance/Sharpe/drawdown/beta math
- `optimizer.ts`, `monteCarlo.ts`, `riskMetrics.ts` — the three quant tools' math
- `regimeBacktest.ts`, `factorRisk.ts`, `volSmile.ts` — the `/quant/*` tools (pure client math, no APIs)
- `rotation.ts`, `rotationRun.ts`, `rotationStore.ts`, `regimeCheck.ts` — the live strategy
- `sectors.ts` — the 8-sector curated universe (communications, consumer, energy, financials, healthcare, industrials, sustainability, technology)
- `signals/` — `political.ts`, `senate.ts`, `presidential.ts`, `committees.ts`, `aiSignals.ts`, `financial.ts`, `performance.ts`
- `researchBriefing.ts` — the shared briefing (ratios + price + headlines) every AI research feature is grounded on
- `glossary.ts` / `jargon.ts` — hover definitions; `kv.ts` — Redis client; `format.ts` — display helpers

## UI conventions

- **Two visual styles**, switchable next to Theme: Modern (default) and Terminal.
  Both are CSS variables on `<html data-style>` in `globals.css`.
- Use the token classes — `.caps`, `.section-title`, `.page-title`,
  `rounded-[var(--radius)]` — never hard-code one style's look.
- Build from `src/components/ui` (`PageShell`, `Card`, `Section`, `StatCard`,
  `Tabs`, `Button`, `Chip`, `Callout`, `Slider`, `TickerSearch`, `Term`).
- Theme mode/accent/style are applied by an inline script in `layout.tsx`
  before first paint, so there is no flash.
- Mobile-friendly is a hard requirement, not a nice-to-have.
- Hover glossary: `Term` + `lib/glossary.ts`; `StatCard term="sharpe"`.
  Definitions come from the Quant Notes, so add the note first.
- Wrap new AI-written text in `SimpleText` / `JargonText` so it participates in
  the "Explain simply" toggle.

## Visual identity (Sep 23 2026 redesign)

- The site is named **PRISM** in the homepage masthead eyebrow. It is a
  wordmark only — no logo file, no other branding to keep in sync.
- The homepage is deliberately **not** built from `PageShell`/`Card`: it is a
  masthead, a live account snapshot (`lib/homeSnapshot.ts`, with a sparkline)
  and a ruled index of projects. It still reads only from theme tokens, so
  mode/accent/style switching keeps working.
- **Fonts** are all `next/font/google`, loaded in `layout.tsx` as CSS
  variables: EB Garamond for body and prose (`--font-eb-garamond`, set a
  couple of steps larger because of its small x-height), Newsreader and
  Fraunces as display faces selected by `--font-display`, Geist and Geist Mono
  for UI and numerals.
- **Two loaders, no skeleton bars.**
  - `PageLoading` — shown while a page's JS chunk (and its Recharts import)
    streams in. Draws a fixed, hand-written equity curve on a grid with a scan
    line; pure CSS, keyframes in `globals.css`. The path is hand-written, not
    random, so server and client render identically.
  - `GeometricLoader` — a hexagon of six facets that fold inward in sequence
    while work is in flight, then reconstruct into a whole hexagon when it
    finishes. Use `<GeometricLoader loading={busy} />` and keep rendering it
    after the work ends so the reconstruct can play; it unmounts itself.
    It has **no progress arc on purpose** — an AI scan can take thirty seconds
    and vary a lot, so a progress indicator would be inventing information.
- Rendered copy and AI prompts contain **no em dashes** (Sep 23 sweep). Keep it
  that way when adding user-facing text or prompt instructions.
