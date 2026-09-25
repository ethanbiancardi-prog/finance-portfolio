// Shown instantly on navigation while a page's JS chunk (and its recharts
// import) streams in. This wait can run a second or two on a cold chunk, so
// rather than grey skeleton bars it draws an equity curve across a grid —
// the thing most of these pages are about — with a scan line tracking the
// drawing head. Pure CSS; keyframes live in globals.css.
//
// The curve is a fixed, hand-written path rather than random data: it must
// render identically on the server and the client, and it should read as a
// market, not as noise.

// pathLength="1" lets the dash animation work in fractions of the curve,
// independent of the path's real length.
const CURVE =
  "M0,74 L26,68 L52,79 L78,58 L104,64 L130,44 L156,52 L182,33 L208,40 L234,22 L260,29 L286,12 L312,18 L336,6";

const BENCH =
  "M0,80 L26,78 L52,82 L78,74 L104,77 L130,70 L156,73 L182,65 L208,68 L234,59 L260,62 L286,52 L312,55 L336,47";

export function PageLoading() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <main className="flex w-full flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6 lg:px-10">
        <div className="w-full max-w-md">
          <div className="relative overflow-hidden">
            <svg
              viewBox="0 0 336 92"
              width="100%"
              height="92"
              fill="none"
              role="status"
              aria-label="Loading"
              className="block"
            >
              {/* Grid */}
              <g className="grid-in" stroke="var(--border)" strokeWidth="1">
                <line x1="0" y1="0.5" x2="336" y2="0.5" />
                <line x1="0" y1="30.5" x2="336" y2="30.5" />
                <line x1="0" y1="60.5" x2="336" y2="60.5" />
                <line x1="0" y1="91.5" x2="336" y2="91.5" />
              </g>

              {/* Benchmark, drawn slightly behind and dimmer. */}
              <path
                className="curve-draw"
                d={BENCH}
                pathLength="1"
                stroke="var(--border)"
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ animationDelay: "120ms" }}
              />

              {/* The curve itself. */}
              <path
                className="curve-draw"
                d={CURVE}
                pathLength="1"
                stroke="var(--accent)"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            {/* Scan line sweeping with the drawing head. */}
            <div
              aria-hidden="true"
              className="curve-sweep pointer-events-none absolute inset-y-0 left-0 w-16"
              style={{
                background:
                  "linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 12%, transparent))",
              }}
            />
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border pt-2.5">
            <span className="text-[10px] caps text-zinc-500">Loading</span>
            <span className="text-[10px] caps text-zinc-600">PRISM</span>
          </div>
        </div>
      </main>
    </div>
  );
}
