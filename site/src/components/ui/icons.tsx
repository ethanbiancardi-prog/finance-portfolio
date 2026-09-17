import type { ReactNode } from "react";

// One per sector key in lib/sectors.ts, plus "indexes".
export type IconName =
  | "communications"
  | "consumer"
  | "energy"
  | "financials"
  | "healthcare"
  | "industrials"
  | "sustainability"
  | "technology"
  | "indexes";

// Each entry supplies only inner shapes — the shared <svg> shell below owns
// viewBox/stroke/fill so every icon stays visually consistent by construction.
const PATHS: Record<IconName, ReactNode> = {
  // Broadcast tower: a mast with two arcs radiating out.
  communications: (
    <>
      <line x1="12" y1="10" x2="12" y2="21" />
      <circle cx="12" cy="8" r="2" />
      <path d="M7.5 3.5 a7 7 0 0 0 0 9" />
      <path d="M16.5 3.5 a7 7 0 0 1 0 9" />
    </>
  ),
  technology: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <line x1="12" y1="7" x2="12" y2="3" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="7" y1="12" x2="3" y2="12" />
      <line x1="17" y1="12" x2="21" y2="12" />
    </>
  ),
  consumer: (
    <>
      <path d="M6 9 L18 9 L17 20 L7 20 Z" />
      <path d="M9 9 a3 3 0 0 1 6 0" />
    </>
  ),
  financials: (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="7" y1="8" x2="7" y2="17" />
      <line x1="11" y1="8" x2="11" y2="17" />
      <line x1="15" y1="8" x2="15" y2="17" />
      <line x1="19" y1="8" x2="19" y2="17" />
      <line x1="4" y1="19" x2="20" y2="19" />
    </>
  ),
  healthcare: <path d="M9 4 H15 V9 H20 V15 H15 V20 H9 V15 H4 V9 H9 Z" />,
  energy: <path d="M13 3 L7 13 L11 13 L9 21 L17 10 L13 10 Z" />,
  // Factory: a roofline with sawtooth peaks and a chimney.
  industrials: (
    <>
      <path d="M3 21 V11 L8 14 V11 L13 14 V11 L18 14 V6 H21 V21 Z" />
      <line x1="3" y1="21" x2="21" y2="21" />
    </>
  ),
  // Leaf with a midrib.
  sustainability: (
    <>
      <path d="M5 19 C5 9 11 5 20 4 C19 13 15 19 5 19 Z" />
      <path d="M5 19 L14 10" />
    </>
  ),
  indexes: (
    <>
      <line x1="4" y1="20" x2="20" y2="20" />
      <line x1="7" y1="20" x2="7" y2="14" />
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="17" y1="20" x2="17" y2="16" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.5,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
