# Project Ideas Backlog

The one list of everything Ethan might build next. Numbers are stable — refer to ideas
by number, and don't renumber when one is finished; move it to "Done" instead.

Ratings: 🟢 weekend project · 🟡 1–3 weeks · 🔴 semester-long flagship

## Up next

### 15. Stream the AI analyst panel 🟢 (1 session)
The six-analyst panel on `/research` takes ~30s and shows only "Analyzing...". Stream
each take in as it finishes. The slowest moment on the most-visited page.

## Ideas to build

### 13. Machine-learning up/down predictor 🟡 (builds on #12) — Ethan's favourite
Feed a model many numbers per stock per day (recent returns, volatility, distance from
highs, volume, RSI…) and predict whether it beats the market over the next month. Rules:
test only on years the model never trained on (walk-forward), count trading costs, and
expect ~53–55% accuracy — anything near 80% is a testing bug. Start with logistic
regression (explainable, easy in TypeScript, no Python needed), trained by a script in
`site/scripts/` that saves the model to Redis; the site only reads it. Show which inputs
mattered most. #12's features become this model's inputs.

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

## Done

- **1. AI paper-trading simulator** — `/paper-trading`, `/dashboard`, the Signal Trader,
  user strategies and the Strategy Lab's live portfolios
- **2. Interactive DCF builder** — `/dcf-builder`, with sensitivity grid and 10-K/TTM prefill
- **5. 10-K / earnings analyzer** — folded into `/research` (17 ratios, AI summary, red flags)
- **7. Monte Carlo simulator** — `/monte-carlo`
- **8. Portfolio optimizer (Markowitz)** — `/optimizer`
- **14. Industry charts page** — `/industries` (Oct 28 2026)

## Data sources

What the site uses today: Alpaca (prices, intraday and daily bars), SEC EDGAR (filings,
XBRL facts, Form 4s, 8-K timestamps), Anthropic API, House/Senate disclosure sources,
Yahoo Finance RSS. Full table with licences: `docs/DATA_AND_ENV.md`. Earnings call
transcripts are the one gap — see #6.
