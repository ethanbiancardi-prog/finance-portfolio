import type { ReactNode } from "react";
import type { GlossaryKey } from "@/lib/glossary";
import { Card } from "./Card";
import { Term } from "./Term";

export function StatCard({
  label,
  value,
  hint,
  term,
  size = "sm",
  card = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  // Glossary key — when set, the label explains itself on hover.
  term?: GlossaryKey;
  size?: "lg" | "sm";
  card?: boolean;
}) {
  const content = (
    <>
      <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
        {term ? <Term term={term}>{label}</Term> : label}
      </p>
      <p
        className={`mt-1 tabular-nums tracking-tight text-foreground ${
          size === "lg" ? "text-2xl sm:text-[28px]" : "text-sm"
        }`}
      >
        {value}
      </p>
      {hint && <div className="mt-1 text-[11px]">{hint}</div>}
    </>
  );

  return card ? <Card padding="sm">{content}</Card> : <div>{content}</div>;
}
