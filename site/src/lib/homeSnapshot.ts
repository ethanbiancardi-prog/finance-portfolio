import { getShowcase } from "./showcase";

// The one live number on the homepage: what my practice portfolio (the
// dashboard account shown on /paper-trading) is worth, and how it has moved
// since it opened. Server side and cached in lib/showcase.ts — a visitor
// loading the homepage never triggers a price fetch of their own (see the
// caching rule in CLAUDE.md).

export type HomeSnapshot = {
  /** Account value in dollars, at live prices. */
  equity: number;
  /** Change since the account opened as a decimal, e.g. 0.054 = +5.4%. */
  changePct: number;
  /** Daily account value, oldest to newest, for the sparkline. */
  points: number[];
  /** The day the account opened (ISO). */
  openedAt: string;
};

/**
 * Snapshot for the homepage. Returns null — and the panel hides — whenever
 * the portfolio can't be loaded, so a data outage degrades the page instead
 * of breaking it.
 */
export async function getHomeSnapshot(): Promise<HomeSnapshot | null> {
  const showcase = await getShowcase();
  if (!showcase || showcase.history.length < 2) return null;
  return {
    equity: showcase.equity,
    changePct: (showcase.equity - showcase.startingCash) / showcase.startingCash,
    points: showcase.history.map((p) => p.equity),
    openedAt: showcase.openedAt,
  };
}

/**
 * Turns the equity curve into an SVG polyline path, normalised into a
 * `width` x `height` box. Downsampled so the markup stays small.
 */
export function sparklinePoints(values: number[], width: number, height: number): string {
  const MAX = 80;
  const step = Math.max(1, Math.ceil(values.length / MAX));
  const sampled = values.filter((_, i) => i % step === 0);
  if (sampled[sampled.length - 1] !== values[values.length - 1]) {
    sampled.push(values[values.length - 1]);
  }

  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const span = max - min || 1;

  return sampled
    .map((v, i) => {
      const x = (i / (sampled.length - 1)) * width;
      // SVG y grows downward, so a high value sits near 0.
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
