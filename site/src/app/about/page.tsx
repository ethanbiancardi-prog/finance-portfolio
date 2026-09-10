import { Card, PageShell, SectionHeader } from "@/components/ui";

function Todo({ children }: { children: string }) {
  return <p className="mt-2 text-sm italic text-zinc-400 dark:text-zinc-600">TODO(ethan): {children}</p>;
}

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded-md border border-zinc-200 px-2.5 py-1 font-mono text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
      {children}
    </span>
  );
}

const FINANCE_SKILLS = ["Valuation", "Financial Modeling", "Portfolio Theory"];
const TECHNICAL_SKILLS = ["Python", "TypeScript", "React / Next.js", "APIs"];

export default function About() {
  return (
    <PageShell
      eyebrow="about"
      title="Ethan Biancardi"
      subtitle="Bentley University — Finance & Artificial Intelligence"
      description="Double major, expected graduation TODO(ethan)."
    >
      <section className="mt-8">
        <SectionHeader label="why I built this" />
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          I built this finance portfolio because I wanted to learn more about coding with AI while
          also learning essential financial hard skills like building DCF models.
        </p>
      </section>

      <section className="mt-8">
        <SectionHeader label="what I'm looking for" />
        <Todo>Target roles/internships.</Todo>
      </section>

      <section className="mt-8">
        <SectionHeader label="skills" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card padding="sm">
            <h3 className="font-mono text-xs uppercase tracking-wide text-zinc-500">Finance</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {FINANCE_SKILLS.map((skill) => (
                <Tag key={skill}>{skill}</Tag>
              ))}
            </div>
          </Card>
          <Card padding="sm">
            <h3 className="font-mono text-xs uppercase tracking-wide text-zinc-500">Technical</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {TECHNICAL_SKILLS.map((skill) => (
                <Tag key={skill}>{skill}</Tag>
              ))}
            </div>
          </Card>
        </div>
        <Todo>Confirm and trim the lists above to what's actually true.</Todo>
      </section>

      <section className="mt-8">
        <SectionHeader label="coursework & experience" />
        <Todo>Relevant coursework or experience.</Todo>
      </section>

      <section className="mt-8">
        <SectionHeader label="contact" />
        <div className="mt-3 space-y-2 font-mono text-sm">
          <p>
            <span className="text-zinc-500">Email — </span>
            <span className="text-zinc-400 dark:text-zinc-600">TODO(ethan)</span>
          </p>
          <p>
            <span className="text-zinc-500">GitHub — </span>
            <a
              href="https://github.com/ethanbiancardi-prog"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-black underline underline-offset-4 transition-colors duration-150 ease-out hover:text-accent dark:text-zinc-50"
            >
              github.com/ethanbiancardi-prog
            </a>
          </p>
          <p>
            <span className="text-zinc-500">LinkedIn — </span>
            <span className="text-zinc-400 dark:text-zinc-600">TODO(ethan)</span>
          </p>
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader label="resume" />
        {/* TODO(ethan): drop the actual file at site/public/resume.pdf */}
        <a
          href="/resume.pdf"
          className="mt-3 inline-block font-mono text-sm font-medium text-black underline underline-offset-4 transition-colors duration-150 ease-out hover:text-accent dark:text-zinc-50"
        >
          Download Resume →
        </a>
      </section>
    </PageShell>
  );
}
