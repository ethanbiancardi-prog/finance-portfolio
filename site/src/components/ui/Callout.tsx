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
    <div className={`border border-border border-l-2 border-l-accent bg-panel p-3 ${className ?? ""}`}>
      {label && <SectionHeader label={label} />}
      {title && <p className="text-sm font-medium text-foreground">{title}</p>}
      <div className={`text-xs leading-5 text-zinc-500 dark:text-zinc-400 ${label || title ? "mt-1" : ""}`}>
        {children}
      </div>
    </div>
  );
}
