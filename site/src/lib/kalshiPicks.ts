// Markets to forecast, for the Calibration Tracker. Two lists from one
// recipe, both public Kalshi data cached in Redis:
//
// Today's picks: ~10 markets, settling within 1 to 30 days, at most one per
// series and two per category, so the short list is varied. Cached 6 hours.
//
// Rapid mode's pool: ~50 markets that settle sooner (6 hours to 14 days),
// so practice gets scored within days; up to two per series (different
// events) and ten per category. Cached 3 hours.
//
// Both keep only markets:
//   - priced between 15% and 85%, where there's a real question to answer
//     (a 97% market teaches almost nothing);
//   - actually trading, busiest first by the last 24 hours' volume, so the
//     price reflects a real crowd.

import { kalshiFetch, toMarket, type KalshiMarket, type RawMarket } from "./kalshi";
import { getRedis, kvConfigured } from "./kv";

export type KalshiPick = KalshiMarket & { volume24h: number; daysLeft: number; category: string };

type Recipe = {
  cacheKey: string;
  ttlSeconds: number;
  minHours: number; // expected to settle no sooner than this
  maxDays: number; // ...and no later than this
  max: number;
  perSeries: number;
  perCategory: number;
  minVolume24h: number;
};

const TODAY: Recipe = { cacheKey: "kalshi:picks:v4", ttlSeconds: 6 * 3600, minHours: 24, maxDays: 30, max: 10, perSeries: 1, perCategory: 2, minVolume24h: 500 };
const RAPID: Recipe = { cacheKey: "kalshi:rapid:v3", ttlSeconds: 3 * 3600, minHours: 6, maxDays: 14, max: 50, perSeries: 2, perCategory: 10, minVolume24h: 200 };
// Kalshi lists 40,000+ open markets, furthest-closing first, so one long
// paginated query never reaches the near-term ones. Instead the close-time
// window is cut into 2-day slices, each read for a few pages, in parallel.
const SLICE_DAYS = 2;
const PAGES_PER_SLICE = 3;
const CONCURRENCY = 6;

async function compute(r: Recipe): Promise<KalshiPick[]> {
  const now = Math.floor(Date.now() / 1000);
  // Close times run late (see settleTime in lib/kalshi.ts), so the close
  // window reaches 3 weeks past the settle window; settlement is filtered
  // on below.
  const from = now + r.minHours * 3600;
  const to = now + (r.maxDays + 21) * 86_400;
  const slices: [number, number][] = [];
  for (let t = from; t < to; t += SLICE_DAYS * 86_400) slices.push([t, Math.min(to, t + SLICE_DAYS * 86_400)]);

  const raw: RawMarket[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < slices.length) {
        const [lo, hi] = slices[next++];
        let cursor = "";
        for (let page = 0; page < PAGES_PER_SLICE; page++) {
          const params = new URLSearchParams({
            status: "open",
            mve_filter: "exclude", // no multi-leg parlays
            limit: "1000",
            min_close_ts: String(lo),
            max_close_ts: String(hi),
          });
          if (cursor) params.set("cursor", cursor);
          const body = await kalshiFetch<{ markets?: RawMarket[]; cursor?: string }>(`/markets?${params}`).catch(() => ({ markets: [], cursor: "" }));
          raw.push(...(body.markets ?? []));
          cursor = body.cursor ?? "";
          if (!cursor) break;
        }
      }
    }),
  );

  // Each series' category, for spreading the picks across topics.
  const { series = [] } = await kalshiFetch<{ series?: { ticker: string; category?: string }[] }>("/series");
  const categoryOf = new Map(series.map((s) => [s.ticker, s.category || "Other"]));

  const candidates = raw
    .map((x) => ({ m: toMarket(x), volume24h: Number(x.volume_24h_fp) || 0 }))
    .filter(({ m, volume24h }) => {
      const settle = m.settleTime ? new Date(m.settleTime).getTime() / 1000 : Infinity;
      return (
        m.probability !== null && m.probability >= 0.15 && m.probability <= 0.85 && volume24h >= r.minVolume24h &&
        settle >= now + r.minHours * 3600 && settle <= now + r.maxDays * 86_400
      );
    })
    .sort((a, b) => b.volume24h - a.volume24h);

  const perSeries = new Map<string, number>();
  const perCategory = new Map<string, number>();
  const events = new Set<string>();
  const chosen: { m: KalshiMarket; volume24h: number; category: string }[] = [];
  for (const { m, volume24h } of candidates) {
    const s = m.eventTicker.split("-")[0];
    const category = categoryOf.get(s) ?? "Other";
    // One market per event: "Musetti wins" and "Fery wins" are one question.
    if (events.has(m.eventTicker) || (perSeries.get(s) ?? 0) >= r.perSeries || (perCategory.get(category) ?? 0) >= r.perCategory) continue;
    events.add(m.eventTicker);
    perSeries.set(s, (perSeries.get(s) ?? 0) + 1);
    perCategory.set(category, (perCategory.get(category) ?? 0) + 1);
    chosen.push({ m, volume24h, category });
    if (chosen.length >= r.max) break;
  }

  // A market's own title can leave out the context ("Lorenzo Musetti wins",
  // "maximum temperature 73-74°" without the city); prefix the event's
  // title ("Fery vs Musetti", "Highest temperature in Austin") unless the
  // question already contains it.
  const out: KalshiPick[] = [];
  for (let i = 0; i < chosen.length; i += 8) {
    out.push(
      ...(await Promise.all(
        chosen.slice(i, i + 8).map(async ({ m, volume24h, category }) => {
          let question = m.question;
          const ev = await kalshiFetch<{ event?: { title?: string } }>(`/events/${encodeURIComponent(m.eventTicker)}`).catch(() => null);
          const title = ev?.event?.title?.trim().replace(/\?$/, "");
          if (title && !question.toLowerCase().includes(title.toLowerCase())) question = `${title}: ${question}`;
          const daysLeft = m.settleTime ? Math.max(0, (new Date(m.settleTime).getTime() / 1000 - now) / 86_400) : 0;
          return { ...m, question, volume24h: Math.round(volume24h), daysLeft: Math.round(daysLeft * 10) / 10, category };
        }),
      )),
    );
  }
  return out;
}

async function cached(r: Recipe): Promise<KalshiPick[]> {
  if (kvConfigured()) {
    const hit = await getRedis().get<KalshiPick[]>(r.cacheKey).catch(() => null);
    if (hit) return hit;
  }
  const picks = await compute(r);
  if (kvConfigured()) await getRedis().set(r.cacheKey, picks, { ex: r.ttlSeconds }).catch(() => {});
  return picks;
}

export const getDailyPicks = () => cached(TODAY);
// Rapid mode's order: soonest-settling first within each category, and the
// categories taken in turn, so a session alternates topics instead of
// opening with ten tennis matches, and its results still come back fast.
export async function getRapidPool(): Promise<KalshiPick[]> {
  const byCategory = new Map<string, KalshiPick[]>();
  for (const p of (await cached(RAPID)).slice().sort((a, b) => a.daysLeft - b.daysLeft)) {
    byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p]);
  }
  const queues = [...byCategory.values()];
  const out: KalshiPick[] = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift()!);
  return out;
}
