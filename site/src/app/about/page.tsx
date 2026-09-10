import { Card, PageShell, SectionHeader } from "@/components/ui";

function Todo({ children }: { children: string }) {
  return <p className="mt-2 text-xs text-zinc-600"><span className="text-average">TODO(ethan):</span> {children}</p>;
}

function Tag({ children }: { children: string }) {
  return (
    <span className="border border-border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-zinc-400">
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
      subtitle="Bentley University — Finance & Artificial Intelligence"
      description="Double major, expected graduation Spring 2029."
    >
      <section className="mt-4">
        <SectionHeader label="why I built this" />
        <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-400">
          I built this finance portfolio because I wanted to learn more about coding with AI while
          also learning essential financial hard skills like building DCF models.
        </p>
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
            <h3 className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Finance</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FINANCE_SKILLS.map((skill) => (
                <Tag key={skill}>{skill}</Tag>
              ))}
            </div>
          </Card>
          <Card padding="sm">
            <h3 className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Technical</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {TECHNICAL_SKILLS.map((skill) => (
                <Tag key={skill}>{skill}</Tag>
              ))}
            </div>
          </Card>
        </div>
        <Todo>Confirm and trim the lists above to what's actually true.</Todo>
      </section>

      <section className="mt-4">
        <SectionHeader label="coursework & experience" />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {COURSEWORK.map((course) => (
            <Tag key={course}>{course}</Tag>
          ))}
        </div>
        <Todo>Add relevant work/internship experience, if any.</Todo>
      </section>

      <section className="mt-4">
        <SectionHeader label="contact" />
        <div className="mt-3 space-y-1.5 text-xs">
          <p>
            <span className="text-zinc-500">Email — </span>
            <a
              href="mailto:ethanbiancardi@gmail.com"
              className="text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
            >
              ethanbiancardi@gmail.com
            </a>
          </p>
          <p>
            <span className="text-zinc-500">School Email — </span>
            <a
              href="mailto:ebiancardi@falcon.bentley.edu"
              className="text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-accent hover:decoration-accent"
            >
              ebiancardi@falcon.bentley.edu
            </a>
          </p>
          <p>
            <span className="text-zinc-500">GitHub — </span>
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
            <span className="text-zinc-500">LinkedIn — </span>
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
