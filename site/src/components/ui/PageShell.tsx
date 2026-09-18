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
      <main className="page-enter mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
        <div className="border-b border-border pb-4">
          <p className="text-[11px] caps-wide text-zinc-500">
            {eyebrow}
          </p>
          <h1 className="page-title mt-1.5 text-lg font-semibold caps-tight text-foreground sm:text-xl">
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
