import Link from "next/link";
import { PrismHero } from "@/components/Prism";
import { getHomeSnapshot, sparklinePoints } from "@/lib/homeSnapshot";
import { formatCurrency } from "@/lib/format";

// The homepage is deliberately not built from the shared PageShell/Card kit:
// it's a masthead and a ruled index, not a stack of panels. Everything still
// reads from the theme tokens, so mode and accent switching keep working.

type Project = {
  name: string;
  blurb: string;
  href: string;
  status: "Live" | "Passcode";
};

const projects: Project[] = [
  {
    name: "Paper Trading",
    blurb: "Real Alpaca account, trade journal, Sharpe, drawdown, beta.",
    href: "/paper-trading",
    status: "Live",
  },
  {
    name: "Momentum + Leverage",
    blurb: "Top-10 risk-adjusted momentum, 3x ETFs, 200-day circuit breaker.",
    href: "/rotation",
    status: "Live",
  },
  {
    name: "Stock Research",
    blurb: "17 ratios from the latest 10-K, red-flag scan, six analyst takes.",
    href: "/research",
    status: "Live",
  },
  {
    name: "Regime Backtester",
    blurb: "The strategy through 2008, 2020, 2022 and a bull run.",
    href: "/quant/backtester",
    status: "Live",
  },
  {
    name: "DCF Builder",
    blurb: "Live valuation with a WACC × terminal growth sensitivity grid.",
    href: "/dcf-builder",
    status: "Live",
  },
  {
    name: "Portfolio Optimizer",
    blurb: "Efficient frontier with max-Sharpe and min-variance picks.",
    href: "/optimizer",
    status: "Live",
  },
  {
    name: "Monte Carlo",
    blurb: "10,000 paths blended from real SPY and AGG history.",
    href: "/monte-carlo",
    status: "Live",
  },
  {
    name: "Factor Risk",
    blurb: "Equity beta, rate duration and inflation shock in one mix.",
    href: "/quant/factor-risk",
    status: "Live",
  },
  {
    name: "Options Vol Smile",
    blurb: "Implied vol across strikes, with Black-Scholes price and delta.",
    href: "/quant/vol-smile",
    status: "Live",
  },
  {
    name: "Quant Notes",
    blurb: "The math behind these tools, in plain language.",
    href: "/education",
    status: "Live",
  },
  {
    name: "Client Work",
    blurb: "Small-business case studies: problem, what shipped, result.",
    href: "/client-work",
    status: "Passcode",
  },
];

const SPARK_W = 208;
const SPARK_H = 54;

export default async function Home() {
  const snapshot = await getHomeSnapshot();
  const up = (snapshot?.changePct ?? 0) >= 0;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <main className="page-enter flex w-full flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
        {/* Masthead ------------------------------------------------------ */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[10px] caps-wide text-zinc-500">
          <span>
            <span className="text-accent">PRISM</span>
            <span className="ml-2 hidden text-zinc-600 sm:inline">
              Portfolio Research in Systematic Markets
            </span>
          </span>
          <span>Ethan Biancardi · Bentley ’29</span>
        </div>
        <div className="mt-2.5 h-px w-full bg-foreground/80" />

        {/* Statement + live proof panel ---------------------------------- */}
        <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:items-start sm:gap-12">
          <div className="flex-1">
            <h1 className="display text-[34px] leading-[1.06] text-foreground sm:text-[46px]">
              Welcome to PRISM!
              <br />
              Check out my finance tools below.
            </h1>
            <p className="mt-5 max-w-md text-[13px] leading-6 text-zinc-500 dark:text-zinc-400">
              Eleven of them, on live market data, SEC filings and a funded paper
              account. Not screenshots of projects. Things you can open and use.
            </p>
          </div>

          {/* PRISM's mark, drawn in lines and slowly turning. */}
          <PrismHero className="hidden aspect-[16/10] w-full max-w-[480px] shrink-0 self-center md:block" />

          {/* Hidden entirely when Alpaca is unreachable, rather than showing
              an empty frame or a fake number. */}
          {snapshot && (
            <div className="w-full shrink-0 border border-border bg-panel p-4 sm:w-[248px]">
              <div className="flex items-center justify-between">
                <span className="text-[9px] caps-wide text-zinc-500">Paper account</span>
                <span className="inline-flex items-center gap-1.5 text-[9px] caps text-good">
                  <span className="h-1.5 w-1.5 rounded-full bg-good" />
                  Live
                </span>
              </div>

              <div className="mt-2.5 flex items-baseline gap-2">
                <span className="text-xl tabular-nums text-foreground">
                  {formatCurrency(snapshot.equity)}
                </span>
                <span className={`text-[11px] tabular-nums ${up ? "text-good" : "text-bad"}`}>
                  {up ? "+" : "−"}
                  {Math.abs(snapshot.changePct * 100).toFixed(1)}%
                </span>
              </div>

              <svg
                viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                width="100%"
                height={SPARK_H}
                role="img"
                aria-label={`Paper account equity over three months, ${up ? "up" : "down"} ${Math.abs(snapshot.changePct * 100).toFixed(1)} percent`}
                className="mt-3 block"
                preserveAspectRatio="none"
              >
                <polyline
                  points={sparklinePoints(snapshot.points, SPARK_W, SPARK_H)}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              <p className="mt-3 border-t border-border pt-2.5 text-[10px] leading-4 text-zinc-500">
                Three months, straight from the account. Paper money: the
                strategy is real, the dollars are not.
              </p>
            </div>
          )}
        </div>

        {/* Index --------------------------------------------------------- */}
        <div className="mt-11 flex items-baseline gap-4">
          <span className="text-[10px] caps-wide text-foreground">Coverage</span>
          <span className="h-px flex-1 bg-border" />
          <span className="text-[10px] caps text-zinc-500">{projects.length} tools</span>
        </div>

        <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 sm:gap-x-12">
          {projects.map((project, i) => (
            <Link
              key={project.name}
              href={project.href}
              className="group block border-b border-border py-3 transition-colors duration-150 hover:border-accent/60"
            >
              <div className="flex items-baseline gap-3">
                <span className="w-5 shrink-0 text-[10px] tabular-nums text-zinc-600">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="display flex-1 text-[17px] font-normal text-foreground transition-colors duration-150 group-hover:text-accent">
                  {project.name}
                </span>
                <span
                  className={`shrink-0 text-[9px] caps ${
                    project.status === "Live" ? "text-good" : "text-accent"
                  }`}
                >
                  {project.status}
                </span>
              </div>
              <p className="ml-8 mt-0.5 text-[11px] leading-[1.5] text-zinc-500 dark:text-zinc-400">
                {project.blurb}
              </p>
            </Link>
          ))}
        </div>

        {/* Contact ------------------------------------------------------- */}
        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-3">
          <a
            href="mailto:ethanbiancardi@gmail.com"
            className="text-xs text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
          >
            ethanbiancardi@gmail.com
          </a>
          <span className="text-[10px] caps text-zinc-600">Bentley University</span>
        </div>
      </main>
    </div>
  );
}
