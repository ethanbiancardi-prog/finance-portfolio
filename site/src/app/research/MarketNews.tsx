"use client";

// The Market News tab on /research: the newest headlines across the market,
// not tied to one ticker. Data: /api/research/market-news (Alpaca / Benzinga,
// 3-minute cache). Refreshes itself every 3 minutes while open.
//
// Filters run in the browser on the ~100 stories already loaded: by sector
// (a story counts for a sector if it's tagged with one of that sector's
// stocks on the research list), and earnings-call transcripts hidden by
// default since they're long documents, not news.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Chip, SectionHeader } from "@/components/ui";
import type { MarketNews as MarketNewsData, MarketNewsItem, NewsFeed } from "@/lib/marketNews";
import { RESEARCH_SECTOR_KEYS, RESEARCH_SECTORS, RESEARCH_UNIVERSE, type ResearchSectorKey } from "@/lib/researchUniverse";

const REFRESH_MS = 3 * 60_000;
const INDEX_FUNDS = new Set(["SPY", "QQQ", "DIA", "IWM"]);
const ON_LIST = new Set(RESEARCH_UNIVERSE);
const isTranscript = (n: MarketNewsItem) => /earnings call transcript/i.test(n.headline);

type Filter = "all" | "market" | ResearchSectorKey;

function timeAgo(iso: string, now: number) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export default function MarketNews({ onResearch }: { onResearch: (symbol: string) => void }) {
  const [feed, setFeed] = useState<NewsFeed>("research");
  const [data, setData] = useState<Partial<Record<NewsFeed, MarketNewsData>>>({});
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showTranscripts, setShowTranscripts] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback((f: NewsFeed) => {
    fetch(`/api/research/market-news?feed=${f}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "News fetch failed");
        setData((d) => ({ ...d, [f]: body as MarketNewsData }));
        setError("");
        setNow(Date.now());
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // Load the feed when it's picked, then every 3 minutes while it's shown.
  useEffect(() => {
    load(feed);
    const id = window.setInterval(() => load(feed), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [feed, load]);
  // Keep "5m ago" labels honest between refreshes.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const current = data[feed];
  const items = useMemo(() => current?.items ?? [], [current]);
  const transcripts = items.filter(isTranscript).length;
  const shown = useMemo(() => {
    const sectorSet = filter !== "all" && filter !== "market" ? new Set(RESEARCH_SECTORS[filter].tickers) : null;
    return items.filter((n) => {
      if (!showTranscripts && isTranscript(n)) return false;
      if (filter === "market") return n.symbols.some((s) => INDEX_FUNDS.has(s));
      if (sectorSet) return n.symbols.some((s) => sectorSet.has(s));
      return true;
    });
  }, [items, filter, showTranscripts]);

  const span =
    items.length > 1
      ? timeAgo(items[items.length - 1].publishedAt, now)
      : null;

  return (
    <Card as="section" className="mt-4">
      <SectionHeader
        label="market news"
        description="The newest headlines, refreshed every 3 minutes. Click a ticker to research that stock. Headlines are leads to read, not advice."
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-zinc-500">Feed:</span>
        <Chip active={feed === "research"} onClick={() => setFeed("research")} title="Stories about the ~210 stocks on this page, plus market-wide stories">
          Our stocks + market
        </Chip>
        <Chip active={feed === "all"} onClick={() => setFeed("all")} title="Everything, including small caps and press releases">
          Entire market
        </Chip>
        <span className="ml-auto text-[11px] text-zinc-500">
          {current
            ? `${items.length} stories from the last ${span ?? "few minutes"} · updated ${timeAgo(current.fetchedAt, now)} ago`
            : !error && "Loading…"}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
        <Chip active={filter === "market"} onClick={() => setFilter("market")} title="Stories tagged with an index fund (SPY, QQQ, DIA, IWM): the economy, the Fed, the whole market">
          Market-wide
        </Chip>
        {RESEARCH_SECTOR_KEYS.map((k) => (
          <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>
            {RESEARCH_SECTORS[k].label}
          </Chip>
        ))}
      </div>

      {error && <p className="mt-3 text-xs text-bad">{error}</p>}

      {current && (
        <>
          <ul className="mt-3 divide-y divide-border/60">
            {shown.map((n) => (
              <li key={n.id} className="flex gap-3 py-2.5">
                <span className="w-9 shrink-0 pt-0.5 text-right text-[10px] tabular-nums text-zinc-500">{timeAgo(n.publishedAt, now)}</span>
                <div className="min-w-0 flex-1">
                  <a href={n.url} target="_blank" rel="noreferrer" className="text-xs leading-5 text-foreground hover:text-accent">
                    {n.headline}
                  </a>
                  {n.summary && <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-zinc-500">{n.summary}</p>}
                  {n.symbols.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {n.symbols.slice(0, 8).map((s) =>
                        ON_LIST.has(s) ? (
                          <button
                            key={s}
                            onClick={() => onResearch(s)}
                            title={`Research ${s}`}
                            className="rounded-[var(--radius-sm)] border border-accent/40 px-1.5 text-[10px] tabular-nums text-accent hover:bg-accent/10"
                          >
                            {s}
                          </button>
                        ) : (
                          <span key={s} className="rounded-[var(--radius-sm)] border border-border px-1.5 text-[10px] tabular-nums text-zinc-500">
                            {s}
                          </span>
                        ),
                      )}
                      {n.symbols.length > 8 && <span className="text-[10px] text-zinc-500">+{n.symbols.length - 8}</span>}
                    </div>
                  )}
                </div>
                <span className="hidden shrink-0 text-[10px] caps text-zinc-500 sm:block">{n.source}</span>
              </li>
            ))}
          </ul>
          {shown.length === 0 && <p className="mt-3 text-xs text-zinc-500">No stories in this filter among the latest {items.length}.</p>}
          {transcripts > 0 && (
            <button onClick={() => setShowTranscripts((v) => !v)} className="mt-3 text-[11px] text-zinc-500 underline-offset-2 hover:text-accent hover:underline">
              {showTranscripts ? "Hide" : "Show"} {transcripts} earnings-call transcript{transcripts === 1 ? "" : "s"}
            </button>
          )}
          <p className="mt-2 text-[11px] text-zinc-500">Source: Benzinga via Alpaca&apos;s news API. Educational, not investment advice.</p>
        </>
      )}
    </Card>
  );
}
