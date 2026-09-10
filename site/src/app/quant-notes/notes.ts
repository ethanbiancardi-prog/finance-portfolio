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
    detail: {
      summary:
        "Momentum is the observation that stocks which have been rising over the past few months tend to keep rising a little longer than pure chance would predict. It matters because it's one of the few patterns that has held up across decades and markets — but a raw return ranking can't tell a real trend from a one-day spike, so the rotation strategy divides return by volatility to reward the steady climbers.",
      intuition: [
        "Two stocks are both up 20% over the last quarter. One rose about a third of a percent every day like clockwork; the other went nowhere for two months, then jumped 25% on a takeover rumor and gave some back. Both have the same trailing return, but only one of them has a trend you'd expect to continue. The second is just noise that happened to land on 20%.",
        "Dividing return by volatility is the fix. Volatility measures how much the daily moves bounced around, so a smooth 20% climb keeps almost all of its score while a jumpy 20% gets cut down. What's left is roughly \"how many units of steady progress did this stock make\" — which is what a trend actually is.",
        "The rotation strategy does this for ~90 candidates every month, keeps the top two in each sector, and equal-weights them. It doesn't try to predict which stock wins next; it just leans into whichever ones are already moving convincingly and re-checks every month.",
      ],
      formula: {
        expression: "score = R(t−n, t) / σ(daily returns over the same window)",
        variables: [
          { symbol: "R(t−n, t)", meaning: "Trailing return: the percent change in price from n trading days ago to today (the strategy uses ~3 months)." },
          { symbol: "σ", meaning: "The standard deviation of the daily returns inside that same window — how choppy the ride was." },
          { symbol: "score", meaning: "Return per unit of choppiness. Higher means a larger, smoother trend. Only the rank matters, not the number itself." },
        ],
      },
      example: {
        setup:
          "Two stocks over the same 63-trading-day window. Stock A rose 20% with daily returns that had a standard deviation of 1.2%. Stock B also rose 20%, but its daily standard deviation was 3.0%.",
        steps: [
          { label: "Stock A score", calc: "0.20 / 0.012 ≈ 16.7" },
          { label: "Stock B score", calc: "0.20 / 0.030 ≈ 6.7" },
          { label: "Rank", calc: "A ranks 2.5× higher than B despite identical returns" },
        ],
        result:
          "A's 20% came from a consistent grind higher; B's came with two and a half times the daily turbulence. The strategy would pick A if only one slot were left in the sector. Notice this doesn't say A will go up — it says A's recent behavior looks more like a persistent trend than B's does.",
      },
      useful: [
        "Ranking a large basket of stocks against each other — momentum is a cross-sectional signal, meaning it's about which stocks are moving more than others, not whether the market goes up.",
        "Systematic, rules-based rebalancing on a fixed schedule (monthly here), where you don't want to second-guess every pick.",
        "Multi-month horizons. Momentum tends to show up at 3–12 months; at days it reverses, at years it reverses again.",
      ],
      breaks: [
        "Momentum crashes. When a trend reverses sharply — a market bottom, a sector rotation — last quarter's leaders are exactly the stocks that fall hardest. The signal has fat left tails.",
        "It generates turnover. Rebalancing monthly into whatever's moving means a lot of buying and selling; in a real account, commissions, spreads, and taxes eat into the edge. Not an issue on a paper account, which is why STRATEGY.md flags it.",
        "It's sensitive to the lookback window. Three months and six months can rank the same stocks very differently. There's no single \"right\" window, only convention.",
        "Dividing by volatility rewards low-vol names by construction, so the ranking can tilt toward sleepy large caps even when their trend is modest.",
      ],
      glossary: [
        { term: "Momentum", definition: "The tendency of recent price trends to continue over the next several months more often than chance would predict." },
        { term: "Trailing return", definition: "The percent change in price over a lookback window ending today, e.g. the last 3 months." },
        { term: "Volatility", definition: "How much returns swing around their average, measured as the standard deviation of returns." },
        { term: "Standard deviation", definition: "A statistic for how spread out a set of numbers is from its average; larger means more dispersion." },
        { term: "Risk-adjusted", definition: "Scaled by how much risk or variability was involved, so a smooth result outranks an equally large jumpy one." },
        { term: "Cross-sectional", definition: "Comparing many stocks against each other at the same point in time, as opposed to one stock against its own history." },
        { term: "Lookback window", definition: "The stretch of past data a signal is computed over, e.g. the trailing 63 trading days." },
        { term: "Rebalance", definition: "Adjust a portfolio's holdings back to target weights or to a fresh set of picks, on a schedule or a trigger." },
        { term: "Turnover", definition: "How much of a portfolio is bought and sold over a period; high turnover means more trading costs." },
        { term: "Fat tails", definition: "When extreme outcomes happen more often than a bell curve predicts; for momentum, the sharp reversals." },
      ],
    },
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
    detail: {
      summary:
        "Max drawdown is the largest percentage drop a portfolio suffered from a high point to the low that followed, before it made a new high. It matters because it's the number you'd actually have lived through: two portfolios can end a year at the same value while one of them spent a stretch down 40% along the way, and that stretch is where people panic and sell.",
      intuition: [
        "Imagine checking your account every day and writing down the highest balance you've ever seen. Drawdown on any given day is how far below that high-water mark you are right now. Most days it's zero or small. Max drawdown is the worst that number ever got.",
        "The reason it's more useful than volatility for gut-checking a strategy is that it's a single concrete event, not a statistical average. \"Annual volatility of 18%\" is abstract. \"At one point you were down 31% from your peak and it took eleven months to get back\" is something you can picture, and honestly ask whether you'd have held on.",
        "It also has an ugly asymmetry: a 50% drawdown needs a 100% gain to recover, not 50%. Big drawdowns aren't just painful, they're expensive in time.",
      ],
      formula: {
        expression: "DD(t) = (V(t) − P(t)) / P(t)   |   MDD = min over t of DD(t)",
        variables: [
          { symbol: "V(t)", meaning: "The portfolio's value on day t." },
          { symbol: "P(t)", meaning: "The running peak: the highest value reached on any day up to and including t." },
          { symbol: "DD(t)", meaning: "Drawdown on day t — how far below the running peak the portfolio sits, as a negative percentage (or zero at a new high)." },
          { symbol: "MDD", meaning: "Max drawdown: the most negative drawdown across the whole period. Always ≤ 0." },
        ],
      },
      example: {
        setup:
          "A portfolio's value at six month-ends: $100k, $110k, $95k, $120k, $90k, $105k. Track the running peak and the drawdown at each point.",
        steps: [
          { label: "Running peaks", calc: "100 → 110 → 110 → 120 → 120 → 120" },
          { label: "Drawdown each month", calc: "0% · 0% · −13.6% · 0% · −25.0% · −12.5%" },
          { label: "Max drawdown", calc: "min(…) = −25.0%  (from $120k down to $90k)" },
          { label: "Recovery needed", calc: "120 / 90 − 1 = +33% just to get back to even" },
        ],
        result:
          "The portfolio ended up 5% over six months, which sounds fine. But in month five it was down a quarter from its peak, and as of month six it still hadn't recovered. Anyone judging this strategy by the +5% alone would miss the part that actually tests whether you'd stick with it.",
      },
      useful: [
        "Gut-checking whether you could actually hold a strategy through its worst stretch, before real money is involved.",
        "Comparing strategies with similar returns — the one with the shallower drawdowns is easier to live with and needs smaller gains to recover.",
        "Setting risk limits: many funds define \"stop\" rules as a max acceptable drawdown rather than a volatility number.",
      ],
      breaks: [
        "It's one event. A single bad month sets the number for the whole period, so it says nothing about how often losses happen or what a typical bad stretch looks like.",
        "It ignores duration. A −25% drawdown that recovered in three weeks and one that lasted two years are the same −25%. Time under water is a separate metric worth tracking.",
        "It depends on sampling. Daily values will find a deeper trough than month-end values, so drawdowns computed on different frequencies aren't comparable.",
        "It's purely backward-looking. The worst drawdown in your data is a lower bound on the worst possible one, not an estimate of it — the next one can always be bigger.",
      ],
      glossary: [
        { term: "Drawdown", definition: "How far a portfolio has fallen from its highest prior value, as a percentage of that high." },
        { term: "Running peak (high-water mark)", definition: "The highest value a portfolio has reached so far; resets upward each time a new high is made." },
        { term: "Peak-to-trough", definition: "From a high point down to the lowest point that follows before a new high is set." },
        { term: "Recovery", definition: "The gain required to climb from a trough back to the prior peak; always larger than the drawdown percentage." },
        { term: "Volatility", definition: "How much returns swing around their average, measured as the standard deviation of returns." },
        { term: "Time under water", definition: "How long a portfolio stays below its previous peak before recovering." },
        { term: "Sampling frequency", definition: "How often values are recorded (daily, monthly); affects any statistic computed from the series." },
      ],
    },
  },
  {
    slug: "beta-capm",
    label: "beta & capm",
    title: "Beta & CAPM",
    body: "Beta measures how much a portfolio tends to move for every 1% move in a benchmark like the S&P 500. Beta of 1 means it moves with the market; below 1 means smaller swings than the market. It's the central building block of CAPM (the Capital Asset Pricing Model), which says expected return should scale with how much market risk you're actually exposed to.",
    formula: "beta = Cov(portfolio, benchmark) / Var(benchmark)",
    href: "/paper-trading",
    cta: "See the live account's beta vs SPY →",
    detail: {
      summary:
        "Beta measures how much a stock or portfolio tends to move when the overall market moves: a beta of 1.2 means it typically rises or falls about 1.2% for every 1% the market does. It matters because it separates the risk you're taking just by being in the market from the risk specific to your picks, and it's the input CAPM uses to say what return a given amount of market exposure should earn.",
      intuition: [
        "Think of the market as a tide and each stock as a boat. Every boat rises and falls with the tide, but some are tied more tightly to it than others. A utility barely notices a rough day; a small tech stock swings twice as hard. Beta is how tightly a boat is tied to the tide.",
        "Beta is not the same as volatility. A stock can swing wildly for reasons that have nothing to do with the market — a drug trial, an earnings surprise — and that shows up in volatility but not beta. Beta only counts the part of the movement that lines up with the market's movement. A beta near zero doesn't mean safe; it means uncorrelated.",
        "CAPM takes this one step further. It argues that the only risk the market pays you for is the tide-risk, because everything else can be diversified away. So your expected return should be the risk-free rate plus beta times whatever extra the market pays over risk-free. Double the beta, double the extra return you should demand.",
      ],
      formula: {
        expression: "β = Cov(Rp, Rm) / Var(Rm)   |   E[Rp] = Rf + β × (E[Rm] − Rf)",
        variables: [
          { symbol: "Rp, Rm", meaning: "Returns of the portfolio and of the benchmark (the market — SPY here), measured over the same periods." },
          { symbol: "Cov(Rp, Rm)", meaning: "Covariance: how much the two return series move together. Positive if they tend to rise and fall on the same days." },
          { symbol: "Var(Rm)", meaning: "Variance of the market's returns — its volatility squared. Dividing by this scales covariance into \"per 1% market move\" units." },
          { symbol: "β", meaning: "Beta. 1 = moves with the market; >1 amplifies it; <1 dampens it; ~0 unrelated; <0 tends to move opposite." },
          { symbol: "E[Rm] − Rf", meaning: "The equity risk premium: the extra return the market is expected to pay above the risk-free rate." },
        ],
      },
      example: {
        setup:
          "Over the past year of daily returns, a portfolio's covariance with SPY works out to 0.00024 and SPY's variance is 0.00020. Separately, T-bills yield 4% and the market is expected to return 10%.",
        steps: [
          { label: "Beta", calc: "0.00024 / 0.00020 = 1.20" },
          { label: "Market risk premium", calc: "10% − 4% = 6%" },
          { label: "CAPM expected return", calc: "4% + 1.20 × 6% = 11.2%" },
        ],
        result:
          "The portfolio has been moving about 20% harder than the market. Under CAPM, that extra exposure should earn about 11.2% a year versus the market's 10%. If the portfolio actually returned 14%, the extra 2.8% is \"alpha\" — return not explained by market exposure. If it returned 9%, it took more market risk than the index and got paid less for it.",
      },
      useful: [
        "Understanding what's driving a portfolio's returns: a beta near 1 with returns that track the S&P means you're mostly holding the market in a more expensive wrapper.",
        "Sizing hedges. To offset the market risk of a $10k position with beta 1.5, you'd short roughly $15k of the index, not $10k.",
        "Setting a fair benchmark. Judging a beta-0.5 portfolio against the full S&P is unfair; CAPM gives the return it should have earned for its actual exposure.",
      ],
      breaks: [
        "Beta isn't stable. Measured over one year versus three, or daily versus monthly, the same stock can show materially different betas. On a short window like the paper account's, treat it as a rough read.",
        "CAPM's empirical record is weak. Low-beta stocks have historically earned more than the model says and high-beta stocks less — the \"low-beta anomaly.\" The model is a clean framework, not a reliable forecast.",
        "One factor isn't enough. Size, value, momentum and profitability all explain returns beyond beta, which is why multi-factor models replaced CAPM in practice.",
        "Beta says nothing about non-market risk. A biotech with beta 0.3 can still lose 80% on a failed trial; that risk is real, it just isn't correlated with SPY.",
      ],
      glossary: [
        { term: "Beta", definition: "How much an asset tends to move for each 1% move in the benchmark; the slope of asset returns against market returns." },
        { term: "CAPM", definition: "Capital Asset Pricing Model: expected return equals the risk-free rate plus beta times the market's excess return." },
        { term: "Benchmark", definition: "The reference index a portfolio is compared against, here the S&P 500 via SPY." },
        { term: "Covariance", definition: "A measure of how two series move together; positive when they rise and fall on the same days." },
        { term: "Variance", definition: "The average squared distance of a series from its mean; volatility is its square root." },
        { term: "Risk-free rate", definition: "The return available with essentially no risk, usually short-term Treasury bill yields." },
        { term: "Equity risk premium", definition: "The extra return investors expect from the stock market over the risk-free rate, as compensation for risk." },
        { term: "Alpha", definition: "Return above what beta exposure alone would explain — the part attributable to skill (or luck)." },
        { term: "Systematic (market) risk", definition: "Risk shared by all stocks because they move with the economy; can't be diversified away." },
        { term: "Idiosyncratic risk", definition: "Risk specific to one company; can be diversified away by holding many stocks." },
        { term: "Low-beta anomaly", definition: "The finding that low-beta stocks have earned better risk-adjusted returns than CAPM predicts." },
      ],
    },
  },
  {
    slug: "correlation-diversification",
    label: "correlation & diversification",
    title: "Correlation & Diversification",
    body: "Combining two volatile assets doesn't just average their risk — if they don't move together, the combination can end up less volatile than either asset held alone. That's the entire mathematical case for diversification, and it only works when correlation between the assets is meaningfully below 1.",
    formula: "Var(portfolio) = wᵀ · Cov · w",
    href: "/optimizer",
    cta: "See it with real tickers →",
    detail: {
      summary:
        "Correlation measures how much two assets move together, from +1 (in lockstep) to −1 (opposite) with 0 meaning no relationship. It matters because it's the reason diversification works at all: mixing assets that don't move together lowers the portfolio's risk by more than a simple average would suggest, without necessarily giving up return.",
      intuition: [
        "Suppose you run two lemonade stands. If both are on the same beach, a rainy day kills both — averaging them doesn't reduce your risk. If one is at the beach and one at an indoor mall, rain hurts one and helps the other, and your combined income is far steadier than either stand alone. The stands didn't get safer individually; the combination did.",
        "That's the whole trick. When two assets have correlation below 1, their bad days don't fully line up, so some of one's losses get cancelled by the other's gains. The lower the correlation, the more cancellation. At correlation 0 a 50/50 mix of two equally risky assets has about 71% of their risk; at −1 you could in principle cancel it entirely.",
        "The catch is that you can only diversify away the risk that's specific to each asset. The part they share — a recession hitting everything — survives no matter how many stocks you own. That's why a portfolio of 500 stocks still moves with the market.",
      ],
      formula: {
        expression: "σp² = w1²σ1² + w2²σ2² + 2·w1·w2·ρ·σ1·σ2   (general: σp² = wᵀ Σ w)",
        variables: [
          { symbol: "w1, w2", meaning: "The fraction of the portfolio in each asset; they sum to 1." },
          { symbol: "σ1, σ2", meaning: "Each asset's volatility (standard deviation of returns)." },
          { symbol: "ρ", meaning: "Correlation between the two assets' returns, between −1 and +1." },
          { symbol: "σp", meaning: "The portfolio's volatility. Note the third term: it's the only place ρ appears, and it shrinks as ρ falls." },
          { symbol: "Σ, w", meaning: "For many assets: the covariance matrix and the weight vector. wᵀΣw is the same formula generalized — every pair contributes a cross term." },
        ],
      },
      example: {
        setup:
          "Two assets, each with 20% annual volatility, held 50/50. Compute the portfolio's volatility at three different correlations.",
        steps: [
          { label: "ρ = 1.0 (move together)", calc: "σp² = 0.01 + 0.01 + 2(0.5)(0.5)(1.0)(0.2)(0.2) = 0.040 → σp = 20.0%" },
          { label: "ρ = 0.3 (loosely related)", calc: "σp² = 0.01 + 0.01 + 0.006 = 0.026 → σp = 16.1%" },
          { label: "ρ = 0.0 (unrelated)", calc: "σp² = 0.01 + 0.01 + 0 = 0.020 → σp = 14.1%" },
        ],
        result:
          "Same two assets, same weights, same expected return — but the portfolio's risk drops from 20% to 14% purely because the assets stop moving together. At a typical stock-to-stock correlation of ~0.3 you get about a fifth of the risk removed for free. That gap is the entire value diversification provides.",
      },
      useful: [
        "Building a core portfolio: combining asset classes with low correlation (stocks, bonds, gold, international) is the most reliable free lunch in investing.",
        "Judging whether a new holding actually adds diversification, or is just another bet on the same thing under a different ticker.",
        "The optimizer's efficient frontier is built entirely from this math — the whole curve exists because of cross terms.",
      ],
      breaks: [
        "Correlations spike in a crisis. Assets that looked independent in calm markets often crash together when everyone sells at once — diversification fails exactly when you need it most.",
        "They're estimated from history. A correlation of 0.3 over the last year is a sample, not a law, and can shift as businesses and markets change.",
        "Low correlation doesn't make a bad asset good. Adding something with terrible returns lowers risk on paper but also drags down the portfolio's return.",
        "It only removes idiosyncratic risk. Past a few dozen holdings the benefit flattens out; the market risk that remains is not diversifiable.",
      ],
      glossary: [
        { term: "Correlation (ρ)", definition: "A number from −1 to +1 measuring how much two series move together; 0 means no linear relationship." },
        { term: "Covariance", definition: "Correlation scaled by the two assets' volatilities; the raw measure of co-movement." },
        { term: "Covariance matrix (Σ)", definition: "A table holding the covariance of every pair of assets; variances sit on the diagonal." },
        { term: "Volatility", definition: "How much returns swing around their average, measured as standard deviation." },
        { term: "Diversification", definition: "Reducing portfolio risk by holding assets whose bad days don't line up." },
        { term: "Cross term", definition: "The part of the variance formula involving two different assets; where correlation enters." },
        { term: "Idiosyncratic risk", definition: "Risk specific to one company or asset; can be diversified away." },
        { term: "Systematic risk", definition: "Risk shared across the whole market; survives diversification." },
        { term: "Efficient frontier", definition: "The set of portfolios offering the highest expected return for each level of risk." },
      ],
    },
  },
  {
    slug: "mean-variance",
    label: "mean-variance optimization",
    title: "Mean-Variance Optimization",
    body: "Given a set of assets' expected returns and how they move together, there's a whole frontier of \"best possible\" portfolios — for any level of risk, one specific weighting maximizes expected return. The optimizer approximates this frontier by sampling thousands of random portfolios rather than solving it analytically with matrix inversion — simpler code, at the cost of being an approximation rather than the exact frontier.",
    formula: "E[Rp] = w · R̄   |   Var(Rp) = wᵀ · Cov · w",
    href: "/optimizer",
    cta: "See the sampled frontier →",
    detail: {
      summary:
        "Mean-variance optimization asks a precise question: given a set of assets, what mix gives the highest expected return for each level of risk? The answers trace a curve called the efficient frontier. It matters because it turns \"diversify\" from a slogan into a calculation — and because its failure modes teach you exactly why real portfolios don't just run the math and trust it.",
      intuition: [
        "Picture every possible way to split money across your assets as a dot on a chart: risk on the x-axis, expected return on the y-axis. Thousands of dots form a cloud. Most of them are bad — for any given risk level there's some other dot higher up that earns more. The dots along the top-left edge of the cloud are the ones no other dot beats. That edge is the efficient frontier.",
        "Why is there an edge at all? Because of correlation. If every asset moved in lockstep, mixing them would just average their risk and return and the cloud would collapse to a straight line. Correlations below 1 let a blend have less risk than its parts, which bends the edge outward. The frontier is literally the shape of diversification.",
        "The optimizer on this site doesn't solve for the frontier with calculus. It throws thousands of random weightings at the wall, plots them all, and highlights the two that matter most: the lowest-risk dot and the one with the best return-per-risk (max Sharpe). That's an approximation, but it's visible and honest about being one.",
      ],
      formula: {
        expression: "E[Rp] = Σ wi·E[Ri]   |   σp² = wᵀ Σ w   |   maximize (E[Rp] − Rf) / σp",
        variables: [
          { symbol: "wi", meaning: "Weight in asset i. All weights sum to 1; the optimizer also keeps each ≥ 0 (no shorting)." },
          { symbol: "E[Ri]", meaning: "Expected annual return of asset i — estimated here from its historical average." },
          { symbol: "E[Rp]", meaning: "Portfolio expected return: a plain weighted average of the assets' expected returns." },
          { symbol: "Σ", meaning: "Covariance matrix of the assets' returns; encodes every volatility and every pairwise correlation." },
          { symbol: "σp", meaning: "Portfolio volatility; the square root of wᵀΣw. This is where diversification shows up." },
          { symbol: "Rf", meaning: "Risk-free rate. The max-Sharpe portfolio is the frontier point with the steepest line back to Rf." },
        ],
      },
      example: {
        setup:
          "Two assets: A returns 8% with 15% volatility; B returns 12% with 25% volatility; their correlation is 0.2. Risk-free rate is 4%. Compare 100% A, 100% B, and a 50/50 mix.",
        steps: [
          { label: "100% A", calc: "return 8%, vol 15% → Sharpe (8−4)/15 = 0.27" },
          { label: "100% B", calc: "return 12%, vol 25% → Sharpe (12−4)/25 = 0.32" },
          { label: "50/50 return", calc: "0.5×8% + 0.5×12% = 10%" },
          { label: "50/50 variance", calc: "0.25(0.0225) + 0.25(0.0625) + 2(0.25)(0.2)(0.15)(0.25) = 0.0250 → vol 15.8%" },
          { label: "50/50 Sharpe", calc: "(10 − 4) / 15.8 = 0.38" },
        ],
        result:
          "The mix earns 10% at 15.8% volatility — almost as low-risk as A alone, with 2 extra points of return, and a better Sharpe than either asset by itself. That's the frontier in miniature: the blend is a point that neither pure holding can reach. Sweeping the weight from 0 to 100% traces the full curve.",
      },
      useful: [
        "Seeing the shape of the trade-off. Even if you never hold the exact optimal weights, the frontier shows how much return each extra unit of risk buys you.",
        "Finding the minimum-variance portfolio, which depends only on the covariance matrix — the input that's actually estimable from history.",
        "Sanity-checking a hand-built allocation: if it sits deep inside the cloud, something is being diversified badly.",
      ],
      breaks: [
        "Expected returns are the weak link. Historical averages are noisy estimates of the future, and the optimizer amplifies the noise: it piles into whatever asset happened to have the highest past return. It's been called an error-maximizer.",
        "The weights are unstable. Nudge one expected return by a percent and the \"optimal\" allocation can swing from 10% to 60% in an asset. Real portfolios use constraints or shrink the inputs to tame this.",
        "It assumes variance is the right definition of risk — that upside and downside swings are equally bad, and that returns are roughly normal. Fat tails and crashes are invisible to it.",
        "Correlations and volatilities shift over time, especially in stress. The frontier you computed last year is not the frontier you'll live on next year.",
      ],
      glossary: [
        { term: "Mean-variance optimization", definition: "Choosing portfolio weights to maximize expected return for a given variance, or minimize variance for a given return." },
        { term: "Efficient frontier", definition: "The curve of portfolios with the highest expected return at each risk level; nothing sits above it." },
        { term: "Expected return", definition: "The average return an asset is anticipated to earn; here estimated from its historical mean." },
        { term: "Variance", definition: "Average squared distance of returns from their mean; volatility squared." },
        { term: "Covariance matrix", definition: "A table of every asset pair's covariance; the single input that captures all correlations and volatilities." },
        { term: "Max-Sharpe portfolio", definition: "The frontier point with the best excess return per unit of risk; where a line from the risk-free rate is tangent to the frontier." },
        { term: "Minimum-variance portfolio", definition: "The leftmost point on the frontier — the lowest-risk mix possible from the given assets." },
        { term: "Sharpe ratio", definition: "Excess return over the risk-free rate divided by volatility." },
        { term: "Shrinkage", definition: "Pulling noisy estimates toward a simpler target (e.g. all returns equal) to make an optimizer's output more stable." },
        { term: "Long-only constraint", definition: "Requiring every weight to be zero or positive — no short selling." },
      ],
    },
  },
  {
    slug: "monte-carlo",
    label: "monte carlo simulation",
    title: "Monte Carlo Simulation",
    body: "Instead of assuming one \"expected\" future, simulate thousands of possible ones by drawing a random annual return from a distribution fit to real historical data, then look at the spread of outcomes. It turns \"what will my portfolio be worth in 30 years\" into a range and a probability, instead of a single, misleadingly precise number.",
    formula: "balance_t = balance_(t-1) × (1 + N(μ, σ)) + contribution",
    href: "/monte-carlo",
    cta: "Run a simulation →",
    detail: {
      summary:
        "A Monte Carlo simulation replaces a single \"expected\" forecast with thousands of randomly generated possible futures, each drawn from a distribution fitted to real history. It matters because compounding is sensitive to the order and size of returns, so the question \"what will my portfolio be worth in 30 years\" has no single answer — only a range, and a probability of clearing whatever goal you care about.",
      intuition: [
        "If a portfolio averages 7% a year, the naive projection is to compound 7% for 30 years and report one number. But no year returns exactly 7%. Some return +25%, some −20%, and the order they arrive in changes the ending balance — a crash right before retirement hurts far more than the same crash in year two. One number hides all of that.",
        "Monte Carlo's answer is to stop pretending. Roll a weighted die for year one's return, apply it, add that year's contribution, roll again for year two, and so on to year 30. That's one possible life of the portfolio. Now do it 10,000 times. You end up with 10,000 ending balances, and the spread of those is the honest forecast.",
        "The output isn't \"you'll have $1.2M.\" It's \"half the time you end above $1.1M, one in ten times below $600k, and you clear $1M in 62% of futures.\" That last number — the probability of hitting a goal — is what the simulation is really for.",
      ],
      formula: {
        expression: "B(t) = B(t−1) × (1 + r(t)) + C,   r(t) ~ N(μ, σ)   repeated for t = 1…T, over N paths",
        variables: [
          { symbol: "B(t)", meaning: "Balance at the end of year t." },
          { symbol: "r(t)", meaning: "Year t's return, drawn fresh from a normal distribution — a new random number every year, every path." },
          { symbol: "μ, σ", meaning: "The mean and standard deviation of annual returns, estimated from real SPY/AGG history and blended by the chosen stock/bond split." },
          { symbol: "C", meaning: "Annual contribution added at the end of each year." },
          { symbol: "T, N", meaning: "Years simulated (the horizon) and number of paths (10,000 here). More paths = smoother percentiles, not different answers." },
        ],
      },
      example: {
        setup:
          "Start with $50,000, add $10,000 a year, μ = 7%, σ = 15%. Follow one path for three years where the random draws happen to be +12%, −8%, +20%.",
        steps: [
          { label: "Year 1", calc: "50,000 × 1.12 + 10,000 = $66,000" },
          { label: "Year 2", calc: "66,000 × 0.92 + 10,000 = $70,720" },
          { label: "Year 3", calc: "70,720 × 1.20 + 10,000 = $94,864" },
          { label: "Naive 7% path", calc: "50,000 → 63,500 → 77,945 → 93,401" },
        ],
        result:
          "This one path ended at $94,864 — a bit above the steady-7% path, because the +20% landed on the biggest balance. Swap the order to +20%, −8%, +12% and it ends at $93,328; make year three −20% instead and it's $66,576. Run 10,000 such paths and sort the year-30 balances: the 10th, 50th and 90th percentiles are the fan chart, and the fraction above your goal is the probability the page reports.",
      },
      useful: [
        "Retirement and savings planning, where the real question is \"how likely am I to get there\" rather than \"what's the average.\"",
        "Showing sequence-of-returns risk: the same returns in a different order produce different outcomes, which a single compounding number can't reveal.",
        "Comparing allocations by their whole distribution — a stock-heavy mix has a higher median but a fatter bottom tail than a bond-heavy one.",
      ],
      breaks: [
        "The normal distribution understates crashes. Real markets have fat tails — 2008-sized years happen more often than a bell curve predicts — so the simulation's worst cases are too mild.",
        "μ and σ are assumed constant for the whole horizon. Thirty years of a single return distribution is a strong assumption; regimes change.",
        "Each year is drawn independently. Real returns show some mean reversion and momentum, so the true spread of outcomes may be narrower or wider than the simulation shows.",
        "Garbage in, garbage out. The whole output hinges on μ and σ. Estimating them from a decade of unusually good returns will make every path look rosier than it should.",
      ],
      glossary: [
        { term: "Monte Carlo simulation", definition: "Estimating an outcome's distribution by running a random process many times and tallying the results." },
        { term: "Normal distribution", definition: "The bell curve; outcomes cluster around the mean with symmetric, thin tails." },
        { term: "μ (mu)", definition: "The mean, or average, of the return distribution." },
        { term: "σ (sigma)", definition: "The standard deviation of the return distribution — its volatility." },
        { term: "Path", definition: "One complete simulated sequence of returns from year 1 to the horizon." },
        { term: "Percentile", definition: "The value below which a given share of outcomes fall; the 10th percentile is a bad-case, the 90th a good-case." },
        { term: "Fan chart", definition: "A plot of percentile bands over time, widening as uncertainty compounds." },
        { term: "Sequence-of-returns risk", definition: "The effect of the order in which returns arrive; losses late (on a large balance) hurt more than losses early." },
        { term: "Compounding", definition: "Earning returns on prior returns, so growth accelerates over time." },
        { term: "Fat tails", definition: "When extreme outcomes occur more often than a normal distribution predicts." },
        { term: "Mean reversion", definition: "The tendency of returns to drift back toward their long-run average after extreme stretches." },
      ],
    },
  },
];
