"use client";

// "What does this company actually do?" — the first thing to read after
// typing a ticker. Loads on its own (no button) and is written from the
// Business section of the latest 10-K, so it reflects the company's own
// description rather than the model's memory. Keyed by ticker where it's
// rendered so a new search remounts it with fresh state.
import { useEffect, useState } from "react";
import { Section } from "@/components/ui";
import { JargonText, SimpleText } from "./SimpleMode";

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

  // First sentence of the summary is the header line.
  const firstSentence = data ? data.summary.split(/(?<=\.)\s/)[0] : undefined;

  return (
    <Section
      id="about"
      label={`About ${name}`}
      status={error ? "error" : data ? "ready" : "loading"}
      summary={error ? `Summary unavailable: ${error}` : firstSentence ? <JargonText text={firstSentence} /> : undefined}
      defaultOpen
      hideSummaryWhenOpen
    >
      {!data && !error && <p className="text-xs text-zinc-500">Reading the latest 10-K...</p>}

      {data && (
        <>
          {facts.length > 0 && (
            <p className="text-[10px] caps text-zinc-500">{facts.join(" · ")}</p>
          )}
          <SimpleText text={data.summary} context={`Company overview of ${name}`} className="mt-3 block max-w-3xl text-xs leading-6 text-foreground" />
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
    </Section>
  );
}
