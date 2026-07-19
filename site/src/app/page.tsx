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
    status: "Planned",
  },
  {
    name: "10-K Statement Analyzer",
    blurb:
      "Upload a filing and get AI-computed liquidity, leverage, and profitability ratios plus a one-page summary.",
    status: "Planned",
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
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-20 sm:py-28">
        <section>
          <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Ethan Biancardi
          </h1>
          <p className="mt-3 text-xl text-zinc-600 dark:text-zinc-400">
            Finance x AI @ Bentley
          </p>
          <p className="mt-6 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
            I build working finance tools with modern AI — not just a resume, a set
            of projects you can actually try.
          </p>
        </section>

        <section className="mt-16">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Projects
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {projects.map((project) => {
              const card = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-medium text-black dark:text-zinc-50">
                      {project.name}
                    </h3>
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {project.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    {project.blurb}
                  </p>
                </>
              );

              const className =
                "rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950";

              return project.href ? (
                <Link
                  key={project.name}
                  href={project.href}
                  className={`${className} transition-colors hover:border-zinc-300 dark:hover:border-zinc-700`}
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

        <section className="mt-16">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Contact
          </h2>
          <a
            href="mailto:ethanbiancardi@gmail.com"
            className="mt-3 inline-block text-base font-medium text-black underline underline-offset-4 dark:text-zinc-50"
          >
            ethanbiancardi@gmail.com
          </a>
        </section>
      </main>
    </div>
  );
}
