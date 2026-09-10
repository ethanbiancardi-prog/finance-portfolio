import { Card, PageShell, SectionHeader } from "@/components/ui";
import { NOTES } from "./notes";

export default function QuantNotes() {
  return (
    <PageShell
      eyebrow="quant notes"
      title="Quant Notes"
      description="Plain-language notes on the quantitative concepts behind the tools on this site — what each formula means, why it's used this way, and where to see it running on real data."
    >
      <section className="mt-4 space-y-2">
        {NOTES.map((note) => {
          const hasDetail = Boolean(note.detail);
          return (
            <Card key={note.slug} href={hasDetail ? `/quant-notes/${note.slug}` : note.href} interactive>
              <SectionHeader label={note.label} />
              <h3 className="mt-2 text-sm uppercase tracking-[0.04em] text-foreground">{note.title}</h3>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-400">{note.body}</p>
              <p className="mt-3 inline-block border border-border bg-background px-2 py-1 text-[11px] text-zinc-300">
                {note.formula}
              </p>
              <p className="mt-3 text-[11px] uppercase tracking-[0.1em] text-accent">
                {hasDetail ? "Read the full note →" : note.cta}
              </p>
            </Card>
          );
        })}
      </section>
    </PageShell>
  );
}
