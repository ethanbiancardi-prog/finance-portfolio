"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Callout, Card, ChartLoading, Chip, SectionHeader } from "@/components/ui";
import { formatPercent } from "@/lib/format";
import {
  averageSeries,
  lastValue,
  PERIOD_KEYS,
  PERIODS,
  type IndustryData,
  type PeriodKey,
} from "@/lib/industries";
import { SECTOR_KEYS, SECTORS, type SectorKey } from "@/lib/sectors";
import type { ChartLine } from "./IndustryChart";

const IndustryChart = dynamic(() => import("./IndustryChart"), {
  ssr: false,
  loading: () => <ChartLoading className="h-72 sm:h-96" />,
});

type View = "all" | SectorKey;

// Picked lines take these in order; the line under the mouse takes the accent.
const PICK_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
const MAX_PICKS = PICK_COLORS.length;

const signedPct = (v: number, decimals = 1) => `${v > 0 ? "+" : ""}${formatPercent(v, { decimals })}`;

function Signed({ value }: { value: number | null }) {
  if (value == null) return <span className="text-zinc-500">N/A</span>;
  return <span style={{ color: `var(--status-${value >= 0 ? "good" : "bad"})` }}>{signedPct(value)}</span>;
}

const niceDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// A tiny line chart for one card: the stock's return path, with 0% dashed.
function Spark({ values, color }: { values: (number | null)[]; color: string }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return <div className="h-8" />;
  const ys = [0, ...pts.map((p) => p[1])];
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const span = hi - lo || 1;
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * 100;
  const y = (v: number) => 30 - ((v - lo) / span) * 28 - 1;
  const d = pts.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <line x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="var(--chart-muted)" strokeOpacity="0.5" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type Row = { key: string; label: string; sub: string; values: (number | null)[]; total: number | null; stale: string | null };

// The first tab on /research: the big names in each sector on one chart.
// Clicking a stock's card opens it in the Search tab (onResearch).
export default function IndustryCharts({ onResearch }: { onResearch: (symbol: string) => void }) {
  const [view, setView] = useState<View>("all");
  const [period, setPeriod] = useState<PeriodKey>("1y");
  const [cache, setCache] = useState<Partial<Record<PeriodKey, IndustryData>>>({});
  const [errors, setErrors] = useState<Partial<Record<PeriodKey, string>>>({});
  const [picked, setPicked] = useState<string[] | null>(null); // null = default picks
  const [hovered, setHovered] = useState<string | null>(null);

  const data = cache[period];
  const error = errors[period];
  useEffect(() => {
    if (cache[period]) return;
    let cancelled = false;
    fetch(`/api/industries?period=${period}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "The prices couldn't load.");
        if (!cancelled) setCache((c) => ({ ...c, [period]: body as IndustryData }));
      })
      .catch((e: Error) => !cancelled && setErrors((x) => ({ ...x, [period]: e.message })));
    return () => {
      cancelled = true;
    };
  }, [period, cache]);

  // While the market is open, pull the latest prices once a minute.
  const isLive = !!data?.live;
  useEffect(() => {
    if (!isLive) return;
    const id = window.setInterval(() => {
      fetch(`/api/industries?period=${period}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((body: IndustryData | null) => body && setCache((c) => ({ ...c, [period]: body })))
        .catch(() => {}); // keep showing the last good prices
    }, 60_000);
    return () => window.clearInterval(id);
  }, [period, isLive]);

  // The lines for this view: every sector's average stock, or every stock
  // in one sector. Sorted best to worst over the period.
  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const n = data.dates.length;
    const staleNote = (values: (number | null)[]) => {
      // A stock with no price for the last couple of points has stopped
      // trading (delisted, acquired) or hasn't traded yet today.
      let i = values.length - 1;
      while (i >= 0 && values[i] == null) i--;
      return i >= 0 && i < n - 2 ? `last traded ${niceDate(data.dates[i])}` : null;
    };
    const out: Row[] =
      view === "all"
        ? SECTOR_KEYS.map((k) => {
            const values = averageSeries(SECTORS[k].tickers.map((t) => data.series[t]).filter(Boolean));
            return { key: k, label: SECTORS[k].label, sub: `${SECTORS[k].tickers.length} stocks`, values, total: lastValue(values), stale: null };
          })
        : SECTORS[view].tickers
            .filter((t) => data.series[t])
            .map((t) => ({
              key: t,
              label: t,
              sub: data.names[t] ?? "",
              values: data.series[t],
              total: lastValue(data.series[t]),
              stale: staleNote(data.series[t]),
            }));
    return out.sort((a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity));
  }, [data, view]);

  // Until someone picks, highlight the leader and the laggard.
  const picks = picked ?? (rows.length >= 2 ? [rows[0].key, rows[rows.length - 1].key] : []);
  const colorOf = (key: string) => {
    const i = picks.indexOf(key);
    if (i >= 0) return PICK_COLORS[i];
    return key === hovered ? "var(--accent)" : undefined;
  };
  function togglePick(key: string) {
    setPicked((p) => {
      const cur = p ?? picks;
      if (cur.includes(key)) return cur.filter((k) => k !== key);
      return cur.length >= MAX_PICKS ? [...cur.slice(1), key] : [...cur, key];
    });
  }
  function changeView(v: View) {
    setView(v);
    setPicked(null);
    setHovered(null);
  }

  const spy = data?.series.SPY ?? [];
  const spyTotal = lastValue(spy);
  const lines: ChartLine[] = data
    ? [
        ...rows.map((r) => ({ key: r.key, name: r.label, values: r.values, kind: "stock" as const, color: colorOf(r.key) })),
        ...(view === "all"
          ? []
          : [{ key: "__avg", name: `${SECTORS[view].label} average`, values: averageSeries(rows.map((r) => r.values)), kind: "average" as const }]),
        { key: "__spy", name: "S&P 500 (SPY)", values: spy, kind: "spy" as const },
      ]
    : [];
  const avgTotal = view === "all" || !data ? null : lastValue(averageSeries(rows.map((r) => r.values)));

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {(["all", ...SECTOR_KEYS] as View[]).map((v) => (
          <Chip key={v} active={view === v} onClick={() => changeView(v)}>
            {v === "all" ? "All sectors" : SECTORS[v].label}
          </Chip>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-1.5">
          {PERIOD_KEYS.map((p) => (
            <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>
              {PERIODS[p].label}
            </Chip>
          ))}
        </div>
        {data && (
          <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            {niceDate(data.dates[0])} to {niceDate(data.lastBar)} ·{" "}
            {data.live ? (
              <>
                <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--status-good)]" />
                live, last trade{" "}
                {new Date(data.live.asOf).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" })}
              </>
            ) : (
              <>market closed, prices at the last close</>
            )}
          </span>
        )}
      </div>

      <section className="mt-6">
        <SectionHeader
          label={view === "all" ? "Sectors compared" : `${SECTORS[view].label}: the big names compared`}
          description={
            view === "all"
              ? "Each line is a sector's average stock: the same dollars put into every stock on the list at the start of the period. Hover a card to light up its line; click one to see its stocks."
              : `${SECTORS[view].description} Grey lines are the individual stocks; the bold line is their average and the dashed one is the S&P 500. Click a card to research that stock, or "Highlight" to colour its line (up to four).`
          }
        />
        {error && (
          <Callout className="mt-3" label="couldn't load">
            {error}
          </Callout>
        )}
        <Card className="mt-3" padding="sm">
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] caps text-zinc-500">
            {view !== "all" && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-[var(--chart-line)]" /> Sector average{" "}
                {avgTotal != null && <Signed value={avgTotal} />}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t border-dashed border-[var(--chart-muted)]" /> S&amp;P 500 (SPY){" "}
              {spyTotal != null && <Signed value={spyTotal} />}
            </span>
          </div>
          {data ? (
            <IndustryChart dates={data.dates} lines={lines} log={period === "5y"} />
          ) : (
            !error && <ChartLoading className="h-72 sm:h-96" />
          )}
        </Card>
        <p className="mt-2 text-[11px] leading-5 text-zinc-500">
          Returns include dividends.{period === "5y" && " 5Y uses a log scale, so doubling is the same height anywhere on the chart."}{" "}
          Daily closes come from Alpaca&apos;s consolidated feed. While the market is open, each line&apos;s last point is the
          stock&apos;s latest trade on IEX, which is real-time, and the page refreshes it every minute. Educational, not
          investment advice: past returns say nothing certain about future ones.
        </p>
      </section>

      {data && (
        <section className="mt-8">
          <SectionHeader
            label={view === "all" ? "Sectors, best to worst" : "Side by side, best to worst"}
            description={`Return over the period, and how far ahead of or behind the S&P 500 (${spyTotal != null ? signedPct(spyTotal) : "N/A"}).`}
          />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {rows.map((r, i) => {
              const color = colorOf(r.key);
              const vsSpy = r.total != null && spyTotal != null ? r.total - spyTotal : null;
              return (
                <Card
                  key={r.key}
                  interactive
                  padding="none"
                  onMouseEnter={() => setHovered(r.key)}
                  onMouseLeave={() => setHovered((h) => (h === r.key ? null : h))}
                  style={color ? { borderColor: color } : undefined}
                >
                  <button
                    type="button"
                    className="block w-full p-3 pb-1 text-left"
                    title={view === "all" ? `Show the ${r.label} stocks` : `Research ${r.label}`}
                    onClick={() => (view === "all" ? changeView(r.key as SectorKey) : onResearch(r.key))}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold text-foreground">
                        <span className="mr-1.5 text-[10px] font-normal text-zinc-500">{i + 1}</span>
                        {r.label}
                      </span>
                      <span className="text-[13px] tabular-nums">
                        <Signed value={r.total} />
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-zinc-500">{r.sub}</div>
                    <div className="mt-1.5">
                      <Spark values={r.values} color={color ?? "var(--chart-muted)"} />
                    </div>
                  </button>
                  <div className="flex items-center justify-between gap-2 px-3 pb-2.5 text-[10px] caps text-zinc-500">
                    <span>
                      {r.stale ?? (
                        <>
                          vs S&amp;P{" "}
                          {vsSpy == null ? "N/A" : (
                            <span style={{ color: `var(--status-${vsSpy >= 0 ? "good" : "bad"})` }}>
                              {vsSpy >= 0 ? "+" : ""}
                              {(vsSpy * 100).toFixed(1)} pts
                            </span>
                          )}
                        </>
                      )}
                    </span>
                    {view !== "all" && (
                      <button
                        type="button"
                        aria-pressed={picks.includes(r.key)}
                        onClick={() => togglePick(r.key)}
                        className={`caps transition-colors duration-150 ${picks.includes(r.key) ? "text-accent" : "hover:text-foreground"}`}
                      >
                        {picks.includes(r.key) ? "Highlighted" : "Highlight"}
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
