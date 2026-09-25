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
    <div className="flex flex-1 flex-col bg-background">
      <main className="page-enter flex w-full flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <div className="relative border-b border-border pb-4">
          {/* A short accent where the rule meets the title. */}
          <span aria-hidden="true" className="absolute -bottom-px left-0 h-[2px] w-24 bg-accent" />
          <p className="text-[11px] caps-wide text-zinc-500">
            {eyebrow}
          </p>
          {/* Sizing, weight and casing all live in .page-title now, so the
              display serif renders the same way in both visual styles. */}
          <h1 className="page-title mt-1.5 text-foreground">
            {title}
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
