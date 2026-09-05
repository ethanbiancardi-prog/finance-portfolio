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
      className={`rounded-md border px-3 py-1.5 font-mono text-xs uppercase tracking-wide transition-colors duration-150 ease-out ${
        active
          ? "border-accent text-accent"
          : "border-zinc-200 text-zinc-600 hover:border-accent/50 dark:border-zinc-800 dark:text-zinc-400"
      }`}
    >
      {children}
    </button>
  );
}
