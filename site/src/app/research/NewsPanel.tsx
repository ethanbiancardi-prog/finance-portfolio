"use client";

import { useEffect, useState } from "react";
import { Card, SectionHeader } from "@/components/ui";

type NewsItem = {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
};

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export function NewsPanel({ ticker }: { ticker: string }) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError("");
    fetch(`/api/research/news?symbol=${encodeURIComponent(ticker)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "News fetch failed");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items ?? []);
        setSources(data.sources ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "News fetch failed");
        setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return (
    <Card as="section" className="mt-4">
      <SectionHeader
        label={`news: ${ticker}`}
        description={
          sources.length ? `Merged from ${sources.join(" + ")}, newest first, duplicates removed.` : "Yahoo Finance RSS + Alpaca (Benzinga)."
        }
      />

      {items === null && (
        <p className="mt-3 text-xs text-zinc-500">
          <span className="cursor-blink">▌</span> fetching headlines
        </p>
      )}
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
      {items && items.length === 0 && !error && <p className="mt-3 text-xs text-zinc-500">-- no recent headlines</p>}

      {items && items.length > 0 && (
        <ul className="mt-3 divide-y divide-border/60">
          {items.map((n) => (
            <li key={n.id} className="py-2">
              <a
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className="group flex items-baseline gap-3"
              >
                <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-zinc-600">{timeAgo(n.publishedAt)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-5 text-foreground group-hover:text-accent">{n.headline}</span>
                  {n.summary && (
                    <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-zinc-500">{n.summary}</span>
                  )}
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-zinc-600">{n.source}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
