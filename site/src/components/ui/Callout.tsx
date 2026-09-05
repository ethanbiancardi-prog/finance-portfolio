import type { ReactNode } from "react";
import { SectionHeader } from "./SectionHeader";

export function Callout({
  label,
  title,
  children,
  className,
}: {
  label?: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-accent/40 bg-accent/5 p-4 ${className ?? ""}`}>
      {label && <SectionHeader label={label} />}
      {title && <p className="text-sm font-medium text-black dark:text-zinc-50">{title}</p>}
      <div
        className={`text-sm leading-6 text-zinc-600 dark:text-zinc-400 ${
          label || title ? "mt-1" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}
