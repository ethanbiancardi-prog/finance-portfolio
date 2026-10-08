import type { ReactNode } from "react";
import { Card, SectionHeader } from "@/components/ui";

// A page section that folds down to its title line, so the long tables on
// /paper-trading don't make the page a scroll marathon. Closed by default
// unless `defaultOpen`; `meta` is the short note on the right of the title
// ("36 trades").
export function Collapsible({
  label,
  description,
  meta,
  defaultOpen = false,
  children,
}: {
  label: string;
  description?: string;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Card as="section" className="mt-4">
      <details open={defaultOpen} className="group">
        <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="mt-0.5 text-xs text-zinc-500 transition-transform group-open:rotate-90">
            ›
          </span>
          <span className="min-w-0 flex-1">
            <SectionHeader label={label} description={description} />
          </span>
          <span className="shrink-0 pt-0.5 text-[10px] caps text-zinc-500">
            {meta && <span className="mr-2">{meta}</span>}
            <span className="text-accent group-open:hidden">Show</span>
            <span className="hidden text-accent group-open:inline">Hide</span>
          </span>
        </summary>
        {children}
      </details>
    </Card>
  );
}
