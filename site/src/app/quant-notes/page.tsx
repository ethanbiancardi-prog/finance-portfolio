import { Card, PageShell } from "@/components/ui";
import { NOTES } from "./notes";

export default function QuantNotes() {
  return (
    <PageShell
      eyebrow="notes"
      title="Quant Notes"
      description="Plain-language notes on the quantitative concepts behind the tools on this site — what each formula means, why it's used this way, and where to see it running on real data."
    >
      <section className="mt-4 space-y-2">
        {NOTES.map((note) => {
          const hasDetail = Boolean(note.detail);
          return (
            <Card key={note.slug} href={hasDetail ? `/quant-notes/${note.slug}` : note.href} interactive>
              <h3 className="section-title text-[11px] caps-wide text-accent">{note.title}</h3>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-400">{note.body}</p>
              <p className="mt-3 inline-block rounded-[var(--radius-sm)] border border-border bg-background px-2 py-1 font-mono text-[11px] text-zinc-400">
                {note.formula}
              </p>
              <p className="mt-3 text-[11px] caps text-accent">
                {hasDetail ? "Read the full note →" : note.cta}
              </p>
            </Card>
          );
        })}
      </section>
    </PageShell>
  );
}
