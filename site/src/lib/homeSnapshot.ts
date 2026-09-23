import { alpaca } from "./alpaca";
import { getRedis, kvConfigured } from "./kv";

// The one live number on the homepage: what the paper account is actually
// worth, and how it has moved over three months. Everything here is server
// side and cached — a visitor loading the homepage never triggers an Alpaca
// call of their own (see the caching rule in CLAUDE.md).

export type HomeSnapshot = {
  /** Account equity in dollars, latest close. */
  equity: number;
  /** Change over the window as a decimal, e.g. 0.124 = +12.4%. */
  changePct: number;
  /** Equity curve, oldest to newest, for the sparkline. */
  points: number[];
  /** When this snapshot was built (ISO). */
  asOf: string;
};

const CACHE_KEY = "home:snapshot";
const TTL_SECONDS = 60 * 15;
const PERIOD = "3M";

async function fetchSnapshot(): Promise<HomeSnapshot | null> {
  const history = await alpaca(`/account/portfolio/history?period=${PERIOD}&timeframe=1D`);

  // Alpaca pads the series with nulls on non-trading days; drop them and any
  // zero rows from before the account was funded.
  const equities: number[] = (history.equity ?? []).filter(
    (v: unknown): v is number => typeof v === "number" && v > 0,
  );
  if (equities.length < 2) return null;

  const first = equities[0];
  const last = equities[equities.length - 1];

  return {
    equity: last,
    changePct: (last - first) / first,
    points: equities,
    asOf: new Date().toISOString(),
  };
}

/**
 * Cached snapshot for the homepage. Returns null — and the panel hides —
 * whenever the keys are missing or Alpaca is unreachable, so a data outage
 * degrades the page instead of breaking it.
 */
export async function getHomeSnapshot(): Promise<HomeSnapshot | null> {
  if (!process.env.APCA_API_KEY_ID) return null;

  if (kvConfigured()) {
    try {
      const cached = await getRedis().get<HomeSnapshot>(CACHE_KEY);
      if (cached) return cached;
    } catch {
      // Cache read failed — fall through and fetch it live this once.
    }
  }

  try {
    const snapshot = await fetchSnapshot();
    if (snapshot && kvConfigured()) {
      await getRedis().set(CACHE_KEY, snapshot, { ex: TTL_SECONDS });
    }
    return snapshot;
  } catch {
    return null;
  }
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
