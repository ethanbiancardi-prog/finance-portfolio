export type NoteDetail = {
  summary: string;
  intuition: string[];
  formula: { expression: string; variables: { symbol: string; meaning: string }[] };
  example: { setup: string; steps: { label: string; calc: string }[]; result: string };
  useful: string[];
  breaks: string[];
  glossary: { term: string; definition: string }[];
};

export type Note = {
  slug: string;
  label: string;
  title: string;
  body: string;
  formula: string;
  href: string;
  cta: string;
  detail?: NoteDetail;
};

export const NOTES: Note[] = [
  {
    slug: "momentum",
    label: "momentum & volatility",
    title: "Momentum & Volatility",
    body: "Momentum is the tendency of a stock's recent trend to persist a bit longer than random chance would predict. Ranking by trailing return alone rewards a lucky spike as much as a real trend, so the sector rotation strategy divides by the volatility of daily returns over the same window — a risk-adjusted score, since a smooth 20% climb is a more convincing trend than a choppy, coin-flip one.",
    formula: "momentumScore = trailingReturn / stdev(dailyReturns)",
    href: "/rotation",
    cta: "See it rank real stocks →",
  },
  {
    slug: "sharpe-ratio",
    label: "sharpe ratio",
    title: "Sharpe Ratio",
    body: "Return earned per unit of risk taken, above what a risk-free investment (a T-bill) would pay with no risk at all. A higher Sharpe means better risk-adjusted performance — not just a higher return, since a higher return earned by taking on much more risk isn't actually an improvement.",
    formula: "Sharpe = (annualReturn − riskFreeRate) / annualVolatility",
    href: "/paper-trading",
    cta: "See the live account's Sharpe →",
    detail: {
      summary:
        "The Sharpe ratio measures how much return an investment earned for each unit of risk it took on, after subtracting what you could have earned risk-free. It matters because raw return is misleading on its own: a 15% return from a wild, swingy portfolio is a worse result than 12% from a steady one, and Sharpe is the standard way to make that comparison fair.",
      intuition: [
        "Two drivers both average 60 mph on the same trip. One holds a steady 60 the whole way; the other alternates between 20 and 100. Same average, very different ride — and you'd trust the steady driver more to hit 60 again tomorrow. Sharpe is the finance version of that judgment: it penalizes the swingy path.",
        "The other piece is the risk-free rate. A savings account or Treasury bill pays a few percent with essentially zero risk, so the first few percent of any investment's return isn't really a reward for taking risk. Sharpe strips that part out and only credits you for the excess return — the part you actually had to accept risk to earn.",
        "Put together: excess return is the reward, volatility is the price you paid in uncertainty, and Sharpe is reward divided by price. Higher is better. Roughly, below 0.5 is mediocre, around 1 is good, and above 2 is rare outside of short lucky windows.",
      ],
      formula: {
        expression: "Sharpe = (Rp − Rf) / σp",
        variables: [
          { symbol: "Rp", meaning: "The portfolio's annualized return over the period being measured." },
          {
            symbol: "Rf",
            meaning: "The risk-free rate — what a Treasury bill paid over the same period, i.e. the return available with no risk.",
          },
          { symbol: "Rp − Rf", meaning: "Excess return: the part of the return that actually compensated you for taking risk." },
          {
            symbol: "σp",
            meaning: "The portfolio's annualized volatility — the standard deviation of its returns, a measure of how widely they swing.",
          },
        ],
      },
      example: {
        setup:
          "A portfolio returned 12% over the past year. Treasury bills paid 4%. The portfolio's daily returns had a standard deviation of 1.0%, and there are 252 trading days in a year.",
        steps: [
          { label: "Excess return", calc: "12% − 4% = 8%" },
          {
            label: "Annualize the daily volatility",
            calc: "1.0% × √252 = 1.0% × 15.87 ≈ 15.9%",
          },
          { label: "Sharpe ratio", calc: "8% / 15.9% ≈ 0.50" },
        ],
        result:
          "The portfolio earned about half a percent of excess return for every percent of volatility it exposed you to. That's an ordinary result — the S&P 500 has historically landed somewhere between 0.4 and 0.6 over long windows — so this portfolio wasn't obviously better or worse than just holding the index, despite its 12% headline return.",
      },
      useful: [
        "Comparing two strategies or funds with different risk levels on one number — the whole reason the ratio exists.",
        "Deciding whether a higher-return option is actually better, or just riskier.",
        "Measured over long windows (multiple years), where the volatility estimate is stable.",
      ],
      breaks: [
        "Short windows. Over a few weeks, one or two big days dominate both the return and the volatility, so the ratio swings wildly and can be meaningless. The paper-trading page flags this for exactly that reason.",
        "It treats upside and downside swings the same. A portfolio that occasionally jumps up gets penalized as much as one that occasionally crashes. The Sortino ratio is a variant that only counts downside volatility.",
        "It assumes returns are roughly normally distributed. Strategies with fat tails — rare but severe losses, like selling options — can show a great Sharpe for years and then lose it all in one event.",
        "Negative excess returns make it hard to interpret: two losing portfolios can rank in a counterintuitive order because dividing a negative number by a larger volatility makes it look less bad.",
      ],
      glossary: [
        { term: "Risk-free rate", definition: "The return available with essentially no risk of loss, usually the yield on short-term U.S. Treasury bills." },
        { term: "Treasury bill (T-bill)", definition: "A short-term U.S. government debt security, treated as the closest thing to a risk-free investment." },
        { term: "Excess return", definition: "An investment's return minus the risk-free rate — the portion earned by taking on risk." },
        { term: "Volatility", definition: "How much an investment's returns swing around their average, measured as the standard deviation of returns." },
        { term: "Standard deviation", definition: "A statistic measuring how spread out a set of numbers is from their average; larger means more dispersion." },
        { term: "Annualize", definition: "Scale a number measured over a shorter period (daily, monthly) to a yearly equivalent so different periods can be compared." },
        { term: "Risk-adjusted return", definition: "A return figure that accounts for how much risk was taken to earn it, rather than the raw percentage alone." },
        { term: "Sortino ratio", definition: "A variant of the Sharpe ratio that divides excess return by downside volatility only, ignoring upside swings." },
        { term: "Normal distribution", definition: "The bell-curve pattern of outcomes many financial models assume; most values cluster near the average with symmetric tails." },
        { term: "Fat tails", definition: "When extreme outcomes happen more often than a normal distribution predicts — rare, large losses being the usual concern." },
      ],
    },
  },
  {
    slug: "max-drawdown",
    label: "max drawdown",
    title: "Max Drawdown",
    body: "The worst peak-to-trough decline an account has experienced over a period — a plain, concrete answer to \"how bad could it get\" that a total-return number alone doesn't show. A portfolio can have a great average return and still be gut-wrenching to hold if its drawdowns are severe.",
    formula: "maxDrawdown = min((value − runningPeak) / runningPeak)",
    href: "/paper-trading",
    cta: "See the live account's drawdown →",
  },
  {
    slug: "beta-capm",
    label: "beta & capm",
    title: "Beta & CAPM",
    body: "Beta measures how much a portfolio tends to move for every 1% move in a benchmark like the S&P 500. Beta of 1 means it moves with the market; below 1 means smaller swings than the market. It's the central building block of CAPM (the Capital Asset Pricing Model), which says expected return should scale with how much market risk you're actually exposed to.",
    formula: "beta = Cov(portfolio, benchmark) / Var(benchmark)",
    href: "/paper-trading",
    cta: "See the live account's beta vs SPY →",
  },
  {
    slug: "correlation-diversification",
    label: "correlation & diversification",
    title: "Correlation & Diversification",
    body: "Combining two volatile assets doesn't just average their risk — if they don't move together, the combination can end up less volatile than either asset held alone. That's the entire mathematical case for diversification, and it only works when correlation between the assets is meaningfully below 1.",
    formula: "Var(portfolio) = wᵀ · Cov · w",
    href: "/optimizer",
    cta: "See it with real tickers →",
  },
  {
    slug: "mean-variance",
    label: "mean-variance optimization",
    title: "Mean-Variance Optimization",
    body: "Given a set of assets' expected returns and how they move together, there's a whole frontier of \"best possible\" portfolios — for any level of risk, one specific weighting maximizes expected return. The optimizer approximates this frontier by sampling thousands of random portfolios rather than solving it analytically with matrix inversion — simpler code, at the cost of being an approximation rather than the exact frontier.",
    formula: "E[Rp] = w · R̄   |   Var(Rp) = wᵀ · Cov · w",
    href: "/optimizer",
    cta: "See the sampled frontier →",
  },
  {
    slug: "monte-carlo",
    label: "monte carlo simulation",
    title: "Monte Carlo Simulation",
    body: "Instead of assuming one \"expected\" future, simulate thousands of possible ones by drawing a random annual return from a distribution fit to real historical data, then look at the spread of outcomes. It turns \"what will my portfolio be worth in 30 years\" into a range and a probability, instead of a single, misleadingly precise number.",
    formula: "balance_t = balance_(t-1) × (1 + N(μ, σ)) + contribution",
    href: "/monte-carlo",
    cta: "Run a simulation →",
  },
];
