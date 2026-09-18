"use client";

// "What does this company actually do?" — the first thing to read after
// typing a ticker. Loads on its own (no button) and is written from the
// Business section of the latest 10-K, so it reflects the company's own
// description rather than the model's memory. Keyed by ticker where it's
// rendered so a new search remounts it with fresh state.
import { useEffect, useState } from "react";
import { Card, SectionHeader } from "@/components/ui";

type Summary = {
  summary: string;
  segments: string[];
  filingDate: string;
  profile: {
    sicDescription: string | null;
    headquarters: string | null;
    stateOfIncorporation: string | null;
    exchange: string | null;
  };
};

export function BusinessSummary({ ticker, name }: { ticker: string; name: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/research/summary?ticker=${encodeURIComponent(ticker)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Summary failed");
        return json;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Summary failed");
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const facts = data
    ? [data.profile.sicDescription, data.profile.headquarters, data.profile.exchange].filter(Boolean)
    : [];

  return (
    <Card as="section" className="mt-4">
      <SectionHeader label={`about ${name}`} />

      {!data && !error && <p className="mt-3 text-xs text-zinc-500">Reading the latest 10-K...</p>}
      {error && <p className="mt-3 text-xs text-zinc-500">Summary unavailable: {error}</p>}

      {data && (
        <>
          {facts.length > 0 && (
            <p className="mt-2 text-[10px] caps text-zinc-500">{facts.join(" · ")}</p>
          )}
          <p className="mt-3 max-w-3xl text-xs leading-6 text-foreground">{data.summary}</p>
          {data.segments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.segments.map((s) => (
                <span key={s} className="border border-border px-2 py-0.5 text-[11px] caps text-zinc-500">
                  {s}
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 text-[10px] caps text-zinc-600">
            From the Business section of the 10-K filed {data.filingDate}. AI-written summary.
          </p>
        </>
      )}
    </Card>
  );
}
