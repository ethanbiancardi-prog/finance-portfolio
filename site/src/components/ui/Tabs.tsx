export function Tabs<K extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`-mb-px px-3 py-1.5 text-[11px] caps transition-colors duration-150 ease-out ${
            active === t.key
              ? "border-b border-accent text-accent"
              : "border-b border-transparent text-zinc-500 hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
