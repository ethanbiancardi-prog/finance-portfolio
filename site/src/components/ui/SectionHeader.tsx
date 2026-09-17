// Small caps label with a hairline rule filling the rest of the row (see
// .rule in globals.css), so every panel reads as a titled section.
export function SectionHeader({ label, description }: { label: string; description?: string }) {
  return (
    <>
      <h2 className="rule flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
        <span>{label}</span>
      </h2>
      {description && <p className="mt-1.5 max-w-2xl text-[11px] leading-5 text-zinc-500">{description}</p>}
    </>
  );
}
