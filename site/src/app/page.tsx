import Link from "next/link";

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
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-14 sm:py-20">
        <section className="border-b border-zinc-200 pb-8 dark:border-zinc-800">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">
            {"// finance × ai portfolio"}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Ethan Biancardi
          </h1>
          <p className="mt-2 font-mono text-sm text-zinc-500 dark:text-zinc-500">
            Finance x AI @ Bentley
          </p>
          <p className="mt-6 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
            I build working finance tools with modern AI — not just a resume, a set
            of projects you can actually try.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-mono text-xs uppercase tracking-widest text-accent">
            {"// projects"}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {projects.map((project, i) => {
              const card = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-mono text-xs text-zinc-400 dark:text-zinc-600">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
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
                  <h3 className="mt-3 font-medium text-black dark:text-zinc-50">
                    {project.name}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    {project.blurb}
                  </p>
                </>
              );

              const className =
                "rounded-sm border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";

              return project.href ? (
                <Link
                  key={project.name}
                  href={project.href}
                  className={`${className} transition-colors hover:border-accent/50`}
                >
                  {card}
                </Link>
              ) : (
                <div key={project.name} className={className}>
                  {card}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-mono text-xs uppercase tracking-widest text-accent">
            {"// contact"}
          </h2>
          <a
            href="mailto:ethanbiancardi@gmail.com"
            className="mt-3 inline-block font-mono text-sm font-medium text-black underline underline-offset-4 dark:text-zinc-50"
          >
            ethanbiancardi@gmail.com
          </a>
        </section>
      </main>
    </div>
  );
}
