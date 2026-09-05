# Strategy

## Core-satellite allocation

- **Core: 60-70%** — diversified index ETFs. Buy-and-hold, rebalance periodically.
  TODO(ethan): list core tickers and target weights.
- **Satellites: 30-40%** — higher-conviction, actively managed bets. Split across
  the satellites below.
  TODO(ethan): set the split between Satellite 1, Satellite 2, and Satellite 3.

## Satellite 1: Quantum computing thesis

- **The bet:** TODO(ethan) — one paragraph on why quantum computing, why now.
- **Evidence that proves me right:** TODO(ethan) — e.g. specific milestones,
  revenue inflections, partnerships.
- **Evidence that proves me wrong:** TODO(ethan) — e.g. delays, a competing
  technology winning, thesis-specific red flags.
- **Time horizon:** TODO(ethan)
- **Max allocation:** TODO(ethan)% of portfolio

## Satellite 2: Rules-based dip buying

- **Definition of a dip:** TODO(ethan)% below 52-week high
- **Watchlist requirement:** only buy tickers pre-approved on the watchlist below.
  TODO(ethan): list watchlist tickers.
- **Buy-in-thirds rule:** split the intended position into three equal buys at
  the dip threshold, and two further pre-set levels below it.
  TODO(ethan): set the second and third buy-in triggers (e.g. additional % down).
- **Reasoning per buy:** one sentence logged in the trade journal for every buy
  (see the paper-trading page's Trade Journal).

## Satellite 3: Sector rotation

- **The bet:** momentum persists over a multi-month horizon within a sector more
  reliably than across the whole market — the stocks leading tech, biotech, or
  consumer over the last quarter are more likely than not to keep leading into
  the next one, so rotating into the current leaders each month should beat
  buying-and-holding a static basket.
- **Mechanics:** every month, rank the ~15 largest (by public float) stocks in
  each of tech, biotech, consumer, financial, healthcare, and energy, plus a
  fixed list of 4 broad-market index ETFs (SPY/QQQ/DIA/IWM, since ETFs aren't
  SIC-classified companies the same lookup can browse), by risk-adjusted
  momentum (trailing 3-month return ÷ volatility over that window). Takes the
  top 2 per sector (14 positions total across 7 sectors), equal-weights them,
  and caps any single position at 20% of the sleeve. Runs automatically via a
  scheduled job against the paper account — see `site/src/lib/rotation.ts` for
  the exact formula and thresholds. Note: the "indexes" sector can end up
  holding SPY itself as a position even though SPY is also the strategy's
  external benchmark below — that's expected, not a bug.
- **Evidence that proves me right:** the rotation sleeve's return beats a
  buy-and-hold basket of the same universe (~94 candidates: 6 sectors × 15
  stocks + 4 index ETFs) over a full year.
- **Evidence that proves me wrong:** high monthly turnover erodes the return
  advantage (this is a paper account so there's no commission drag to model,
  but real turnover would matter if this were ever run with real money);
  or picks cluster in a single sub-theme that craters together (momentum
  chasing a bubble rather than a durable trend).
- **Time horizon:** re-evaluate after 6-12 months of monthly rebalances.
- **Max allocation:** TODO(ethan)% of account equity (defaults to 10% in code
  — `DEFAULT_ROTATION_SLEEVE_PCT` in `site/src/lib/rotation.ts` — computed
  dynamically off current equity each run, not a fixed dollar amount, so it
  scales with the account).
- **Known limitation:** the strategy shares one Alpaca paper account with
  Satellites 1 and 2. If it and another satellite ever pick the exact same
  ticker, Alpaca reports one combined position and per-strategy share
  attribution isn't possible without a real ledger — acceptable for a
  single-account paper demo, not solved.

## Benchmark

All performance — core, satellites, and the account as a whole — is measured
against SPY buy-and-hold over the same period. If the combined strategy doesn't
beat SPY after a full cycle, that's a signal to simplify back toward the core.
