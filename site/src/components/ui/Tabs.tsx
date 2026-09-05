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
    <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-3 py-2 font-mono text-xs uppercase tracking-wide transition-colors duration-150 ease-out ${
            active === t.key
              ? "border-b-2 border-accent text-accent"
              : "text-zinc-500 hover:text-accent"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
