# Features — what each one actually does

Detail behind the one-line route list in `docs/ARCHITECTURE.md`. Read the
section for whatever you are about to change.

## Stock Research (`/research`)

Three tabs: **Search**, **Browse by Sector**, **Research Signals**.

### Search results layout
An Overview strip (ticker, live quote, an "at a glance" line from the playbook,
section jump links, Expand/Collapse all, **Explain simply**, Build a DCF),
followed by collapsible `Section`s whose headers carry a one-line summary
computed from that section's own data.

Sections: About the business · live quote · 17-ratio EDGAR dashboard with colour
flags · AI red-flag scan · merged news feed · Catalysts & what you could do ·
six-persona AI panel.

### "Explain simply"
- Jargon in AI text gets hover definitions from `lib/jargon.ts` (`JargonText`).
- Any AI passage gets a "Say it simply" link → `api/research/simplify`
  (plain rewrite + everyday analogy, cached 7 days by text hash) via `SimpleText`.
- The Research Signals tab uses the same pattern, sharing the toggle state and
  the `SectionForce` expand/collapse context with the Search results.

### Grounding rule
`lib/researchBriefing.ts` builds one briefing — ratios, price, market cap and
P/E from the cover-page share count, headlines — and both the playbook and the
persona panel are required to cite it. Anything unfetchable is labelled "not
available" so the model says so instead of inventing a figure. Every AI panel
shows a "based on" line underneath.

The six personas (Bull, Bear, Accountant, Risk Manager, Historian, Indexer)
stay as they are — that is Ethan's call, Sep 2026. The stale-data problem was
fixed by briefing the model, not by rewording the personas.

## Research Signals

A watchlist of tickers surfaced by evidence, framed as research leads with a
visible not-advice disclaimer. Four categories, ordered freshest first:
Legislation · Geopolitics · Financial story · Political trades. All four are
built and live. Cards are digests — header plus one line, click to open.

Everything is refreshed by the daily cron and served from Redis.
`/api/signals` reads cache only, so page loads can never run up an API bill or
hammer a government website.

### Political trades (no AI — deterministic parsing)
- **Presidential** — `lib/signals/presidential.ts` downloads Open Cabinet's CSV
  extraction of the President's OGE 278-T filings (open-cabinet.org; public-domain
  filings, credit + link required, research use only). Takes the most recent
  filing, aggregates per ticker by range-midpoint, stores top-15 net purchases
  and net sales at `signals:presidential`. The three caveats — trustee-managed,
  ranges not exact amounts, reporting lag — are shown first. Single volunteer
  maintainer, so an outage just leaves the last batch in Redis.
- **Congressional** — House PTRs parsed from the Clerk's official PDFs, plus
  Senate PTRs from efdsearch.senate.gov (`lib/signals/senate.ts`: accept the
  access agreement for a session cookie, query the DataTables endpoint, parse
  each electronic report's HTML table; paper filings skipped).
  `lib/signals/political.ts` merges both. ETFs, funds, options, bonds and
  scanned PTRs are skipped.
- **Committee overlap** — committees come from the public-domain
  congress-legislators dataset (`committees.ts`; House matched by state+district,
  senators by normalised name). An "oversight overlap" is flagged when a trading
  member sits on a committee whose jurisdiction covers the company, using the
  sector from `lib/sectors.ts` or SEC's SIC description, with per-committee
  industry filters so Armed Services only matches defence.
- **Making a weeks-late feed usable** (Sep 21 2026): a **90-day window**
  (`WINDOW_DAYS`) so the same name recurs across members; a **conviction score**
  per ticker (`scoreConviction`: distinct buyers minus sellers, +1 for
  buying-only, +2 for a committee overlap — the default sort, with chips for
  Recently disclosed / Most traded); and **since-trade performance** from
  split-adjusted Alpaca bars (`lib/signals/performance.ts`). Median lag is
  reported per chamber (House ~3 weeks; Senate ~110 days, skewed by one senator
  filing hundreds of trades late).

### Legislation + Geopolitics (AI)
`lib/signals/aiSignals.ts` — claude-opus-5 with `web_search_20260209`, max 10
searches, ~40-110s and roughly $0.50 per run per category. Code then enforces
three things or drops the signal: every source URL must have appeared in that
run's search results, the event must be dated inside the 21-day window, and the
ticker must resolve at SEC. Drops are counted in `stats`. Cached at
`signals:legislation` / `signals:geopolitics`.

### Financial story (no AI)
`lib/signals/financial.ts` screens the 8-sector universe through `computeRatios`
(~15s) for margin expansion/compression, turnaround, cash machine
(non-financials only), deleveraging/releveraging, fortress and hypergrowth.
One story per company, top 12 by score, sourced to the EDGAR filing index and
company-facts JSON.

## Paper trading (`/paper-trading`)

Live Alpaca **paper** account: equity, positions, buy/sell, auto-refresh every
60s with an "updated" stamp. Risk metrics: Sharpe,
annualised volatility, max drawdown, beta vs SPY over 3 months.

The research playbook's action buttons deep-link into this page:
`/paper-trading?ticker=&side=&thesis=` or `?journal=&thesis=`.

## Paper portfolio (`/dashboard`)

Signed-in only, separate from the site's Alpaca account. Every account starts
with $100,000 of simulated cash (pinned by the insert policy, so it can't be
changed from the browser). Stat cards show starting cash, account value, cash,
and what the same $100,000 would be worth in SPY since the day the account
opened; a line chart plots both daily. Only starting cash and trades are
stored (`paper_accounts`, `paper_trades`); cash, positions and the curve are
rebuilt from them plus Alpaca prices. Trades are server-written only — there is
no insert policy on `paper_trades`, because a browser-written trade could
carry a made-up price.

Trading: market orders in whole shares, only while the market is open (Alpaca
`/clock`). The browser sends symbol, side and quantity; `/api/portfolio/trade`
looks up the live IEX price itself and calls `place_paper_trade()` with the
secret key. That function locks the user's account row before checking cash
or shares, so two simultaneous orders can't both spend the same cash, and
only the `service_role` may execute it. Positions table and trade history
sit under the chart.

Strategies (step 1 of 3): pick a preset (S&P 500, 60/40, three-fund,
diversified ETF core) or build a custom one — up to 20 tickers with target
weights (under 100% leaves cash) and a rebalance rule (monthly, weekly, or on
drift of N points). Presets and custom strategies share one shape, so one
planner (`planRebalance`) handles both. "Preview trades" shows the
whole-share orders it would place at live prices; nothing trades yet. Planned:
step 2 runs active strategies in `api/cron/daily` at the close (a strategy
then owns the whole account and manual trading pauses); step 3 adds a trend
filter and momentum rules.

## Trade journal (`/dashboard`)

Signed-in only. Captures a thesis and an exit condition per trade. Stored in
Supabase Postgres (`journal_entries`); Row Level Security means each account
reads and writes only its own rows, and the API stamps ownership from the
session, never the request body.

## Momentum + Leverage strategy (`/rotation`)

Aggressive rule-based book, designed Sep 17 2026 at Ethan's request for high
risk / high reward. Formerly called "Sector Rotation".

- 60% top-10 risk-adjusted momentum across the 8 curated sectors, max 3 per sector
- 30% TQQQ + SOXL
- 10% cash
- SPY-below-200-day circuit breaker, checked every weekday after the close
  (`api/cron/daily` → `lib/regimeCheck.ts`); rebalances only on a flip
- Monthly rebalance via Vercel Cron on the 1st
- Refuses to buy on margin

Execution lives in `lib/rotationRun.ts`. **Not yet executed** — the old passive
ETF core (VOO/BND/VEA/VXF/VWO/VNQ/GLD, ~$80k) has to be sold first via
`site/scripts/sell-core.js --execute`, then Run Rebalance. Full write-up:
`projects/paper-trading/STRATEGY.md`.

## DCF builder (`/dcf-builder`)

Full FCF build — revenue growth, EBIT margin, tax, D&A/capex/NWC as % of
revenue — 5-year projection, Gordon growth terminal value, EV/equity/per-share
output, and a WACC × terminal-growth sensitivity grid colour-coded against an
optional current price (>10% upside = good, >10% downside = bad).

"Load from a 10-K" fills every assumption from a real filing
(`api/dcf/prefill` + `lib/dcfPrefill.ts` — pure XBRL arithmetic, no AI) and
shows a "where these numbers come from" panel with the formula and caveats per
field. WACC and terminal growth stay the user's. `?ticker=` deep-links from the
research dashboard and back.

## Quant tools hub (`/quant/*`)

`components/QuantHubHeader.tsx` is a sticky sub-nav (sliding accent underline,
short labels below `lg`, scrolls on phones) shown on five pages: Regime
Backtester, Optimizer, Factor Risk, Monte Carlo, Vol Smile.

All three `/quant/*` tools are pure client-side math with no API calls:

- **Regime Backtester** (`lib/regimeBacktest.ts`) runs the live strategy's trend
  rule (risk-on 1.3x above a 40-week average, else cash at the risk-free rate)
  through four regimes. **The paths are synthetic** — scripted weekly drift/vol
  phases shaped after 2008, 2020, 2022 and a bull run, seeded, with noise
  demeaned per phase so totals track the real episodes. The UI says so; keep it
  saying so. Metrics: CAGR, Sharpe, Sortino, max drawdown + underwater duration,
  beta, time in market.
- **Factor Risk Attribution** (`lib/factorRisk.ts`) — linear factor model with
  stylised loadings for equities/bonds/commodities on market, rates and
  inflation; variance attribution, R-squared, alpha. Sliders rescale to 100%.
- **Volatility Smile** (`lib/volSmile.ts`) — Gatheral SVI smile, Black-Scholes
  price and delta at the hovered strike, ITM/ATM/OTM for puts or calls.

## Optimizer, Monte Carlo, Quant Notes

- **Optimizer** samples the efficient frontier across user-entered tickers,
  highlighting max-Sharpe and min-variance; a risk slider shows weights anywhere
  on the curve.
- **Monte Carlo** runs 10,000 paths blending real SPY/AGG history, with a
  10th/50th/90th percentile fan chart and probability of hitting a savings goal.
- **Quant Notes** — 7 plain-language explainers (momentum, sharpe-ratio,
  max-drawdown, beta-capm, correlation-diversification, mean-variance,
  monte-carlo), each linking to the live page that demonstrates it. Glossary
  definitions are sourced from here.

## EDGAR ratio engine — three rules that must not be broken

`lib/edgar.ts` reads values by **fiscal-year-end alignment** (taken from the
Assets series); **flow facts must span roughly a year** (10-Ks also tag
quarterly figures as FY); and among alternative tags, **the one reporting the
latest year wins for every year**.

These three rules fixed Honeywell (a +297% "growth" figure that was really a
quarter), Morgan Stanley (2014 revenue shown as current) and BlackRock (a
sub-total tag beating the total). Keep them when adding tags.

### The DCF reads quarters too (Sep 2026)

Those rules are right for the 17-ratio dashboard, which compares one fiscal
year with the next. They left the DCF up to twelve months stale: Apple's last
10-K covers the year to Sep 2025, and three 10-Qs have been filed since.

`ttmAny()` in `lib/edgar.ts` builds a trailing-twelve-month figure from the
cumulative year-to-date numbers every 10-Q carries:

```
TTM = year-to-date this year + (last full year − year-to-date last year)
```

Apple: 364,357 + (416,161 − 313,695) = **466,823**, against the 416,161 the
annual series reports. The prefill uses TTM whenever it is at least two months
fresher, and every "how" line says which window a figure covers.

Two details that matter if you touch it:

- The prior-year leg is matched on duration with **12 days of slack**, because
  quarter ends drift on a 52/53-week calendar (Coca-Cola's Q1 2026 is 92 days
  against 86 the year before). Quarters sit ~91 days apart, so the slack cannot
  confuse a one-quarter stretch with a two-quarter one.
- Ratios divide by revenue **on the same basis** as the numerator, so a TTM
  operating profit is never divided by annual sales. Where only one leg of a
  ratio has quarterly tagging (the effective tax rate, for some filers), both
  drop back to the fiscal year rather than the field disappearing.

Balance-sheet figures (cash, debt, working capital) come from the newest
balance sheet filed rather than the year end, all read at that one date so the
"every figure from one period" rule still holds.

### Successor registrants (Sep 2026)

A holding-company reorganisation hands the ticker to a brand-new CIK with no
filing history. XOM resolves to "ExxonMobil Holdings Corp" (CIK 2115436,
registered July 2026 via an 8-K12B, one 10-Q and no 10-K) while eighteen years
of annual reports sit under "Exxon Mobil Corp" (CIK 34088) — which SEC's ticker
file no longer lists at all, with an empty `formerNames`. Nothing links the two,
and the ratio dashboard came back 0/17.

`getCompanyFactsWithHistory()` handles it:

1. Fetch the ticker's CIK. If `hasAnnualRevenue()` passes, done — the normal
   path is untouched and costs nothing extra.
2. Otherwise normalise the name (`"ExxonMobil Holdings Corp"` → `"Exxon Mobil"`:
   split run-together capitals, drop Holdings/Corp/Inc and friends) and ask
   EDGAR's company search for filers of that name **with a 10-K**, via
   `browse-edgar?...&output=atom`.
3. Verify each candidate's facts actually contain annual revenue before
   trusting it, so a wrong name match cannot substitute another company's
   numbers. At most three are checked; each is a multi-megabyte download.
4. **Union both fact trees.** The predecessor holds the annual history, the
   successor holds the quarters filed since the switch — ExxonMobil's Q2 2026
   exists only under the new CIK. Reading either alone leaves you a quarter or
   a year behind. The readers de-duplicate by period end and filing date, so
   overlapping periods resolve to the newest filing.

XOM after this: revenue $368,757M TTM to Jun 2026 (201,155 + 332,238 − 164,636),
balance sheet Jun 2026, 11/17 ratios populated. Responses carry `filedUnder`
naming the entity the history came from, so the UI never implies the successor
filed it.

**Known gaps.** Foreign private issuers reporting under IFRS return nothing:
Spotify files a 20-F with facts under `ifrs-full`, and every tag list here is
`us-gaap`. Supporting them means a second tag vocabulary, not a filter change.
The error message now says so explicitly rather than just "no annual revenue".

XOM has no EBIT margin, and that is correct rather than broken: like several oil
majors it never tags `OperatingIncomeLoss`, presenting no operating income line
at all. Deriving EBIT from pre-tax income plus interest expense would fill the
gap, and hasn't been done.

## Homepage screenshots

Thumbnails live in `site/public/screenshots/` and are hidden on phones.
Regenerate with `site/scripts/screenshots.js` when pages change — the script
needs `playwright-core` on `NODE_PATH`. Add an entry there for any new tool page.
