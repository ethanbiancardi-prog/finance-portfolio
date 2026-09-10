import type { ReactNode } from "react";

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-150 ease-out ${
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-zinc-500 hover:border-zinc-400 hover:text-foreground dark:hover:border-zinc-600"
      }`}
    >
      {children}
    </button>
  );
}
