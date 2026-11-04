// The hero graphic: a glowing core with three rings turning around it. The
// middle ring carries one node per fund holding, labelled with its ticker, so
// the decoration is also the fund's line-up. Pure SVG + CSS (the eco-* classes
// in globals.css); it stops moving under prefers-reduced-motion.
export default function Orbit({ tickers }: { tickers: readonly string[] }) {
  const C = 200; // centre of the 400 x 400 view box
  const R = 132; // radius of the holdings ring
  return (
    <svg viewBox="0 0 400 400" className="h-auto w-full max-w-[380px]" role="img" aria-label={`The fund's ${tickers.length} holdings`}>
      <defs>
        <radialGradient id="eco-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95" />
          <stop offset="45%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="eco-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--eco-cyan)" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* Outer HUD ring: 72 ticks, every sixth one long. */}
      <g className="eco-spin-slow" opacity="0.55">
        {Array.from({ length: 72 }, (_, i) => {
          const a = (i / 72) * Math.PI * 2;
          const long = i % 6 === 0;
          const r1 = 186, r2 = long ? 174 : 180;
          return (
            <line
              key={i}
              x1={C + r1 * Math.cos(a)}
              y1={C + r1 * Math.sin(a)}
              x2={C + r2 * Math.cos(a)}
              y2={C + r2 * Math.sin(a)}
              stroke="var(--accent)"
              strokeOpacity={long ? 0.8 : 0.35}
              strokeWidth={long ? 1.4 : 0.8}
            />
          );
        })}
      </g>

      {/* Holdings ring. */}
      <g className="eco-spin">
        <circle cx={C} cy={C} r={R} fill="none" stroke="url(#eco-ring)" strokeWidth="1" />
        {tickers.map((t, i) => {
          const a = (i / tickers.length) * Math.PI * 2 - Math.PI / 2;
          const x = C + R * Math.cos(a);
          const y = C + R * Math.sin(a);
          const lx = C + (R + 22) * Math.cos(a);
          const ly = C + (R + 22) * Math.sin(a);
          return (
            <g key={t}>
              <circle cx={x} cy={y} r="7" fill="var(--accent)" opacity="0.14" />
              <circle cx={x} cy={y} r="3" fill="var(--accent)" />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="9"
                fill="var(--foreground)"
                opacity="0.7"
                style={{ fontFamily: "var(--font-num)" }}
              >
                {t}
              </text>
            </g>
          );
        })}
      </g>

      {/* Inner dashed ring, turning the other way. */}
      <g className="eco-spin-rev">
        <circle cx={C} cy={C} r="78" fill="none" stroke="var(--eco-cyan)" strokeOpacity="0.5" strokeDasharray="2 7" />
        <circle cx={C + 78} cy={C} r="2.5" fill="var(--eco-cyan)" />
      </g>

      {/* Core: a soft glow with a leaf-vein hexagon in it. */}
      <circle cx={C} cy={C} r="70" fill="url(#eco-core)" className="eco-pulse" />
      <polygon
        points={Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          return `${C + 30 * Math.cos(a)},${C + 30 * Math.sin(a)}`;
        }).join(" ")}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
      />
      <path
        d={`M${C},${C + 20} C${C - 16},${C + 4} ${C - 12},${C - 14} ${C},${C - 20} C${C + 12},${C - 14} ${C + 16},${C + 4} ${C},${C + 20} Z M${C},${C + 20} L${C},${C - 12}`}
        fill="color-mix(in srgb, var(--accent) 18%, transparent)"
        stroke="var(--accent)"
        strokeWidth="1.2"
      />
    </svg>
  );
}
