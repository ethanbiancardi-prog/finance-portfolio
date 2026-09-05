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
      <p className={size === "lg" ? "text-sm text-zinc-500" : "text-xs text-zinc-500"}>{label}</p>
      <p
        className={`mt-1 tabular-nums text-black dark:text-zinc-50 ${
          size === "lg" ? "text-2xl font-semibold" : "font-medium"
        }`}
      >
        {value}
      </p>
      {hint && <div className="mt-1">{hint}</div>}
    </>
  );

  return card ? <Card>{content}</Card> : <div>{content}</div>;
}
