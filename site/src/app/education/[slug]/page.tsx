import Link from "next/link";
import { notFound } from "next/navigation";
import { Callout, Card, PageShell, SectionHeader } from "@/components/ui";
import { NOTES } from "../content";

export function generateStaticParams() {
  return NOTES.filter((n) => n.detail || n.guide).map((n) => ({ slug: n.slug }));
}

const linkClass =
  "text-[11px] caps text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent";

// Both tracks share these: a numbered calculation with a setup line above and
// a conclusion below. The fundamentals track calls it a worked example, the
// tool guides call it a walkthrough, but it is the same shape on screen.
function WorkedExample({
  label,
  setup,
  steps,
  result,
}: {
  label: string;
  setup: string;
  steps: { label: string; calc: string }[];
  result: string;
}) {
  return (
    <Card as="section" className="mt-4">
      <SectionHeader label={label} />
      <p className="mt-3 max-w-2xl text-xs leading-5 text-zinc-400">{setup}</p>
      <table className="mt-3 w-full text-left">
        <tbody>
          {steps.map((s, i) => (
            <tr key={i} className="border-t border-border/60">
              <td className="w-8 py-1.5 text-[10px] text-zinc-600">{String(i + 1).padStart(2, "0")}</td>
              <td className="py-1.5 pr-4 text-[10px] caps text-zinc-500">{s.label}</td>
              <td className="py-1.5 text-xs tabular-nums text-foreground">{s.calc}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 max-w-2xl border-l-2 border-accent pl-3 text-xs leading-5 text-zinc-400">
        {result}
      </p>
    </Card>
  );
}

function Glossary({ items }: { items: { term: string; definition: string }[] }) {
  return (
    <Card as="section" className="mt-4">
      <SectionHeader label="glossary" />
      <dl className="mt-3 divide-y divide-border/60">
        {items.map((g) => (
          <div key={g.term} className="grid grid-cols-1 gap-1 py-1.5 sm:grid-cols-[11rem_1fr] sm:gap-3">
            <dt className="text-xs text-foreground">{g.term}</dt>
            <dd className="text-xs leading-5 text-zinc-400">{g.definition}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export default async function EducationEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const note = NOTES.find((n) => n.slug === slug);
  if (!note || (!note.detail && !note.guide)) notFound();

  const d = note.detail;
  const g = note.guide;

  return (
    <PageShell
      eyebrow={note.track === "tools" ? "tool guide" : "fundamentals"}
      title={note.title}
      description={d?.summary ?? g?.does}
    >
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        <Link href="/education" className={linkClass}>
          ← all entries
        </Link>
        <Link href={note.href} className={linkClass}>
          {note.cta}
        </Link>
      </p>

      {note.stuck && (
        <Callout label="if you get stuck" title={note.stuck.title} className="mt-4">
          {note.stuck.body}
        </Callout>
      )}

      {/* Fundamentals: intuition, formula, worked example, useful/breaks, glossary. */}
      {d && (
        <>
          <Card as="section" className="mt-4">
            <SectionHeader label="intuition" description="The idea, before any math." />
            <div className="mt-3 max-w-2xl space-y-3 text-xs leading-5 text-zinc-400">
              {d.intuition.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </Card>

          <Card as="section" className="mt-4">
            <SectionHeader label="formula" />
            <p className="mt-3 inline-block border border-border bg-background px-3 py-2 text-sm text-foreground">
              {d.formula.expression}
            </p>
            <dl className="mt-3 divide-y divide-border/60 border-t border-border/60">
              {d.formula.variables.map((v) => (
                <div key={v.symbol} className="grid grid-cols-[5rem_1fr] gap-3 py-1.5 sm:grid-cols-[7rem_1fr]">
                  <dt className="text-xs text-foreground">{v.symbol}</dt>
                  <dd className="text-xs leading-5 text-zinc-400">{v.meaning}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <WorkedExample label="worked example" {...d.example} />

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card as="section">
              <SectionHeader label="when it's useful" />
              <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                {d.useful.map((u, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 text-good">+</span>
                    <span>{u}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card as="section">
              <SectionHeader label="when it breaks" />
              <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                {d.breaks.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 text-bad">−</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Glossary items={d.glossary} />
        </>
      )}

      {/* Tool guides: what it does, the concept, how to read it, a walkthrough. */}
      {g && (
        <>
          <Card as="section" className="mt-4">
            <SectionHeader label="what this tool does" />
            <p className="mt-3 max-w-2xl text-xs leading-5 text-zinc-400">{g.does}</p>
          </Card>

          <Card as="section" className="mt-4">
            <SectionHeader label="the concept behind it" description="The finance, before the buttons." />
            <div className="mt-3 max-w-2xl space-y-3 text-xs leading-5 text-zinc-400">
              {g.concept.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </Card>

          <Card as="section" className="mt-4">
            <SectionHeader label="how to read the output" description="Each part of the screen, and what it is telling you." />
            <dl className="mt-3 divide-y divide-border/60 border-t border-border/60">
              {g.reading.map((r) => (
                <div key={r.part} className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-[11rem_1fr] sm:gap-3">
                  <dt className="text-xs text-foreground">{r.part}</dt>
                  <dd className="text-xs leading-5 text-zinc-400">{r.means}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <WorkedExample label="try it yourself" {...g.walkthrough} />

          <p className="mt-4">
            <Link href={note.href} className={linkClass}>
              {note.cta}
            </Link>
          </p>

          <Glossary items={g.glossary} />
        </>
      )}
    </PageShell>
  );
}
