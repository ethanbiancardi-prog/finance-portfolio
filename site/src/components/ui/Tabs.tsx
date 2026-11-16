export function Tabs<K extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
}) {
  // On a narrow phone the tabs can be wider than the screen. The row then
  // scrolls sideways on its own (scrollbar hidden, swipe to see more) instead
  // of pushing the whole page sideways. Wide screens look the same as before.
  // The grey line under the row is an inset shadow rather than a border, so
  // the active tab's underline can sit on top of it without being clipped by
  // the scrolling row.
  return (
    <div className="flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`whitespace-nowrap px-3 py-1.5 text-[11px] caps transition-colors duration-150 ease-out ${
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
