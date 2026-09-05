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
    name: "Client Work",
    blurb:
      "Case studies from small-business sites I've built: the problem, what shipped, and the result.",
    status: "Planned",
  },
];

export default function Home() {
  return (
    <PageShell
      eyebrow="finance × ai portfolio"
      title="Ethan Biancardi"
      subtitle="Finance x AI @ Bentley"
      description="I build working finance tools with modern AI — not just a resume, a set of projects you can actually try."
    >
      <section className="mt-8">
        <SectionHeader label="projects" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {projects.map((project, i) => {
            const card = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-xs tabular-nums text-zinc-400 dark:text-zinc-600">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                      project.status === "Live"
                        ? "border-accent/40 text-accent"
                        : "border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-500"
                    }`}
                  >
                    {project.status === "Live" && (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                    )}
                    {project.status}
                  </span>
                </div>
                <h3 className="mt-3 font-medium text-black dark:text-zinc-50">{project.name}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {project.blurb}
                </p>
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

      <section className="mt-8">
        <SectionHeader label="contact" />
        <a
          href="mailto:ethanbiancardi@gmail.com"
          className="mt-3 inline-block font-mono text-sm font-medium text-black underline underline-offset-4 transition-colors duration-150 ease-out hover:text-accent dark:text-zinc-50"
        >
          ethanbiancardi@gmail.com
        </a>
      </section>
    </PageShell>
  );
}
