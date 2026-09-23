"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

// A hexagon cut into six facets. While work is in flight the facets fold
// inward and back out in sequence, so the fold travels around the ring. When
// the work finishes they snap back into a whole hexagon and an outline draws
// around it, then the mark lifts away — the shape reconstructing itself is
// how the loader says "done" instead of just vanishing.
//
// Deliberately has no progress arc: an AI scan can run thirty seconds and
// vary a lot, so anything resembling progress would be inventing information.
//
// Two ways to use it:
//   <GeometricLoader />                  — loops for as long as it is mounted
//   <GeometricLoader loading={busy} />   — plays the reconstruct when `busy`
//                                          goes false, then unmounts itself
//
// The second form needs the parent to keep rendering it after the work ends;
// that is what buys the ~600ms the reconstruct takes.

const CENTER = "12,12";
const VERTICES = [
  "21.5,12",
  "16.75,20.23",
  "7.25,20.23",
  "2.5,12",
  "7.25,3.77",
  "16.75,3.77",
] as const;

// Each facet is a wedge from the centre out to two adjacent vertices.
const FACETS = VERTICES.map(
  (v, i) => `${CENTER} ${v} ${VERTICES[(i + 1) % VERTICES.length]}`,
);

const RESOLVE_MS = 600;

export function GeometricLoader({
  size = 16,
  label,
  className,
  loading,
}: {
  size?: number;
  /** Optional text beside the mark, e.g. "Analyzing". */
  label?: ReactNode;
  className?: string;
  /**
   * Omit for a loader that simply loops while mounted. Pass a boolean to get
   * the reconstruct: when it flips to false the mark reassembles and then
   * removes itself.
   */
  loading?: boolean;
}) {
  const controlled = loading !== undefined;

  // Derive the phase during render rather than in an effect, so the switch to
  // "resolving" happens in the same commit as the prop change.
  const [phase, setPhase] = useState<"folding" | "resolving" | "done">(
    controlled && !loading ? "done" : "folding",
  );
  const [prevLoading, setPrevLoading] = useState(loading);

  if (controlled && loading !== prevLoading) {
    setPrevLoading(loading);
    setPhase(loading ? "folding" : "resolving");
  }

  useEffect(() => {
    if (phase !== "resolving") return;
    const timer = setTimeout(() => setPhase("done"), RESOLVE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "done") return null;

  const resolving = phase === "resolving";

  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        role="status"
        aria-label={resolving ? "Loaded" : "Loading"}
        className={`shrink-0 overflow-visible ${resolving ? "geo-resolving" : "geo-folding"}`}
      >
        {FACETS.map((points, i) => (
          <polygon
            key={points}
            className="geo-facet"
            points={points}
            fill="currentColor"
            // Staggering the delay is what makes the fold travel around the
            // ring rather than every facet moving as one.
            style={{ animationDelay: `${i * (resolving ? 28 : 90)}ms` }}
          />
        ))}
        <polygon
          className="geo-ring"
          points={VERTICES.join(" ")}
          pathLength="1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </svg>
      {label && <span>{label}</span>}
    </span>
  );
}

/**
 * Placeholder for a chart whose code is still streaming in. Holds the chart's
 * final height so the page doesn't jump when it arrives, and shows the
 * geometric mark instead of a grey pulsing block.
 */
export function ChartLoading({ className }: { className?: string }) {
  return (
    <div
      className={`mt-4 flex items-center justify-center border border-border bg-panel ${className ?? ""}`}
    >
      <GeometricLoader size={22} className="text-zinc-600" />
    </div>
  );
}
