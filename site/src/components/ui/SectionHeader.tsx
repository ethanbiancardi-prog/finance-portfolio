export function SectionHeader({ label, description }: { label: string; description?: string }) {
  return (
    <>
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-accent">{`// ${label}`}</h2>
      {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
    </>
  );
}
