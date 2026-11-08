"use client";

// The News Speed page: how fast 8-K news gets into stock prices.
// Data: public/data/diffusion.json, built offline by scripts/diffusion/
// (types and word helpers in lib/diffusion.ts). Nothing is fetched from SEC
// or Alpaca when the page loads.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  Callout,
  Card,
  ChartLoading,
  Chip,
  SectionHeader,
  StatCard,
  tableCellClass,
  tableHeadCellClass,
  tableHeadRowClass,
  tableRowClass,
} from "@/components/ui";
import { checkpointWords, tWords, type DiffusionData, type DiffusionGroup } from "@/lib/diffusion";
import type { DiffusionLine } from "./DiffusionChart";

const DiffusionChart = dynamic(() => import("./DiffusionChart"), { ssr: false, loading: () => <ChartLoading className="h-72 sm:h-96" /> });

type Timing = DiffusionGroup["timing"];
type Size = DiffusionGroup["size"];

const pct = (v: number | null | undefined, d = 2) => (v == null ? "N/A" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`);
const signColor = (v: number | null | undefined) => (v == null ? undefined : `var(--status-${v >= 0 ? "good" : "bad"})`);

const DIRECTIONS = [
  { key: "up", name: "Good news (rose on day 1)", color: "var(--status-good)" },
  { key: "down", name: "Bad news (fell on day 1)", color: "var(--status-bad)" },
  { key: "flat", name: "No clear reaction", color: "var(--chart-muted)", dashed: true },
] as const;

export default function Diffusion() {
  const [data, setData] = useState<DiffusionData | null>(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("earnings");
  const [timing, setTiming] = useState<Timing>("all");
  const [size, setSize] = useState<Size>("all");

  useEffect(() => {
    fetch("/data/diffusion.json")
      .then((res) => {
        if (!res.ok) throw new Error("The study's data couldn't load.");
        return res.json();
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const find = useMemo(
    () => (cat: string, direction: string, t: Timing, s: Size) =>
      data?.groups.find((g) => g.category === cat && g.direction === direction && g.timing === t && g.size === s) ?? null,
    [data],
  );

  if (error) return <p className="mt-4 text-xs text-bad">{error}</p>;
  if (!data) return <ChartLoading className="mt-4 h-96" />;

  const cat = data.categories.find((c) => c.key === category)!;
  const idx = (k: string) => data.checkpoints.findIndex((c) => c.key === k);
  const lines: DiffusionLine[] = DIRECTIONS.flatMap((d) => {
    const g = find(category, d.key, timing, size);
    return g ? [{ key: d.key, name: `${d.name}, ${g.n.toLocaleString()} events`, color: d.color, dashed: "dashed" in d, values: g.path }] : [];
  });
  const up = find(category, "up", timing, size);
  const down = find(category, "down", timing, size);

  // The plain-English summary is about earnings, the clearest case.
  const eUp = find("earnings", "up", "all", "all");
  const eDown = find("earnings", "down", "all", "all");
  const eDuring = find("earnings", "all", "intraday", "all")?.n ?? 0;
  const eOutside = find("earnings", "all", "overnight", "all")?.n ?? 0;
  // Share of the day-1 move already there at a checkpoint, good and bad news averaged.
  const shareBy = (k: string) => {
    if (!eUp || !eDown) return null;
    const one = (g: DiffusionGroup) => (g.path[idx(k)] ?? 0) / (g.path[idx("d1")] || 1);
    return Math.round(((one(eUp) + one(eDown)) / 2) * 100);
  };

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard card size="lg" label="8-K filings studied" value={data.events.toLocaleString()} hint={<span className="text-zinc-500">{data.companies} companies</span>} />
        <StatCard card size="lg" label="Period" value={`${data.period.from.slice(0, 4)}–${data.period.to.slice(0, 4)}`} hint={<span className="text-zinc-500">to {data.period.to}</span>} />
        <StatCard card size="lg" label="Earnings releases" value={(data.categories.find((c) => c.key === "earnings")?.events ?? 0).toLocaleString()} hint={<span className="text-zinc-500">item 2.02</span>} />
        <StatCard card size="lg" label="Timed to" value="the minute" hint={<span className="text-zinc-500">then daily for 60 days</span>} />
      </div>

      <Callout label="what we found" className="mt-4">
        <p>
          <strong className="text-foreground">The question:</strong> when a company announces news, how fast does its stock price react?
          If prices react slowly, a quick investor could profit after the headline. If they react instantly, there&apos;s nothing left to catch.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>
            <strong className="text-foreground">Most earnings come out while the market is closed:</strong>{" "}
            {eOutside.toLocaleString()} of {(eOutside + eDuring).toLocaleString()} here, usually before the open or after the close.
          </li>
          <li>
            <strong className="text-foreground">The price jumps the moment trading opens:</strong> about {shareBy("1m")}% of the first
            day&apos;s move happens in the first minute of trading, and about {shareBy("1h")}% within an hour.
          </li>
          <li>
            <strong className="text-foreground">After the first day, there&apos;s almost nothing left:</strong> over the next 60 days the
            average stock moved only another {pct(eUp?.drift60?.mean, 1)} after good news and {pct(eDown?.drift60?.mean, 1)} after bad news,
            small enough to be luck.
          </li>
        </ul>
        <p className="mt-2">
          <strong className="text-foreground">Bottom line:</strong> for big US companies, earnings news is priced in almost instantly.
          By the time most people read the headline, it&apos;s already in the price.
        </p>
      </Callout>

      <Card as="section" className="mt-4">
        <SectionHeader
          label={`${cat.label}: the average move`}
          description="Each line is the average stock's return MINUS the market's (SPY), measured from the last price before the news could trade. Before 'News' shows any run-up; after it, how fast the move happened and whether it kept going. The axis is checkpoints, not even time: minutes on the left, weeks on the right."
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.categories.map((c) => (
            <Chip key={c.key} active={category === c.key} onClick={() => setCategory(c.key)} title={c.what}>
              {c.label}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-zinc-500">When filed:</span>
          {(["all", "intraday", "overnight"] as const).map((t) => (
            <Chip key={t} active={timing === t} onClick={() => { setTiming(t); if (t !== "all") setSize("all"); }}>
              {t === "all" ? "Any time" : t === "intraday" ? "During market hours" : "Outside market hours"}
            </Chip>
          ))}
          <span className="ml-2 text-[11px] text-zinc-500">Company size:</span>
          {(["all", "large", "small"] as const).map((s) => (
            <Chip key={s} active={size === s} onClick={() => { setSize(s); if (s !== "all") setTiming("all"); }} title="By revenue: biggest third vs smallest third of the ~210 companies (all large caps)">
              {s === "all" ? "All" : s === "large" ? "Biggest third" : "Smallest third"}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">{cat.what}.</p>

        <p className="mt-3 rounded-[var(--radius-sm)] border border-border p-2 text-[11px] leading-5 text-zinc-500">
          <strong className="text-foreground">How to read this chart:</strong> green is stocks that rose on the news, red is stocks that
          fell. Time runs left to right, from minutes after the news to weeks after. A line that jumps right after &quot;News&quot; and then
          goes flat means the news was priced in fast. A line that keeps climbing to the right would mean the market was slow.
        </p>
        <div className="mt-3">
          {lines.length ? <DiffusionChart checkpoints={data.checkpoints} lines={lines} /> : <p className="py-16 text-center text-xs text-zinc-500">Too few events in this combination to show.</p>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          {lines.map((l) => (
            <span key={l.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: l.color }} />
              {l.name}
            </span>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            { g: up, title: "After good news" },
            { g: down, title: "After bad news" },
          ].map(({ g, title }) =>
            g ? (
              <div key={title} className="rounded-[var(--radius-sm)] border border-border p-3">
                <p className="text-[11px] caps text-zinc-500">{title}</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <StatCard label="5 minutes in" value={<span style={{ color: signColor(g.path[idx("5m")]) }}>{pct(g.path[idx("5m")])}</span>} />
                  <StatCard label="Day 1 close" value={<span style={{ color: signColor(g.path[idx("d1")]) }}>{pct(g.path[idx("d1")])}</span>} />
                  <StatCard label="60 days" value={<span style={{ color: signColor(g.path[idx("d60")]) }}>{pct(g.path[idx("d60")])}</span>} />
                </div>
                <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                  Half of the 60-day move was there by <span className="text-foreground">{checkpointWords(g.halfLife)}</span>.{" "}
                  {g.drift60 && (
                    <>
                      After day 1 it moved another <span style={{ color: signColor(g.drift60.mean) }}>{pct(g.drift60.mean)}</span> by day 60 (t ={" "}
                      {g.drift60.t.toFixed(1)}: {tWords(g.drift60.t)}).
                    </>
                  )}
                </p>
              </div>
            ) : null,
          )}
        </div>
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader
          label="every kind of news, side by side"
          description="Any filing time, all company sizes. 'Drift' is the average move from day 1's close to day 60: positive after good news (or negative after bad) means the market was still catching up."
        />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className={tableHeadCellClass}>News</th>
                <th className={`${tableHeadCellClass} text-right`}>Events</th>
                <th className={`${tableHeadCellClass} text-right`}>Good: day 1</th>
                <th className={`${tableHeadCellClass} text-right`}>Good: drift</th>
                <th className={`${tableHeadCellClass} text-right`}>Bad: day 1</th>
                <th className={`${tableHeadCellClass} text-right`}>Bad: drift</th>
                <th className={tableHeadCellClass}>Half-life (good / bad)</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((c) => {
                const u = find(c.key, "up", "all", "all");
                const d = find(c.key, "down", "all", "all");
                return (
                  <tr key={c.key} className={tableRowClass}>
                    <td className={tableCellClass}>
                      <button className="text-left text-foreground hover:text-accent" onClick={() => { setCategory(c.key); setTiming("all"); setSize("all"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                        {c.label}
                      </button>
                    </td>
                    <td className={`${tableCellClass} text-right tabular-nums`}>{c.events.toLocaleString()}</td>
                    <td className={`${tableCellClass} text-right tabular-nums`} style={{ color: signColor(u?.path[idx("d1")]) }}>{pct(u?.path[idx("d1")], 1)}</td>
                    <td className={`${tableCellClass} text-right tabular-nums`} title={u?.drift60 ? `t = ${u.drift60.t}: ${tWords(u.drift60.t)}` : undefined}>
                      <span style={{ color: signColor(u?.drift60?.mean) }}>{pct(u?.drift60?.mean, 1)}</span>
                      {u?.drift60 && <span className="ml-1 text-[10px] text-zinc-500">t {u.drift60.t.toFixed(1)}</span>}
                    </td>
                    <td className={`${tableCellClass} text-right tabular-nums`} style={{ color: signColor(d?.path[idx("d1")]) }}>{pct(d?.path[idx("d1")], 1)}</td>
                    <td className={`${tableCellClass} text-right tabular-nums`} title={d?.drift60 ? `t = ${d.drift60.t}: ${tWords(d.drift60.t)}` : undefined}>
                      <span style={{ color: signColor(d?.drift60?.mean) }}>{pct(d?.drift60?.mean, 1)}</span>
                      {d?.drift60 && <span className="ml-1 text-[10px] text-zinc-500">t {d.drift60.t.toFixed(1)}</span>}
                    </td>
                    <td className={`${tableCellClass} text-[11px]`}>
                      {checkpointWords(u?.halfLife ?? null)} / {checkpointWords(d?.halfLife ?? null)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Callout label="the terms, in a few words" className="md:col-span-2">
          <strong className="text-foreground">Abnormal return:</strong> the stock&apos;s move minus the market&apos;s, so a rally everywhere
          doesn&apos;t count as a reaction. <strong className="text-foreground">Half-life:</strong> how long until half of the final move had
          happened. <strong className="text-foreground">Drift:</strong> extra movement after the first day.{" "}
          <strong className="text-foreground">t-stat:</strong> how sure we are it isn&apos;t luck; under about 2 means we can&apos;t be sure.{" "}
          <strong className="text-foreground">8-K:</strong> the form US companies must file when something important happens.
        </Callout>
        <Callout label="how it's measured">
          Every 8-K filed by the ~210 companies on the research list since {data.period.from}, timed to the second SEC accepted it. News
          filed during market hours is measured from that minute&apos;s price; news filed before the open or after the close, from the
          previous close (so the first move is the next morning&apos;s opening jump). Abnormal return = the stock&apos;s return minus
          SPY&apos;s. &quot;Good&quot; and &quot;bad&quot; news means the stock rose or fell at least {Math.round(data.moveThreshold * 100)}% more
          than the market on day 1: there are no free analyst forecasts to measure surprises against, so the market&apos;s first
          reaction stands in for them. A company with two 8-Ks reacting in the same session counts once, under the more important one.
        </Callout>
        <Callout label="what to be careful about">
          <ul className="list-disc space-y-1 pl-4">
            <li>
              Earnings press releases usually hit the newswires minutes <em>before</em> the 8-K is filed, so some of the move can show
              up just before &quot;News&quot;.
            </li>
            <li>
              Sorting by the day-1 move builds some of the result in: the day-1 numbers are large by construction. The honest test is
              what happens <em>after</em> day 1.
            </li>
            <li>
              t-statistics assume events are independent; earnings cluster in the same weeks, so the real uncertainty is somewhat
              larger than shown.
            </li>
            <li>Today&apos;s company list, so firms that collapsed or were bought out aren&apos;t in it (survivorship bias).</li>
            <li>Sources: {data.sources.join("; ")}. Educational, not investment advice.</li>
          </ul>
        </Callout>
      </div>
    </>
  );
}
