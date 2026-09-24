import { Card, PageShell, SectionHeader } from "@/components/ui";

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded-[var(--radius-sm)] border border-border px-2 py-0.5 text-[11px] caps-tight text-zinc-400">
      {children}
    </span>
  );
}

const FINANCE_SKILLS = ["Valuation", "Financial Modeling", "Portfolio Theory"];
const TECHNICAL_SKILLS = ["Python", "TypeScript", "React / Next.js", "APIs"];
const TARGET_ROLES = [
  "Investment Banking",
  "Equity Research",
  "Asset Management",
  "Wealth Management",
  "Consulting",
  "Quantitative Research / Trading",
  "FinTech",
];
const COURSEWORK = [
  "Intro to Financial Reporting",
  "Coding with Python",
  "Intro to Machine Learning",
  "Accounting",
];

export default function About() {
  return (
    <PageShell
      eyebrow="about"
      title="Ethan Biancardi"
      subtitle="Bentley University, Finance & Artificial Intelligence"
      description="Double major, expected graduation Spring 2029."
    >
      <section className="mt-4">
        <SectionHeader label="why I built this" />
        <div className="mt-2 max-w-2xl space-y-3 text-xs leading-5 text-zinc-400">
          <p>
            I built PRISM because I wanted to learn how a website is made and how different trading strategies work. I
            started with a clear idea of what I wanted: a paper trading simulator that could automate trading, so I could find
            out which strategies work best and potentially put real money through the same process one day. I did not think it
            would turn out like this. It is not finished yet, and I keep adding to it every day.
          </p>
          <p>
            I used AI for most of the coding and for finding data, which ties into the other reason I built this. I have
            always been interested in finding ways to incorporate AI into finance, because I think it can make people in this
            industry far more productive. Work that used to take an analyst hours, like reading through a 10-K or tracking news
            across a whole portfolio, can now take minutes. On PRISM, AI summarizes 10-K filings, flags risks buried inside
            them, argues a stock from six different investor viewpoints, and scans for new laws and world events that could
            affect a company. That frees up time for the parts of the job that still need a person: judgment, conviction, and
            the final decision.
          </p>
          <p>
            The biggest thing I have learned is that AI works best as a research assistant, not a decision maker. Every AI
            result on the site shows its source and the date it came from, and anywhere a plain formula does the job, like a
            DCF or a Sharpe ratio, I used the formula instead.
          </p>
        </div>
      </section>

      <section className="mt-4">
        <SectionHeader label="what I'm looking for" description="Summer finance internships." />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TARGET_ROLES.map((role) => (
            <Tag key={role}>{role}</Tag>
          ))}
        </div>
      </section>

      <section className="mt-4">
        <SectionHeader label="skills" />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card padding="sm">
            <h3 className="text-[10px] caps text-zinc-500">Finance</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FINANCE_SKILLS.map((skill) => (
                <Tag key={skill}>{skill}</Tag>
              ))}
            </div>
          </Card>
          <Card padding="sm">
            <h3 className="text-[10px] caps text-zinc-500">Technical</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {TECHNICAL_SKILLS.map((skill) => (
                <Tag key={skill}>{skill}</Tag>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section className="mt-4">
        <SectionHeader label="coursework & experience" />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {COURSEWORK.map((course) => (
            <Tag key={course}>{course}</Tag>
          ))}
        </div>
      </section>

      <section className="mt-4">
        <SectionHeader label="contact" />
        <div className="mt-3 space-y-1.5 text-xs">
          <p>
            <span className="text-zinc-500">Email: </span>
            <a
              href="mailto:ethanbiancardi@gmail.com"
              className="text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
            >
              ethanbiancardi@gmail.com
            </a>
          </p>
          <p>
            <span className="text-zinc-500">School Email: </span>
            <a
              href="mailto:ebiancardi@falcon.bentley.edu"
              className="text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
            >
              ebiancardi@falcon.bentley.edu
            </a>
          </p>
          <p>
            <span className="text-zinc-500">GitHub: </span>
            <a
              href="https://github.com/ethanbiancardi-prog"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
            >
              github.com/ethanbiancardi-prog
            </a>
          </p>
          <p>
            <span className="text-zinc-500">LinkedIn: </span>
            <a
              href="https://www.linkedin.com/in/ethan-biancardi"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
            >
              linkedin.com/in/ethan-biancardi
            </a>
          </p>
        </div>
      </section>

      <section className="mt-4">
        <SectionHeader label="resume" />
        <a
          href="/resume.docx"
          download
          className="mt-3 inline-block text-xs text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
        >
          Download Resume (.docx) →
        </a>
      </section>
    </PageShell>
  );
}
