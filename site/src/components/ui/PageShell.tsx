import type { ReactNode } from "react";
import { SectionHeader } from "./SectionHeader";

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
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-14 sm:py-20">
        <div className="border-b border-zinc-200 pb-8 dark:border-zinc-800">
          <SectionHeader label={eyebrow} />
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50 sm:text-4xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 font-mono text-sm text-zinc-500 dark:text-zinc-500">{subtitle}</p>
          )}
          {description && (
            <p className="mt-3 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
              {description}
            </p>
          )}
        </div>
        {children}
      </main>
    </div>
  );
}
