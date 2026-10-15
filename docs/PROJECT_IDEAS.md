# Project Ideas Backlog

Ratings: 🟢 weekend project · 🟡 1–3 weeks · 🔴 semester-long flagship

## Your ideas (all good — keep them)

### 1. AI paper-trading simulator 🔴 (flagship)
Fake-money portfolio tracking real market prices. Users (or you) make trades; an AI
"analyst" explains each position, flags concentration risk, and writes a weekly portfolio
review. Start simple: manual trades + a P&L dashboard. Add AI commentary second. Add
strategy backtesting third.
**Why it impresses:** shows market mechanics, risk concepts, AND practical AI integration.

### 2. Interactive DCF builder 🟡
User inputs revenue growth, margins, WACC, terminal growth → live valuation with
sensitivity table (WACC × terminal growth heatmap is the classic). Bonus: AI mode that
pre-fills assumptions from a company's recent filings and *explains its reasoning*.
**Why it impresses:** DCF is the interview question. Building the tool proves you
understand every lever, not just how to click through a template.

### 3. Balance sheet / 3-statement model 🟡
Interactive linked statements: change an assumption, watch it flow through IS → BS → CF.
Great teaching tool framing ("built this to study for interviews" is a genuinely good story).

### 4. Client work showcase 🟢
Case-study pages for the small-business sites you built: the problem, what you shipped,
before/after, a testimonial if you can get one. Frame it as "freelance web consulting" —
it shows initiative and client communication, which finance recruiters value a lot.

## My additions

### 5. 10-K / earnings analyzer 🟡
Upload or link a filing → AI extracts key metrics, computes ratios (liquidity, leverage,
profitability, efficiency), flags YoY changes, and writes a one-page summary. This is
literally what analysts do their first year. High wow-factor per hour of work.

### 6. Earnings call sentiment tracker 🟡
Pull earnings call transcripts, run AI sentiment/tone analysis on management language,
chart it against the stock's post-earnings move. Fun research angle: "does hedging
language predict drawdowns?"

### 7. Monte Carlo retirement / portfolio simulator 🟢→🟡
Inputs: savings rate, allocation, horizon. Output: fan chart of 10,000 simulated paths,
probability of hitting a goal. Visually striking, mathematically real, small scope.

### 8. Portfolio optimizer (Markowitz) 🟡
Pick tickers → efficient frontier plot → optimal weights at a chosen risk level. Add AI
plain-English explanation of why the optimizer chose those weights.

### 9. Stock screener with natural-language queries 🟡
"Show me profitable small-caps with falling debt" → AI translates to filters → results
table. Very demo-able in an interview.

### 10. Finance blog / market notes 🟢 (ongoing)
Short write-ups: a valuation you did, something you learned building these tools, a
market event explained. Recruiters and alumni actually read these, and it feeds LinkedIn
content.

## Added Oct 15 2026

### 11. Users run their own trading algorithm 🟢→🟡
Signed-in users already have a paper portfolio and a saved fixed-weight strategy run
nightly by `lib/strategyRunner.ts`. Level 1 (1–2 sessions): let them pick one of the
Strategy Lab algorithms (`decide()` in `lib/strategyLab.ts`) from a dropdown — one
migration adding an algorithm column to `paper_strategies`, a branch in the runner, a
dropdown on the dashboard. Level 2 (3–5 sessions): tunable settings (holdings, lookback,
stop-loss) with a backtest preview before saving — validate every input, cache backtests,
rate-limit them. Level 3 (rule builder) is weeks; never let users run their own code.
Keep users to the ~94 cached stocks so it costs nothing extra.

### 12. Indicator Scorecard 🟢→🟡 (2–3 sessions)
For every time a chart signal fired since 2017 across the ~94-stock universe (crossed the
200-day average, RSI under 30, 52-week-high breakout, 12-month momentum…), measure the
stock's return over the next 5/20/60 days against an average day. A table of which
signals had an edge and which didn't. Reuses the price table and indicator helpers in
`lib/strategyLab.ts`; no new data cost. Frame as evidence, not advice.
**Why it impresses:** "I tested which chart signals actually work — most don't."

### 13. Machine-learning up/down predictor 🟡 (builds on #12)
Ethan's pick. Feed a model many numbers per stock per day (recent returns, volatility,
distance from highs, volume, RSI…) and predict whether it beats the market over the next
month. Rules: test only on years the model never trained on (walk-forward), count trading
costs, and expect ~53–55% accuracy — anything near 80% is a testing bug. Start with
logistic regression (explainable, easy in TypeScript, no Python needed), trained by a
script in `site/scripts/` that saves the model to Redis; the site only reads it. Show
which inputs mattered most. #12's features become this model's inputs.

## Prioritization advice
Do **#4 (client work)** and **#2 (DCF)** first — fast wins that make the site feel real.
Then **#5 (10-K analyzer)** for the AI wow-factor. Make **#1 (paper trading)** the
long-running flagship you improve all semester. Skip or defer the rest until those shine.
Three polished projects beat eight half-finished ones, every time.

## Data sources (free tiers)
- Prices: yfinance (Python), Alpha Vantage, Finnhub, Polygon (free tier)
- Filings: SEC EDGAR (free, official, has an API)
- Transcripts: some free via APIs, or scrape carefully within terms of service
