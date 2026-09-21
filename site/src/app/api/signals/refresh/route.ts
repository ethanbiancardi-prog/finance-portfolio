import { NextResponse } from "next/server";
import { refreshAiSignals } from "@/lib/signals/aiSignals";
import { refreshPoliticalSignals } from "@/lib/signals/political";

// Manual refresh, secret-gated (same secret as the crons) — for seeding
// and testing. ?category=political|legislation|geopolitics, default all.
// The scheduled refresh lives in /api/cron/daily.
export const maxDuration = 300;

export async function POST(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const category = new URL(request.url).searchParams.get("category");
  const jobs: Record<string, () => Promise<{ generatedAt: string; stats: unknown; items: { ticker: string }[] }>> = {
    political: () => refreshPoliticalSignals(),
    legislation: () => refreshAiSignals("legislation"),
    geopolitics: () => refreshAiSignals("geopolitics"),
  };
  const keys = category ? [category] : Object.keys(jobs);
  if (keys.some((k) => !jobs[k])) return NextResponse.json({ error: "unknown category" }, { status: 400 });

  const results = await Promise.allSettled(keys.map((k) => jobs[k]()));
  return NextResponse.json(
    Object.fromEntries(
      keys.map((k, i) => {
        const r = results[i];
        return [
          k,
          r.status === "fulfilled"
            ? { ok: true, generatedAt: r.value.generatedAt, stats: r.value.stats, tickers: r.value.items.map((it) => it.ticker) }
            : { ok: false, error: r.reason instanceof Error ? r.reason.message : String(r.reason) },
        ];
      }),
    ),
  );
}
