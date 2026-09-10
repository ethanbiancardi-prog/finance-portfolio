import { Card, PageShell, SectionHeader } from "@/components/ui";

type Project = {
  name: string;
  blurb: string;
  status: "Live" | "In progress" | "Planned";
  href?: string;
};

const projects: Project[] = [
  {
    name: "AI Paper Trading Simulator",
    blurb:
      "Fake-money portfolio tracking real market prices, with an AI analyst that explains each position and flags risk.",
    status: "Live",
    href: "/paper-trading",
  },
  {
    name: "Sector Rotation Strategy",
    blurb:
      "Automated monthly rebalance across tech, biotech, and consumer stocks by risk-adjusted momentum, with position-size caps and scheduled execution.",
    status: "Live",
    href: "/rotation",
  },
  {
    name: "Monte Carlo Simulator",
    blurb:
      "Simulates 10,000 portfolio paths from real SPY/AGG history to project a range of outcomes and your odds of hitting a savings goal.",
    status: "Live",
    href: "/monte-carlo",
  },
  {
    name: "Portfolio Optimizer",
    blurb:
      "Samples thousands of random portfolio weightings across your tickers to approximate the efficient frontier, with max-Sharpe and min-variance picks.",
    status: "Live",
    href: "/optimizer",
  },
  {
    name: "Interactive DCF Builder",
    blurb:
      "Input revenue growth, margins, and WACC to get a live valuation with a WACC x terminal growth sensitivity table.",
    status: "Live",
    href: "/dcf-builder",
  },
  {
    name: "10-K Statement Analyzer",
    blurb:
      "Search by ticker or browse by industry to get liquidity, leverage, and profitability ratios pulled straight from SEC filings.",
    status: "Live",
    href: "/statement-analyzer",
  },
  {
    name: "Quant Notes",
    blurb:
      "Plain-language notes on the quant concepts behind these tools — momentum, Sharpe, beta, diversification, mean-variance optimization, Monte Carlo — each linking to the live page that demonstrates it.",
    status: "Live",
    href: "/quant-notes",
  },
  {
    name: "Client Work",
    blurb:
      "Case studies from small-business sites I've built: the problem, what shipped, and the result.",
    status: "Planned",
  },
];

export default function Home() {
  return (
    <PageShell
      eyebrow="portfolio"
      title="Ethan Biancardi"
      subtitle="Finance x AI @ Bentley"
      description="I build working finance tools with modern AI — not just a resume, a set of projects you can actually try."
    >
      <section className="mt-4">
        <SectionHeader label="projects" />
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {projects.map((project, i) => {
            const live = project.status === "Live";
            const card = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] tabular-nums text-zinc-600">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] ${
                      live ? "text-good" : "text-zinc-600"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 ${live ? "animate-pulse bg-good" : "bg-zinc-700"}`} />
                    {project.status}
                  </span>
                </div>
                <h3 className="mt-2 text-sm uppercase tracking-[0.04em] text-foreground">
                  {project.name}
                  {project.href && <span className="ml-1 text-zinc-600">→</span>}
                </h3>
                <p className="mt-1.5 text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">{project.blurb}</p>
              </>
            );

            return (
              <Card key={project.name} padding="sm" href={project.href} interactive={!!project.href}>
                {card}
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-4">
        <SectionHeader label="contact" />
        <a
          href="mailto:ethanbiancardi@gmail.com"
          className="mt-3 inline-block text-xs text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
        >
          ethanbiancardi@gmail.com
        </a>
      </section>
    </PageShell>
  );
}
