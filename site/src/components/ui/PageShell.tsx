import type { ReactNode } from "react";

export function PageShell({
  eyebrow,
  title,
  subtitle,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col bg-background font-mono">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
        <div className="border-b border-border pb-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            <span className="text-accent">$</span> ~/{eyebrow.replace(/\s+/g, "-")}
          </p>
          <h1 className="mt-1.5 text-lg font-semibold uppercase tracking-[0.06em] text-foreground sm:text-xl">
            {title}
            <span className="cursor-blink ml-1 inline-block h-[0.9em] w-[0.5em] translate-y-[0.12em] bg-accent" />
          </h1>
          {subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}
          {description && (
            <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {description}
            </p>
          )}
        </div>
        {children}
      </main>
    </div>
  );
}
