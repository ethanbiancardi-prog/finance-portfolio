"use client";

// The Green Score section on /sustainability: every research-list company
// graded 0-100 against its own industry, with a scorecard showing how each
// of the four pillars adds up. Data: public/data/green.json (built offline by
// scripts/green/build-green.ts; types and labels in lib/greenScore.ts).
import { useEffect, useMemo, useState } from "react";
import { Card, ChartLoading, Chip, SectionHeader } from "@/components/ui";
import { PILLARS, scoreColor, tidyName, type GreenCompany, type GreenData } from "@/lib/greenScore";

export default function GreenScore() {
  const [data, setData] = useState<GreenData | null>(null);
  const [error, setError] = useState("");
  const [industry, setIndustry] = useState("utilities");
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/data/green.json")
      .then((res) => {
        if (!res.ok) throw new Error("The Green Score data couldn't load.");
        return res.json();
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const industries = useMemo(
    () => (data ? Object.entries(data.industries).filter(([k]) => k !== "other").sort((a, b) => a[1].label.localeCompare(b[1].label)) : []),
    [data],
  );
  const rows = useMemo(
    () => (data?.companies ?? []).filter((c) => c.industry === industry).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)),
    [data, industry],
  );

  // Typing a ticker jumps to its industry and opens its scorecard.
  function find(q: string) {
    setQuery(q);
    const t = q.trim().toUpperCase();
    const c = data?.companies.find((x) => x.ticker === t);
    if (c) {
      setIndustry(c.industry);
      setOpen(c.ticker);
    }
  }

  if (error) return <p className="mt-4 text-xs text-bad">{error}</p>;
  if (!data) return <ChartLoading className="mt-4 h-96" />;
  const info = data.industries[industry];

  return (
    <Card as="section" className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          label={`${info.label}: greenest to least green`}
          description={`${rows.length} companies, each compared only with this industry. 100 = cleanest in ${info.label}, 50 = the middle. Click one for its scorecard.`}
        />
        <label className="flex items-center gap-2 text-[11px] text-zinc-500">
          Find a ticker
          <input
            value={query}
            onChange={(e) => find(e.target.value)}
            placeholder="e.g. DUK"
            maxLength={6}
            className="field-input w-20 border-b border-border bg-transparent px-1 py-0.5 text-xs uppercase text-foreground outline-none focus:border-accent"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {industries.map(([k, v]) => (
          <Chip key={k} active={industry === k} onClick={() => { setIndustry(k); setOpen(null); }}>
            {v.label}
          </Chip>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-5 text-zinc-500">
        Counts in {info.label}:{" "}
        {PILLARS.map((p) => (
          <span key={p.key} className={info.pillarsCounted.includes(p.key) ? "text-foreground" : "line-through opacity-60"}>
            {p.label} {data.weights[p.key]}%
            {p.key !== "target" ? " · " : ""}
          </span>
        ))}
        {info.pillarsCounted.length < PILLARS.length && " (crossed out: every company here is the same on it, or too few have data, so it can't separate them)"}
      </p>

      <ol className="mt-3 divide-y divide-border">
        {rows.map((c) => (
          <li key={c.ticker}>
            <button onClick={() => setOpen(open === c.ticker ? null : c.ticker)} aria-expanded={open === c.ticker} className="w-full py-2 text-left">
              <div className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">{c.rank ?? "–"}</span>
                <span className="w-14 shrink-0 text-xs font-semibold tabular-nums text-foreground">{c.ticker}</span>
                <span className="hidden min-w-0 flex-1 truncate text-xs text-zinc-500 sm:block">{tidyName(c.name, c.ticker)}</span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-border/60 sm:max-w-[40%]">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${c.score ?? 0}%`, background: `linear-gradient(90deg, var(--eco-cyan), ${scoreColor(c.score)})` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-sm tabular-nums" style={{ color: scoreColor(c.score) }}>
                  {c.score ?? "N/A"}
                </span>
              </div>
            </button>
            {open === c.ticker && <Scorecard c={c} data={data} />}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Scorecard({ c, data }: { c: GreenCompany; data: GreenData }) {
  const label = data.industries[c.industry].label;
  return (
    <div className="mb-3 rounded-[var(--radius-sm)] border border-border p-3">
      <p className="text-xs text-foreground">
        <span className="font-semibold">{tidyName(c.name, c.ticker)}</span>:{" "}
        {c.score == null ? "not enough data to score." : `${c.score} of 100, ${ordinal(c.rank!)} greenest of ${c.of} in ${label}.`}
      </p>
      <div className="mt-3 space-y-3">
        {PILLARS.map((p) => {
          const pl = c.pillars[p.key];
          return (
            <div key={p.key}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] text-foreground">
                  {p.label} <span className="text-zinc-500">· {data.weights[p.key]}%</span>
                </p>
                <p className="text-[11px] tabular-nums" style={{ color: pl.counts ? scoreColor(pl.score) : "var(--chart-muted)" }}>
                  {pl.counts ? `${pl.score} / 100` : "doesn't count here"}
                </p>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-border/60">
                {pl.counts && <div className="h-1.5 rounded-full" style={{ width: `${pl.score}%`, background: scoreColor(pl.score) }} />}
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">{pl.note}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
