"use client";

import { useMemo, useState } from "react";
import { Callout, Card, Field, PageShell, Tabs } from "@/components/ui";
import { NOTES, type Track } from "./content";

type Filter = "all" | Track;

const TRACK_COPY: Record<Track, { label: string; blurb: string }> = {
  tools: {
    label: "Tool guides",
    blurb:
      "One guide per tool on this site: what it does, the finance behind it, how to read what it puts on screen, and a walkthrough you can follow in the tool itself.",
  },
  fundamentals: {
    label: "Finance fundamentals",
    blurb:
      "The concepts, ordered so each one only assumes what came before it. Start at the top if you are new; they get more advanced as you go down.",
  },
};

// Search matches title, summary, tags and glossary terms, so looking up a word
// someone half-remembers ("terminal value", "what's a margin") lands somewhere
// rather than returning nothing.
function haystack(note: (typeof NOTES)[number]) {
  const glossary = note.detail?.glossary ?? note.guide?.glossary ?? [];
  return [note.title, note.body, note.label, ...note.tags, ...glossary.map((g) => g.term)]
    .join(" ")
    .toLowerCase();
}

export default function Education() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = NOTES.filter((n) => {
      if (filter !== "all" && n.track !== filter) return false;
      return q === "" || haystack(n).includes(q);
    });
    const byTrack = (track: Track) =>
      matches.filter((n) => n.track === track).sort((a, b) => a.level - b.level);
    return { tools: byTrack("tools"), fundamentals: byTrack("fundamentals"), total: matches.length };
  }, [filter, query]);

  return (
    <PageShell
      eyebrow="education"
      title="Education"
      description="Two tracks: guides to the tools on this site, and the finance concepts underneath them. Every entry is plain English first, then the formula, then a worked example with real numbers."
    >
      <Callout label="new here?" className="mt-4">
        Start with <strong className="text-foreground">Reading an Income Statement</strong> in
        Fundamentals, then open the{" "}
        <strong className="text-foreground">DCF Builder</strong> guide to see a concept turn into a
        working tool. Nothing here assumes you have taken a finance class, and every entry says what
        to do if it is not clicking.
      </Callout>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Tabs
          tabs={[
            { key: "all", label: "All" },
            { key: "tools", label: TRACK_COPY.tools.label },
            { key: "fundamentals", label: TRACK_COPY.fundamentals.label },
          ]}
          active={filter}
          onChange={setFilter}
        />
        <Field
          label="Search"
          type="search"
          placeholder="margin, terminal value, risk..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          wrapperClassName="sm:w-60"
        />
      </div>

      {shown.total === 0 && (
        <p className="mt-6 text-xs leading-5 text-zinc-500">
          Nothing matches {`"${query}"`}. Try a plainer word — {`"profit"`} rather than{" "}
          {`"EBITDA margin compression"`} — or clear the search to see all{" "}
          {NOTES.length} entries.
        </p>
      )}

      {(["tools", "fundamentals"] as const).map((track) =>
        shown[track].length === 0 ? null : (
          <section key={track} className="mt-6">
            <h2 className="section-title text-foreground">{TRACK_COPY[track].label}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">{TRACK_COPY[track].blurb}</p>
            <div className="mt-3 space-y-2">
              {shown[track].map((note) => {
                const full = Boolean(note.detail || note.guide);
                return (
                  <Card
                    key={note.slug}
                    href={full ? `/education/${note.slug}` : note.href}
                    interactive
                  >
                    <h3 className="display text-[18px] text-foreground">{note.title}</h3>
                    <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-400">{note.body}</p>
                    <p className="mt-3 inline-block rounded-[var(--radius-sm)] border border-border bg-background px-2 py-1 font-mono text-[11px] text-zinc-400">
                      {note.formula}
                    </p>
                    <p className="mt-3 text-[11px] caps text-accent">
                      {full ? "Read the full note →" : note.cta}
                    </p>
                  </Card>
                );
              })}
            </div>
          </section>
        ),
      )}
    </PageShell>
  );
}
