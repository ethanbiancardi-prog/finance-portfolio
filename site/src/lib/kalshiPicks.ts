// Daily picks for the Calibration Tracker: a handful of live Kalshi markets
// worth forecasting today. Chosen so practice is quick and varied:
//   - settles within 1 to 30 days, so predictions get scored soon;
//   - priced between 15% and 85%, where there's a real question to answer
//     (a 97% market teaches almost nothing);
//   - busiest first by the last 24 hours' volume, so the price reflects a
//     real crowd;
//   - at most one per series and two per category (Sports, Economics,
//     Politics...), so the list isn't six tennis matches.
// Public market data only; cached in Redis for 6 hours.

import { kalshiFetch, toMarket, type KalshiMarket, type RawMarket } from "./kalshi";
import { getRedis, kvConfigured } from "./kv";

export type KalshiPick = KalshiMarket & { volume24h: number; daysLeft: number; category: string };

const CACHE_KEY = "kalshi:picks:v2";
const TTL_SECONDS = 6 * 60 * 60;
const MAX_PAGES = 8;
const PICKS = 10; // the page shows the first few you haven't logged yet
const PER_CATEGORY = 2;

async function computePicks(): Promise<KalshiPick[]> {
  const now = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    status: "open",
    mve_filter: "exclude", // no multi-leg parlays
    limit: "1000",
    min_close_ts: String(now + 86_400),
    max_close_ts: String(now + 30 * 86_400),
  });
  const raw: RawMarket[] = [];
  let cursor = "";
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await kalshiFetch<{ markets?: RawMarket[]; cursor?: string }>(
      `/markets?${params}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    raw.push(...(body.markets ?? []));
    cursor = body.cursor ?? "";
    if (!cursor) break;
  }

  // Each series' category, for spreading the picks across topics.
  const { series = [] } = await kalshiFetch<{ series?: { ticker: string; category?: string }[] }>("/series");
  const categoryOf = new Map(series.map((s) => [s.ticker, s.category || "Other"]));

  const candidates = raw
    .map((r) => ({ m: toMarket(r), volume24h: Number(r.volume_24h_fp) || 0 }))
    .filter(({ m, volume24h }) => m.probability !== null && m.probability >= 0.15 && m.probability <= 0.85 && volume24h >= 500)
    .sort((a, b) => b.volume24h - a.volume24h);

  const seenSeries = new Set<string>();
  const perCategory = new Map<string, number>();
  const chosen: { m: KalshiMarket; volume24h: number; category: string }[] = [];
  for (const { m, volume24h } of candidates) {
    const s = m.eventTicker.split("-")[0];
    const category = categoryOf.get(s) ?? "Other";
    if (seenSeries.has(s) || (perCategory.get(category) ?? 0) >= PER_CATEGORY) continue;
    seenSeries.add(s);
    perCategory.set(category, (perCategory.get(category) ?? 0) + 1);
    chosen.push({ m, volume24h, category });
    if (chosen.length >= PICKS) break;
  }

  // A market's own title can be bare ("Lorenzo Musetti wins"); prefix the
  // event's title ("Paris Masters: Musetti vs Rune") unless it's already a
  // full question.
  return Promise.all(
    chosen.map(async ({ m, volume24h, category }) => {
      let question = m.question;
      if (!question.includes("?")) {
        const ev = await kalshiFetch<{ event?: { title?: string } }>(`/events/${encodeURIComponent(m.eventTicker)}`).catch(() => null);
        const title = ev?.event?.title?.trim();
        if (title && !question.toLowerCase().includes(title.toLowerCase())) question = `${title}: ${question}`;
      }
      const daysLeft = m.closeTime ? Math.max(1, Math.round((new Date(m.closeTime).getTime() / 1000 - now) / 86_400)) : 0;
      return { ...m, question, volume24h: Math.round(volume24h), daysLeft, category };
    }),
  );
}

export async function getDailyPicks(): Promise<KalshiPick[]> {
  if (kvConfigured()) {
    const hit = await getRedis().get<KalshiPick[]>(CACHE_KEY).catch(() => null);
    if (hit) return hit;
  }
  const picks = await computePicks();
  if (kvConfigured()) await getRedis().set(CACHE_KEY, picks, { ex: TTL_SECONDS }).catch(() => {});
  return picks;
}
