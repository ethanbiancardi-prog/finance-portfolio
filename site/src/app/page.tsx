import Image from "next/image";
import { Card, PageShell, SectionHeader } from "@/components/ui";

type Project = {
  name: string;
  blurb: string;
  status: "Live" | "In progress" | "Planned" | "Passcode";
  href?: string;
  // Screenshot of the tool, from public/screenshots (928x464, content column only).
  screenshot?: string;
};

const projects: Project[] = [
  {
    name: "AI Paper Trading Simulator",
    blurb:
      "Fake-money portfolio tracking real market prices, with a trade journal, risk metrics, and a live equity curve.",
    status: "Live",
    href: "/paper-trading",
    screenshot: "/screenshots/paper-trading.png",
  },
  {
    name: "Momentum + Leverage Strategy",
    blurb:
      "Aggressive rule-based book: the 10 strongest stocks by risk-adjusted momentum plus 3x index ETFs, with a 200-day trend circuit breaker, rebalanced monthly by a scheduled job.",
    status: "Live",
    href: "/rotation",
    screenshot: "/screenshots/rotation.png",
  },
  {
    name: "Monte Carlo Simulator",
    blurb:
      "Simulates 10,000 portfolio paths from real SPY/AGG history to project a range of outcomes and your odds of hitting a savings goal.",
    status: "Live",
    href: "/monte-carlo",
    screenshot: "/screenshots/monte-carlo.png",
  },
  {
    name: "Portfolio Optimizer",
    blurb:
      "Samples thousands of random portfolio weightings across your tickers to approximate the efficient frontier, with max-Sharpe and min-variance picks.",
    status: "Live",
    href: "/optimizer",
    screenshot: "/screenshots/optimizer.png",
  },
  {
    name: "Interactive DCF Builder",
    blurb:
      "Input revenue growth, margins, and WACC to get a live valuation with a WACC x terminal growth sensitivity table.",
    status: "Live",
    href: "/dcf-builder",
    screenshot: "/screenshots/dcf-builder.png",
  },
  {
    name: "Stock Research",
    blurb:
      "One ticker, everything on it: 17 ratios from the latest 10-K, an AI red-flag scan, live headlines from Yahoo Finance and Benzinga, and six AI analyst takes.",
    status: "Live",
    href: "/research",
    screenshot: "/screenshots/research.png",
  },
  {
    name: "Quant Notes",
    blurb:
      "Plain-language notes on the quant concepts behind these tools — momentum, Sharpe, beta, diversification, mean-variance optimization, Monte Carlo — each linking to the live page that demonstrates it.",
    status: "Live",
    href: "/quant-notes",
    screenshot: "/screenshots/quant-notes.png",
  },
  {
    name: "Client Work",
    blurb:
      "Case studies from small-business sites I've built: the problem, what shipped, and the result.",
    status: "Passcode",
    href: "/client-work",
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
            const isPasscode = project.status === "Passcode";
            const card = (
              <>
                {project.screenshot && (
                  <div className="-mx-3 -mt-3 mb-3 hidden aspect-[2/1] overflow-hidden rounded-t-[var(--radius)] border-b border-border sm:block">
                    <Image
                      src={project.screenshot}
                      alt={`${project.name} screenshot`}
                      width={928}
                      height={464}
                      sizes="(min-width: 640px) 50vw, 100vw"
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] tabular-nums text-zinc-600">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 text-[10px] caps ${
                      live ? "text-good" : isPasscode ? "text-accent" : "text-zinc-600"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 ${
                        live ? "animate-pulse bg-good" : isPasscode ? "bg-accent" : "bg-zinc-700"
                      }`}
                    />
                    {isPasscode ? "Passcode" : project.status}
                  </span>
                </div>
                <h3 className="mt-2 text-sm caps-tight text-foreground">
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
