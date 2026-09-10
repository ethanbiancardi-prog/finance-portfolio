import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageShell, SectionHeader } from "@/components/ui";
import { NOTES } from "../notes";

export function generateStaticParams() {
  return NOTES.filter((n) => n.detail).map((n) => ({ slug: n.slug }));
}

const linkClass =
  "text-[11px] uppercase tracking-[0.1em] text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent";

export default async function QuantNotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const note = NOTES.find((n) => n.slug === slug);
  if (!note?.detail) notFound();
  const d = note.detail;

  return (
    <PageShell eyebrow={`quant notes/${note.slug}`} title={note.title} description={d.summary}>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        <Link href="/quant-notes" className={linkClass}>
          ← all notes
        </Link>
        <Link href={note.href} className={linkClass}>
          {note.cta}
        </Link>
      </p>

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

      <Card as="section" className="mt-4">
        <SectionHeader label="worked example" />
        <p className="mt-3 max-w-2xl text-xs leading-5 text-zinc-400">{d.example.setup}</p>
        <table className="mt-3 w-full text-left">
          <tbody>
            {d.example.steps.map((s, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className="w-8 py-1.5 text-[10px] text-zinc-600">{String(i + 1).padStart(2, "0")}</td>
                <td className="py-1.5 pr-4 text-[10px] uppercase tracking-[0.12em] text-zinc-500">{s.label}</td>
                <td className="py-1.5 text-xs tabular-nums text-foreground">{s.calc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 max-w-2xl border-l-2 border-accent pl-3 text-xs leading-5 text-zinc-400">
          {d.example.result}
        </p>
      </Card>

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

      <Card as="section" className="mt-4">
        <SectionHeader label="glossary" />
        <dl className="mt-3 divide-y divide-border/60">
          {d.glossary.map((g) => (
            <div key={g.term} className="grid grid-cols-1 gap-1 py-1.5 sm:grid-cols-[11rem_1fr] sm:gap-3">
              <dt className="text-xs text-foreground">{g.term}</dt>
              <dd className="text-xs leading-5 text-zinc-400">{g.definition}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </PageShell>
  );
}
