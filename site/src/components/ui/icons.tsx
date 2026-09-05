import type { ReactNode } from "react";

export type IconName =
  | "tech"
  | "biotech"
  | "consumer"
  | "financial"
  | "healthcare"
  | "energy"
  | "indexes";

// Each entry supplies only inner shapes — the shared <svg> shell below owns
// viewBox/stroke/fill so every icon stays visually consistent by construction.
const PATHS: Record<IconName, ReactNode> = {
  tech: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <line x1="12" y1="7" x2="12" y2="3" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="7" y1="12" x2="3" y2="12" />
      <line x1="17" y1="12" x2="21" y2="12" />
    </>
  ),
  biotech: (
    <>
      <path d="M9 3 Q17 7 9 12 Q1 17 9 21" />
      <path d="M15 3 Q7 7 15 12 Q23 17 15 21" />
      <line x1="9.5" y1="7.2" x2="14.5" y2="7.2" />
      <line x1="9.5" y1="16.8" x2="14.5" y2="16.8" />
    </>
  ),
  consumer: (
    <>
      <path d="M6 9 L18 9 L17 20 L7 20 Z" />
      <path d="M9 9 a3 3 0 0 1 6 0" />
    </>
  ),
  financial: (
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
