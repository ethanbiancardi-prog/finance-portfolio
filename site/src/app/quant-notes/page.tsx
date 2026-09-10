import { Card, PageShell, SectionHeader } from "@/components/ui";

type Concept = {
  label: string;
  title: string;
  body: string;
  formula: string;
  href: string;
  cta: string;
};

const CONCEPTS: Concept[] = [
  {
    label: "momentum & volatility",
    title: "Momentum & Volatility",
    body: "Momentum is the tendency of a stock's recent trend to persist a bit longer than random chance would predict. Ranking by trailing return alone rewards a lucky spike as much as a real trend, so the sector rotation strategy divides by the volatility of daily returns over the same window — a risk-adjusted score, since a smooth 20% climb is a more convincing trend than a choppy, coin-flip one.",
    formula: "momentumScore = trailingReturn / stdev(dailyReturns)",
    href: "/rotation",
    cta: "See it rank real stocks →",
  },
  {
    label: "sharpe ratio",
    title: "Sharpe Ratio",
    body: "Return earned per unit of risk taken, above what a risk-free investment (a T-bill) would pay with no risk at all. A higher Sharpe means better risk-adjusted performance — not just a higher return, since a higher return earned by taking on much more risk isn't actually an improvement.",
    formula: "Sharpe = (annualReturn − riskFreeRate) / annualVolatility",
    href: "/paper-trading",
    cta: "See the live account's Sharpe →",
  },
  {
    label: "max drawdown",
    title: "Max Drawdown",
    body: "The worst peak-to-trough decline an account has experienced over a period — a plain, concrete answer to \"how bad could it get\" that a total-return number alone doesn't show. A portfolio can have a great average return and still be gut-wrenching to hold if its drawdowns are severe.",
    formula: "maxDrawdown = min((value − runningPeak) / runningPeak)",
    href: "/paper-trading",
    cta: "See the live account's drawdown →",
  },
  {
    label: "beta & capm",
    title: "Beta & CAPM",
    body: "Beta measures how much a portfolio tends to move for every 1% move in a benchmark like the S&P 500. Beta of 1 means it moves with the market; below 1 means smaller swings than the market. It's the central building block of CAPM (the Capital Asset Pricing Model), which says expected return should scale with how much market risk you're actually exposed to.",
    formula: "beta = Cov(portfolio, benchmark) / Var(benchmark)",
    href: "/paper-trading",
    cta: "See the live account's beta vs SPY →",
  },
  {
    label: "correlation & diversification",
    title: "Correlation & Diversification",
    body: "Combining two volatile assets doesn't just average their risk — if they don't move together, the combination can end up less volatile than either asset held alone. That's the entire mathematical case for diversification, and it only works when correlation between the assets is meaningfully below 1.",
    formula: "Var(portfolio) = wᵀ · Cov · w",
    href: "/optimizer",
    cta: "See it with real tickers →",
  },
  {
    label: "mean-variance optimization",
    title: "Mean-Variance Optimization",
    body: "Given a set of assets' expected returns and how they move together, there's a whole frontier of \"best possible\" portfolios — for any level of risk, one specific weighting maximizes expected return. The optimizer approximates this frontier by sampling thousands of random portfolios rather than solving it analytically with matrix inversion — simpler code, at the cost of being an approximation rather than the exact frontier.",
    formula: "E[Rp] = w · R̄   |   Var(Rp) = wᵀ · Cov · w",
    href: "/optimizer",
    cta: "See the sampled frontier →",
  },
  {
    label: "monte carlo simulation",
    title: "Monte Carlo Simulation",
    body: "Instead of assuming one \"expected\" future, simulate thousands of possible ones by drawing a random annual return from a distribution fit to real historical data, then look at the spread of outcomes. It turns \"what will my portfolio be worth in 30 years\" into a range and a probability, instead of a single, misleadingly precise number.",
    formula: "balance_t = balance_(t-1) × (1 + N(μ, σ)) + contribution",
    href: "/monte-carlo",
    cta: "Run a simulation →",
  },
];

export default function QuantNotes() {
  return (
    <PageShell
      eyebrow="quant notes"
      title="Quant Notes"
      description="Plain-language notes on the quantitative concepts behind the tools on this site — what each formula means, why it's used this way, and where to see it running on real data."
    >
      <section className="mt-4 space-y-2">
        {CONCEPTS.map((concept) => (
          <Card key={concept.label} href={concept.href} interactive>
            <SectionHeader label={concept.label} />
            <h3 className="mt-2 text-sm uppercase tracking-[0.04em] text-foreground">{concept.title}</h3>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-400">{concept.body}</p>
            <p className="mt-3 inline-block border border-border bg-background px-2 py-1 text-[11px] text-zinc-300">{concept.formula}</p>
            <p className="mt-3 text-[11px] uppercase tracking-[0.1em] text-accent">{concept.cta}</p>
          </Card>
        ))}
      </section>
    </PageShell>
  );
}
