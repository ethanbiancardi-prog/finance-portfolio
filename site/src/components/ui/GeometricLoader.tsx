// Inline "something is working" mark: a hexagon, a square and a core, all
// turning at different speeds and directions. Deliberately has no start or
// end state — an AI scan can take 30 seconds and a spinner that looked like
// a progress bar would be lying about how far along it is.
//
// Pure CSS (keyframes live in globals.css), so this stays a server component
// and costs no JavaScript. Colour comes from currentColor, so it takes the
// accent inside an accent-coloured element and the text colour elsewhere.

export function GeometricLoader({
  size = 16,
  label,
  className,
}: {
  size?: number;
  /** Optional text beside the mark, e.g. "Analyzing". */
  label?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        role="status"
        aria-label="Loading"
        className="shrink-0 overflow-visible"
      >
        {/* Outer hexagon, counter-clockwise and slow. */}
        <polygon
          className="geo-shape geo-outer"
          points="12,1.5 21.1,6.75 21.1,17.25 12,22.5 2.9,17.25 2.9,6.75"
          stroke="currentColor"
          strokeWidth="1.1"
          opacity="0.3"
        />
        {/* Inner square, clockwise and faster. */}
        <rect
          className="geo-shape geo-inner"
          x="7"
          y="7"
          width="10"
          height="10"
          stroke="currentColor"
          strokeWidth="1.2"
          opacity="0.75"
        />
        {/* Core, breathing. */}
        <circle className="geo-shape geo-core" cx="12" cy="12" r="2.1" fill="currentColor" />
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
      <GeometricLoader size={20} className="text-zinc-600" />
    </div>
  );
}
