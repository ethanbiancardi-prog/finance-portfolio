import type { ReactNode } from "react";
import { Card } from "./Card";

export function StatCard({
  label,
  value,
  hint,
  size = "sm",
  card = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  size?: "lg" | "sm";
  card?: boolean;
}) {
  const content = (
    <>
      <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</p>
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
