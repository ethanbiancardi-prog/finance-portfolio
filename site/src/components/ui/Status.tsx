import type { ReactNode } from "react";

export type Rating = "good" | "average" | "bad";

const DEFAULT_LABEL: Record<Rating, string> = { good: "Good", average: "Average", bad: "Bad" };

// Color lives only on the dot, never on the text — readable at small sizes
// and works for colorblind users.
export function StatusDot({ rating }: { rating: Rating | null }) {
  if (!rating) return null;
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: `var(--status-${rating})` }}
    />
  );
}

export function StatusBadge({
  rating,
  label,
  fallback = "N/A",
}: {
  rating: Rating | null;
  label?: ReactNode;
  fallback?: ReactNode;
}) {
  if (!rating) {
    return fallback === null ? null : <span className="text-xs text-zinc-500">{fallback}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
      <StatusDot rating={rating} />
      {label ?? DEFAULT_LABEL[rating]}
    </span>
  );
}
