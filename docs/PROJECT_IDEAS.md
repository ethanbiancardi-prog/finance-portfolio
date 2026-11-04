# Project Ideas Backlog

The one list of everything Ethan might build next. Numbers are stable — refer to ideas
by number, and don't renumber when one is finished; move it to "Done" instead.

Ratings: 🟢 weekend project · 🟡 1–3 weeks · 🔴 semester-long flagship

## Up next

_Nothing queued. Pick the next one from the list below._

## Ideas to build

### 12. Indicator Scorecard 🟢→🟡 (2–3 sessions)
For every time a chart signal fired since 2017 across the ~94-stock universe (crossed the
200-day average, RSI under 30, 52-week-high breakout, 12-month momentum…), measure the
stock's return over the next 5/20/60 days against an average day. A table of which
signals had an edge and which didn't. Reuses the price table and indicator helpers in
`lib/strategyLab.ts`; no new data cost. Frame as evidence, not advice.
**Why it impresses:** "I tested which chart signals actually work — most don't."

### 11. Users run their own trading algorithm 🟢→🟡
Signed-in users already have a paper portfolio and a saved fixed-weight strategy run
nightly by `lib/strategyRunner.ts`. Level 1 (1–2 sessions): let them pick one of the
Strategy Lab algorithms (`decide()` in `lib/strategyLab.ts`) from a dropdown — one
migration adding an algorithm column to `paper_strategies`, a branch in the runner, a
dropdown on the dashboard. Level 2 (3–5 sessions): tunable settings (holdings, lookback,
stop-loss) with a backtest preview before saving — validate every input, cache backtests,
rate-limit them. Level 3 (rule builder) is weeks; never let users run their own code.
Keep users to the ~94 cached stocks so it costs nothing extra.

### 6. Earnings call confidence score 🟡
Read what management says on earnings calls and score how *confident* they sound from
word choice, then test whether that score predicts the stock's next move.
- **Scoring, in steps:** (1) a word-list score first — the Loughran-McDonald finance
  dictionaries count "uncertainty" words (*approximately, may, risk*), weak words
  (*could, might, possibly*) and strong words (*will, always, clearly*); confidence =
  strong minus weak/uncertain, per 1,000 words. Fully explainable. (2) Then a trained
  model on the same calls, and/or Claude scoring each answer, compared against the
  word-list baseline. Q&A answers matter more than the scripted opening remarks — that's
  where executives are off-script.
- **The test:** does a big drop in confidence vs. the company's own previous call come
  before weaker returns over the next 1/5/20 days? Test on calls the model never saw.
- **Data hurdle:** full transcripts aren't on EDGAR and most transcript APIs are paid or
  restrict reuse — check terms first. Free fallback: the earnings press release (8-K
  exhibit 99.1) on EDGAR, which quotes management, though it's far more scripted.
- Pairs with #17: how many days does the market take to price in the tone?

### 17. Information diffusion — how fast news gets priced in 🟡→🔴
Measure the time it takes for a real-world event to show up in the stock price.
- **Method (an "event study"):** for each event with an exact timestamp — an 8-K filing,
  an insider purchase (Form 4), an earnings release, a Congress trade disclosure — track
  the stock's return *minus the market's* from the moment it went public. Report the
  **half-life**: how long until half the eventual move had happened.
- **Questions it answers:** do big, well-covered stocks price news in minutes while small
  ones take days? Is insider buying priced slowly (which is why the Signal Trader can use
  it)? Confirms or refines the old ~50-day Congress-disclosure-lag finding.
- **Data:** event times from EDGAR (free, timestamped); intraday bars from Alpaca for the
  fast part, daily bars for the slow tail.

### 16. Kalshi mispricing / arbitrage engine — talk through first
Find Kalshi prediction-market contracts that look mispriced: related contracts whose
prices don't add up, or that disagree with other markets or data. Open questions before
building: Kalshi API terms, whether it only flags or ever trades (real-money trading is
something Claude can't execute), and how it fits the site.

### 3. Balance sheet / 3-statement model 🟡
Interactive linked statements: change an assumption, watch it flow through IS → BS → CF.
Great teaching tool framing ("built this to study for interviews" is a genuinely good story).

### 9. Stock screener with natural-language queries 🟡
"Show me profitable small-caps with falling debt" → AI translates to filters → results
table. Very demo-able in an interview.

### 10. Finance blog / market notes 🟢 (ongoing)
Short write-ups: a valuation you did, something you learned building these tools, a
market event explained. Recruiters and alumni actually read these, and it feeds LinkedIn
content. `/education` covers part of this.

### 18. Sustainability-linked bond (SLB) step-up & penalty simulator 🟡
A pricing and valuation dashboard for corporate debt whose coupon depends on hitting
sustainability targets (Enel, AB InBev style).
- Model bonds whose coupon steps up (typically 25–50 bps) if the issuer misses its
  Sustainability Performance Targets (SPTs).
- Show the issuer's side under hit vs. miss: cash interest expense, debt service coverage,
  and the effect on WACC.
- Monte Carlo on the emissions path (or project completion date) to get the probability of a
  step-up, and from that a probability-weighted yield to maturity for investors.
- **Data:** mostly user inputs plus real bond terms from published prospectuses; no paid
  price feed needed for the simulator itself.
**Why it impresses:** structured corporate-debt mechanics tied to real sustainability covenants.

### 19. SEC climate disclosure & 10-K transition-risk analyzer 🟡→🔴
Extend the EDGAR pipeline to pull climate-related risk disclosures out of 10-Ks.
- AI extraction across heavy-emitting sectors (energy, industrials, transport): Scope 1 & 2
  disclosures, facility flood/wildfire exposure, capex earmarked for decarbonization.
- A "Green CapEx Ratio" = green capex ÷ total capex, set against depreciation and total
  spending.
- Flag gaps between net-zero press releases and where the capital actually goes.
- **Watch-outs:** needs the Anthropic API (credits ran out Nov 3 2026, so check the AI
  on/off flag first). The SEC's climate disclosure rule never took effect, so disclosures
  are voluntary and uneven, and green capex is rarely its own line item. Expect a lot of
  "not disclosed".
**Why it impresses:** mirrors how ESG and quant equity teams screen for greenwashing.

### 20. Green bond "greenium" monitor & use-of-proceeds tracker 🔴 — talk through first
Compare a company's green bonds with its conventional bonds of similar maturity and rating
to measure the "greenium", the yield discount for issuing certified green debt.
- Pair bonds (e.g. an Apple green bond vs. an Apple senior unsecured note), compute each
  one's spread over Treasuries, and chart the difference.
- Track use of proceeds: renewables, energy efficiency, low-carbon infrastructure, from
  issuers' allocation reports. ICMA Green Bond Principles as the checklist.
- **Data hurdle:** Treasury yields are free, but corporate bond prices aren't easy to get.
  FINRA TRACE shows them bond by bond with no free bulk API, and allocation reports are
  PDFs. Decide the data source before building.
**Why it impresses:** fixed-income pricing, credit spreads, and green bond verification.

### 21. Carbon-adjusted returns & shadow carbon price portfolio overlay 🟡
Apply an internal "shadow" carbon tax (say $50–100 a ton) to the companies in a portfolio
and see what it does to margins and the optimal portfolio.
- Deduct the carbon bill (emissions × price) from operating income / EBITDA for each stock
  in a benchmark basket or the bots' universe.
- Re-optimize with mean-variance (the `/optimizer` engine), penalizing carbon intensity
  alongside volatility.
- Side by side: unadjusted vs. carbon-adjusted returns and Sharpe ratio.
- **Head start:** `public/data/carbon.json` already has Scope 1 emissions and operating
  income per company (Scope 2 isn't in the EPA data). Overlaps the planned carbon-price
  slider in the DCF Builder (carbon phase 2); build them together.
**Why it impresses:** shows carbon policy as a risk-management question, in margins and
portfolio risk.

## Done

- **1. AI paper-trading simulator** — `/paper-trading`, `/dashboard`, the Signal Trader,
  user strategies and the Strategy Lab's live portfolios
- **2. Interactive DCF builder** — `/dcf-builder`, with sensitivity grid and 10-K/TTM prefill
- **5. 10-K / earnings analyzer** — folded into `/research` (17 ratios, AI summary, red flags)
- **7. Monte Carlo simulator** — `/monte-carlo`
- **8. Portfolio optimizer (Markowitz)** — `/optimizer`
- **15. Streamed AI analyst panel** — each of the six takes on `/research` appears as it's written
  (first in ~9s instead of a blank ~27s wait), NDJSON from `/api/research/analysis` (Nov 3 2026)
- **14. Industry charts page** — the default tab on `/research` (Oct 28 2026)
- **13. Machine-learning predictor** — boosted trees and a chart-reading neural net trained on the
  S&P 500, walk-forward and purged k-fold tested; both lost to simple trend + momentum rules.
  Shown on `/quant/rule-tester` (Nov 3 2026); code in `site/src/lib/ml`, reports in
  `projects/paper-trading/ML_REPORT*.md`

## Data sources

What the site uses today: Alpaca (prices, intraday and daily bars), SEC EDGAR (filings,
XBRL facts, Form 4s, 8-K timestamps), Anthropic API, House/Senate disclosure sources,
Yahoo Finance RSS. Full table with licences: `docs/DATA_AND_ENV.md`. Earnings call
transcripts are the one gap — see #6.
