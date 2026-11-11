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

- **Live:** https://ethanbiancardi.vercel.app
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

Data: Supabase Postgres holds the trade journal, paper portfolios and the
Calibration Tracker's predictions (RLS on, policies in `supabase/migrations/`). Everything else is still Redis or a flat file.

Stack: Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · Recharts ·
`@anthropic-ai/sdk` · Upstash Redis · Supabase · `pdf-parse` · `fflate`. No
Python — server state is Redis, plus Postgres for the trade journal. AI
calls use `claude-opus-5`.

## Every route

**Pages**
- `/` — homepage: masthead, live snapshot of the showcase portfolio, ruled index of the projects
- `/about` — bio, coursework, skills, contact form
- `/research` — Stock Research: Industry Charts (the default tab) · Market News · Growth Stocks · Search · Research Signals. Growth Stocks (`lib/growthScreen.ts`, `/api/research/growth`) checks every S&P 500 company against a strict O'Neil/IBD-style checklist (profitable; profits +25%/yr over 3 years, up every year; net margin ≥10%; ROE ≥17%; sales +20% and accelerating; industry leader = Relative Price Score 80+ vs the S&P 500 and 75+ within its sector; above 50/200-day and within 15% of the 52-week high; funds buying = number of 13F filers holding it rose last quarter faster than the median stock's, from static `src/lib/institutions.json` built offline by `scripts/institutions/build-institutions.ts` from the SEC 13F data sets + OpenFIGI CUSIP→ticker, rerun quarterly; lenient-threshold backtest in `scripts/backtest-growth-checklist.ts` → `projects/paper-trading/GROWTH_CHECKLIST_BACKTEST.md`), shown as a shortlist, not buy signals: SEC numbers in Redis hash `growth:fund:v1` (a fifth refreshed each weekday by `api/cron/daily`; `scripts/seed-growth.ts` fills all at once from `.ml-cache/sp500`), chart numbers cached per trading day. Industry Charts uses the **research list** `lib/researchUniverse.ts` (~210 stocks, 12 sectors: the bots' `sectors.ts` stocks plus extras, which the Signal Trader and the 10-K "financial story" signals also use since Nov 4 2026; Momentum, Strategy Lab and the Rule Tester stay on the ~94; every symbol checked trading Nov 4 2026) and puts every stock's % return on one chart per sector (plus sector averages vs SPY), periods 1M–5Y; clicking a stock's card opens it in Search
- `/paper-trading` — the showcase portfolio, view-only: Ethan's own dashboard paper account (`SHOWCASE_USER_ID`), traded by the Signal Trader algorithm (scores the ~210 research-list stocks, `lib/researchUniverse.ts`, on 10-K story, price trend and momentum; insider buying dropped Nov 2026), vs. SPY; the algorithm's rules and recent orders with reasons, risk metrics, positions, trades
- `/rotation` — Momentum + Leverage strategy on the Alpaca paper account: current picks, regime state, rebalance history
- `/dcf-builder` — interactive DCF with sensitivity grid and 10-K/TTM prefill
- `/optimizer` — efficient frontier across user-entered tickers
- `/monte-carlo` — 10,000 simulated portfolio paths and goal probability
- `/quant/strategy-lab` — five strategies (buy-and-hold SPY, trend following, momentum, mean reversion, breakout) backtested on real daily prices since 2017 across the ~94-stock universe; a "Live portfolios" tab shows momentum, breakout and mean reversion trading their own $100K paper accounts every 15 minutes against a buy-and-hold S&P 500 control account
- `/quant/rule-tester` — Rule Tester: four plain-English switches for the Signal Trader's rules (sector cap, stop-loss, trailing stop, market filter) → growth of $100K since 2017 vs SPY, a "lucky or real?" check (beat SPY in both 2017–21 and 2022–26?), and AI models vs simple rules. All 36 combinations precomputed into `public/data/rule-tester.json` by `scripts/backtest-timing.ts --export` (price-only copy of the bot; needs the bars cache from `scripts/ml/fetch-data.ts`); ML research code in `src/lib/ml` + `scripts/ml`, reports in `projects/paper-trading/ML_REPORT*.md` and `*_BACKTEST.md`
- `/sustainability` — Sustainable Finance, with its own green "eco" look (scoped tokens in `globals.css`; UI-kit components re-theme inside the `.eco` wrapper). 01 Fund tracker: the BIG Sustainability Fund's 18 holdings (`lib/sustainabilityFund.ts` groups the `SECTORS.sustainability` list) as an equal-weight basket vs SPY from `/api/industries`, plus each holding's Green Score and an "is the fund actually green?" panel. 02 Green Score: every research-list company graded 0–100 **against its own industry** (Consumer split into Staples/Discretionary by S&P sector) on four pillars, each a within-industry percentile: carbon intensity 35%, carbon trend 15%, toxic releases per $1M of sales 25% (EPA TRI), climate target 25% (SBTi dashboard); a pillar with no variation in an industry doesn't count there; <1 t CO2e or <0.1 lb toxics per $1M counts as zero. Static `public/data/green.json` built offline: `scripts/green/fetch-green.ts` (TRI csv + SBTi xlsx into `.ml-cache/green`) then `scripts/green/build-green.ts [--unmatched]` (name matching + hand-checked TRI/SBTi aliases; types in `lib/greenScore.ts`). 03 Carbon Intensity (moved here from `/carbon`): S&P 500 companies' US direct (Scope 1) emissions per $1M of revenue, 2019–2023, by sector, with each company's trend and biggest sites. Static `public/data/carbon.json` built offline: `scripts/carbon/fetch-ghgrp.ts` (EPA GHGRP via Envirofacts, free, no key, ~5 min) then `scripts/carbon/build-carbon.ts` (splits facility emissions by ownership share to parents, matches parents to tickers + a hand-checked `ALIASES` table, revenue from the ML fundamentals cache; revenue under $1B is treated as missing)
- `/quant/diffusion` — News Speed (idea #17): how fast 8-K news gets into prices. Every 8-K from the research list since Jul 2021 (SEC acceptance time to the second), grouped by item (earnings 2.02, deals, leadership, restructuring, financing, other, and shareholder votes as a control), direction from the day-1 abnormal return (stock minus SPY); average paths at minute checkpoints in the first session and daily out to 60 days, drift after day 1 with t-stats, half-life. Static `public/data/diffusion.json` built offline: `scripts/diffusion/fetch-events.ts` (SEC submissions) → `fetch-prices.ts` (Alpaca daily + 1-minute SIP bars per reaction session, ~25 min, resumable, cached in `.ml-cache/diffusion`) → `build-diffusion.ts`
- `/quant/backtester` — the live strategy run through four synthetic regimes
- `/quant/factor-risk` — market/rates/inflation variance attribution
- `/quant/vol-smile` — options volatility smile with Black-Scholes price and delta
- `/education` and `/education/[slug]` — two tracks: tool guides and finance fundamentals, with search
- `/login` — email + password sign-in (create account on the same form)
- `/dashboard` — signed-in-only area: name, paper portfolio, strategy, trade journal
- `/calibration` — signed-in-only Calibration Tracker (phase 1): log predictions with my probability vs. the market's at entry; resolve yes/no; Brier scores (mine vs. market) computed server-side. Resolved rows are locked by a DB trigger (`supabase/migrations/0007_prediction_logs.sql`). Read-only Kalshi link (`lib/kalshi.ts`, public market data, no account/key): paste a kalshi.com link or ticker to fill the form (market % = yes bid/ask midpoint); open Kalshi predictions show the live price and, once settled, a "resolve to match" shortcut (still confirmed by hand). Source saved as `Kalshi: <TICKER>`. Automation (Oct 29): Kalshi-linked predictions auto-resolve when the market settles and get one price point a day in `prediction_prices` (0008), drawn as a trail against your probability (`lib/calibrationTracking.ts`, run on page load as the user and from `api/cron/daily` for everyone); "Today's picks" suggests ~5 live markets and **Rapid mode** deals ~50 fast-settling ones (expected settlement within 14 days) as one-at-a-time cards: tap Much lower/Lower/Same/Higher/Much higher (−20…+20 pts vs the crowd) to log instantly via `/api/calibration/rapid`, which reads the live price server-side (`lib/kalshiPicks.ts`: close-time window read in 2-day slices because Kalshi lists 40k+ markets furthest-first; settle time = Kalshi's expected expiration, not close time; 3–6h caches); a calibration chart of your resolved predictions vs. the market's; "Is Kalshi calibrated?" bins ~6,000 settled Kalshi markets by price 1 day / 1 week before close (`lib/kalshiStudy.ts`, a fifth of 857 series refreshed per weekday into Redis). No Kalshi account, no trading
- `/about` also holds the contact form (`#message`; bug / question / opportunity, saved to Supabase and emailed via Resend; `/contact?type=` redirects here)
- `/lab` — design lab: candidate PRISM motifs side by side; unlinked, `noindex`
- Redirects: `/quant` → `/quant/backtester`, `/statement-analyzer` → `/research`, `/quant-notes(/:slug)` → `/education`, `/client-work` → `/` (section removed Oct 2026), `/industries` → `/research`, `/carbon` → `/sustainability#carbon`, `/contact` → `/about#message`
- **Nav** (`components/Nav.tsx`): Research · Sustainability · Trading ▾ (Paper Trading, Momentum, Strategy Lab, Rule Tester, Regime Backtester, Calibration Tracker) · Tools ▾ (DCF, Optimizer, Monte Carlo, Factor Risk, Vol Smile) · Learn (/education) · About. Account pages are out of the nav: the footer (`components/Footer.tsx`) has a small "Sign in" → /dashboard, and the dashboard also links to /calibration

**API** (all server-side; no key ever reaches the browser)
- `/api/portfolio` (+ `/trade`, `/strategy`) — the signed-in user's own paper portfolio, Supabase-backed; trades are server-priced and written via `place_paper_trade()`
- `/api/contact` — contact form: saves to `contact_messages`, emails via Resend; `/api/company-names` — read-only ticker → short name, day-long CDN cache
- `/api/calibration/kalshi?q=` — signed-in-only read-only Kalshi market lookup (60s Redis cache); `/api/calibration/picks` (today's suggested markets, minus ones you've logged) and `/api/calibration/study` (the Kalshi calibration study, from Redis), both signed-in only
- `/api/calibration` (GET list + scores, POST log) and `/api/calibration/[id]` (POST resolve, DELETE open only) — session + RLS, 401 signed out
- `/api/paper-trading/*` — `account`, `positions`, `orders` (read-only), `history`, `risk-metrics`, `search`; `journal` is Postgres-backed and 401s when signed out
- `/api/industries?period=` — read-only: % returns for the ~210 research-list stocks + SPY (`lib/industriesData.ts`): Alpaca SIP daily bars incl. dividends (10-min Redis cache) plus, while the market is open, each stock's latest IEX trade as the live last point (1-min cache)
- `/api/research/*` — `quote`, `news`, `growth` (the Growth Stocks screen), `relative?symbol=` (one stock's Relative Price Score: our own 1–99 rank of the past year's price performance, latest quarter weighted 40% and the three before 20% each, vs the S&P 500 and vs its GICS sector; `weightedReturn`/`rankScores` in `lib/growthScreen.ts`; shown on the Search tab and Growth Stocks rows), `market-news` (`?feed=research|all`: latest ~100 Alpaca/Benzinga headlines, either tagged with a research-list stock or index fund, or the whole market; 3-min Redis cache, `lib/marketNews.ts`), `summary` (AI), `playbook` (AI), `analysis` (AI six-analyst panel: business, safety, price, news, skeptic, summary; streamed as NDJSON so each take shows as it's written; 3h cache), `simplify` (AI), `meter` (free trend/momentum/Congress inputs for the per-stock Bull/Bear Meter, scored in `lib/stockMeter.ts`)
- `/api/statement-analyzer/*` — `search`, `lookup` (17 ratios), `red-flags` (AI)
- `/api/strategy-lab` — read-only Strategy Lab results (`lib/strategyLab.ts` engine, `lib/strategyLabData.ts` data + 26h Redis cache, refreshed by `api/cron/daily`)
- `/api/signal-trader/log` — read-only, Redis only: the Signal Trader's last 78 market-hours checks (`signal-trader:log`), shown as the "thought process" log on `/paper-trading`
- `/api/algo-portfolios` — read-only live algo portfolios (`lib/algoPortfolios.ts`), 2-minute cache
- `/api/algo/run` — **executes trades** for the algo portfolios; secret-gated manual trigger (`?dryRun=1`). The scheduled run comes via `/api/signal-trader/run`, which calls it every 15 min; it checks every portfolio each time the market is open (momentum rebalances once, on the month's first trading day)
- `/api/showcase` — read-only showcase portfolio (`lib/showcase.ts`), 2-minute Redis cache; also feeds the homepage snapshot
- `/api/dcf/prefill` — DCF assumptions from EDGAR facts, pure XBRL math; `/api/optimizer/frontier` and `/api/monte-carlo/simulate` — the two solvers
- `/api/rotation/status` — recomputes picks, places no orders; `/api/rotation/check` — manual regime check, secret-gated
- `/api/rotation/run` — **executes trades**; GET only, `CRON_SECRET`-gated (monthly cron). No public trigger
- `/api/signal-trader/run` — **executes trades** on the showcase account (`lib/signalTrader.ts`); GET only, gated by `SIGNAL_TRADER_SECRET` (cron-job.org) or `CRON_SECRET` (GitHub Actions), called every 15 min in market hours; `?dryRun=1` trades nothing
- `/api/signals` — read-only, serves the Redis cache; `/api/signals/refresh` — forces a refresh, secret-gated
- `/api/cron/daily` — weekday regime check + all five signal refreshes + the Strategy Lab recompute + the Calibration Tracker's Kalshi jobs (auto-resolve + daily price points for every user's open Kalshi predictions; one fifth of the Kalshi calibration study; one fifth of the Growth Stocks screen's SEC numbers)

## Data sources

**Alpaca paper API** (account, quotes, bars) · **SEC EDGAR** (filings, XBRL
facts, ratios; Form 13F data sets for fund holdings, offline build only) · **OpenFIGI** (free CUSIP→ticker mapping, offline build only) · **Anthropic API** (all AI features, the only paid one) ·
**political trade sources** — House Clerk PTR PDFs, efdsearch.senate.gov,
open-cabinet.org's OGE 278-T extraction, and the congress-legislators dataset
for committee overlap · Yahoo Finance RSS for headlines · **EPA Greenhouse Gas Reporting Program** and **EPA Toxics Release Inventory** (facility emissions and toxic releases, free, offline build only) · **Science Based Targets initiative** public target dashboard (free download, offline build only) · **Kalshi** public
market data (read-only, no key) for the Calibration Tracker. Full table with
licences and caveats: `docs/DATA_AND_ENV.md`.

## Environment variables (names only — never commit or print values)

Local: `site/.env.local`, gitignored. Production: Vercel project settings.
**Required** `ANTHROPIC_API_KEY` (read implicitly by `new Anthropic()`),
`APCA_API_KEY_ID`, `APCA_API_SECRET_KEY`, `KV_REST_API_URL`,
`KV_REST_API_TOKEN`, `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` (server-only; without
it dashboard trading returns 503). **Optional** `RESEND_API_KEY` (contact-form email via Resend;
without it messages are only saved to `contact_messages`), `CONTACT_TO_EMAIL`,
`CONTACT_FROM_EMAIL`, `SIGNALS_DEBUG`, `SHOWCASE_USER_ID` (the dashboard account shown
on `/paper-trading` and the homepage; not a secret, without it both hide), `SIGNAL_TRADER_ENABLED`
(`true` lets the Signal Trader place trades; anything else and every run is a dry run), `SIGNAL_TRADER_SECRET`
(unlocks only `/api/signal-trader/run` and `/api/algo/run`; the password cron-job.org sends),
`ALGO_PORTFOLIOS_ENABLED` (`false` pauses the algo portfolios; on by default),
`NEXT_PUBLIC_AI_FEATURES_ENABLED` (`false` pauses every Claude call: AI panels
hidden on `/research`, AI routes 503, AI signal refreshes skipped; on by
default; a flag, not a key; redeploy after changing it — `lib/aiFeatures.ts`). `KV_URL`, `REDIS_URL`,
`KV_REST_API_READ_ONLY_TOKEN` and `VERCEL_OIDC_TOKEN` are Vercel-provisioned
and unread by app code.

## Project rules

1. **Keys stay server-side.** Everything external goes through an API route.
   No key in a client component, ever. The one deliberate exception is the
   Supabase anon key: it is designed to be public and is useless without a
   session, because Row Level Security decides what each user can read. The
   Supabase **secret key** (`SUPABASE_SECRET_KEY`) bypasses RLS and must never
   reach the browser. It lives only in `lib/supabase/admin.ts` and is used to
   write paper trades via `place_paper_trade()`, by the strategy runner and the
   contact form, by the Signal Trader to journal its own fills on the showcase
   account (`journal_entries`, thesis = its reason), by `api/cron/daily` to
   auto-resolve and record prices for every user's open Kalshi predictions
   (`lib/calibrationTracking.ts`; the lock-in trigger still applies), and for one read: `lib/showcase.ts` reads the single account
   named by `SHOWCASE_USER_ID` for the public `/paper-trading` page. Every other
   read uses the user's own session.
2. **Cache external data. Never call a paid API on page load.** `/api/signals`
   reads cache only; refreshes run on the cron or a secret-gated route. Redis
   via `lib/kv.ts` (`getRedis()`, guarded by `kvConfigured()`).
3. **Cron budget is 2 on Vercel's free tier and both are used** — monthly
   rebalance and `api/cron/daily`. Add new daily work *inside* `api/cron/daily`.
   Anything more frequent is called from outside: the Signal Trader runs every
   15 min from cron-job.org (job in Ethan's account, sends `SIGNAL_TRADER_SECRET`),
   with `.github/workflows/signal-trader.yml` as a backup. GitHub's schedule
   never fired on its first day, which is why cron-job.org was added.
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

## Status (as of Oct 15 2026)

**Built and working** — every route listed above; typecheck and lint pass.
Stock Research covers search, sector browse, the 17-ratio dashboard, AI
summary/playbook/red-flags/persona panel and "Explain simply"; all four
Research Signals categories run daily. Landed Oct 7-14: the Strategy Lab (five
backtested strategies plus live algo portfolios checked every 15 min), the
Signal Trader's switch from Congress trades to insider buying + trend +
momentum, its "thought process" log and self-journaled trades, the prism
homepage, and the AI on/off switch. The Signal Trader is trading live.

**Unverified** — the AI switch has never been tested set to `false` in
production (needs a redeploy). The old passive ETF core was sold on Nov 4 2026 (it had silently blocked every Momentum rebalance since September; blocked/failed runs are now saved as `rotation:last-attempt` and shown on /rotation).

**Next up** — everything Ethan might build lives in one list,
`docs/PROJECT_IDEAS.md`; its "Up next" section is the current queue.

## Longer docs

- `docs/ARCHITECTURE.md` — repo shape, every route and API, key libraries, UI conventions, visual identity
- `docs/FEATURES.md` — each feature in depth, including the EDGAR rules that must not be broken
- `docs/DATA_AND_ENV.md` — data sources, caching and TTLs, cron budget, env var names, local setup
- `docs/ROADMAP.md` build plan · `docs/PROJECT_IDEAS.md` backlog · `projects/paper-trading/STRATEGY.md` the live strategy · `projects/paper-trading/SIGNAL_TRADER.md` the showcase account's algorithm
