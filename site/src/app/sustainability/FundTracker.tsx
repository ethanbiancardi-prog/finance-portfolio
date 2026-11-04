"use client";

// The fund tracker on /sustainability: the BIG Sustainability Fund's 18
// holdings vs the S&P 500 (SPY) over a chosen period.
//
// Prices: /api/industries (the same cached Alpaca data as Industry Charts on
// /research), so this page adds no new API calls. Green Score: the static
// /data/green.json behind the Green Score section below.
//
// "The basket" = an equal-weight average of the holdings: what you'd have
// made putting the same dollars into each stock at the start of the period.
// The real fund's weights aren't public, so this is a stand-in, not its
// actual performance.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Card, ChartLoading, Chip, SectionHeader, StatCard } from "@/components/ui";
import { formatPercent } from "@/lib/format";
import { averageSeries, lastValue, PERIOD_KEYS, PERIODS, type IndustryData, type PeriodKey } from "@/lib/industries";
import { scoreColor, type GreenData } from "@/lib/greenScore";
import { FUND_HOLDINGS } from "@/lib/sustainabilityFund";
import type { ChartLine } from "../research/IndustryChart";

const IndustryChart = dynamic(() => import("../research/IndustryChart"), {
  ssr: false,
  loading: () => <ChartLoading className="h-72 sm:h-96" />,
});

// Clicked holdings take these in order (the accent is the basket's line).
const PICK_COLORS = ["var(--eco-cyan)", "var(--series-4)", "var(--status-bad)"];


const signedPct = (v: number, decimals = 1) => `${v > 0 ? "+" : ""}${formatPercent(v, { decimals })}`;
function Signed({ value }: { value: number | null }) {
  if (value == null) return <span className="text-zinc-500">N/A</span>;
  return <span style={{ color: `var(--status-${value >= 0 ? "good" : "bad"})` }}>{signedPct(value)}</span>;
}

// A card-sized line of one stock's return path, 0% dashed.
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

export default function FundTracker() {
  const [period, setPeriod] = useState<PeriodKey>("1y");
  const [cache, setCache] = useState<Partial<Record<PeriodKey, IndustryData>>>({});
  const [errors, setErrors] = useState<Partial<Record<PeriodKey, string>>>({});
  const [green, setGreen] = useState<GreenData | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
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
        .catch(() => {}); // keep the last good prices
    }, 60_000);
    return () => window.clearInterval(id);
  }, [period, isLive]);

  useEffect(() => {
    fetch("/data/green.json")
      .then((res) => (res.ok ? res.json() : null))
      .then(setGreen)
      .catch(() => {}); // the Green Score line on each card just stays empty
  }, []);

  // Each holding's Green Score (0-100 vs its own industry), and the question
  // the fund's name raises: are its holdings greener than their peers? Every
  // industry's middle is about 50, so the benchmark is the average score of
  // all ~210 companies on the research list.
  const greenOf = useMemo(() => new Map((green?.companies ?? []).map((c) => [c.ticker, c])), [green]);
  const greenSummary = useMemo(() => {
    if (!green) return null;
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
    const fund = FUND_HOLDINGS.map((h) => greenOf.get(h.ticker)?.score).filter((x): x is number => x != null);
    const all = green.companies.map((c) => c.score).filter((x): x is number => x != null);
    const topHalf = FUND_HOLDINGS.filter((h) => {
      const c = greenOf.get(h.ticker);
      return c?.rank != null && c.rank <= Math.ceil(c.of / 2);
    }).length;
    return { fund: avg(fund), all: avg(all), topHalf, scored: fund.length };
  }, [green, greenOf]);

  const holdings = useMemo(
    () =>
      FUND_HOLDINGS.filter((h) => data?.series[h.ticker]).map((h) => {
        const values = data!.series[h.ticker];
        return { ...h, name: data!.names[h.ticker] ?? h.ticker, values, total: lastValue(values) };
      }),
    [data],
  );
  const basket = useMemo(() => averageSeries(holdings.map((h) => h.values)), [holdings]);
  const basketTotal = lastValue(basket);
  const spyTotal = lastValue(data?.series.SPY);
  const beat = spyTotal == null ? 0 : holdings.filter((h) => h.total != null && h.total > spyTotal).length;
  const ranked = [...holdings].sort((a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity));

  const colorOf = (t: string) => {
    const i = picked.indexOf(t);
    if (i >= 0) return PICK_COLORS[i];
    return hovered === t ? "var(--foreground)" : undefined;
  };
  const togglePick = (t: string) =>
    setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t].slice(-PICK_COLORS.length)));

  const lines: ChartLine[] = data
    ? [
        ...holdings.map((h) => ({ key: h.ticker, name: h.ticker, values: h.values, kind: "stock" as const, color: colorOf(h.ticker) })),
        { key: "__basket", name: "Fund basket", values: basket, kind: "average", color: "var(--accent)" },
        { key: "SPY", name: "S&P 500 (SPY)", values: data.series.SPY ?? [], kind: "spy" },
      ]
    : [];

  // Holdings grouped by the fund's sub-sector, best performer first within each.
  const groups = useMemo(() => {
    const g = new Map<string, typeof ranked>();
    for (const h of ranked) g.set(h.theme, [...(g.get(h.theme) ?? []), h]);
    return [...g];
  }, [ranked]);

  return (
    <>
      <Card as="section">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeader
            label="fund basket vs the S&P 500"
            description="Every holding's % return from the start of the period. Bright line = all 18 held in equal dollars; dashed = SPY. Click holdings below to light up their lines."
          />
          <div className="flex flex-wrap gap-1.5">
            {PERIOD_KEYS.map((p) => (
              <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>
                {PERIODS[p].label}
              </Chip>
            ))}
          </div>
        </div>

        {error && !data && <p className="mt-4 text-xs text-bad">{error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            size="lg"
            label="Fund basket"
            value={data ? <Signed value={basketTotal} /> : "…"}
            hint={<span className="text-zinc-500">equal-weight, {PERIODS[period].label}</span>}
          />
          <StatCard size="lg" label="S&P 500 (SPY)" value={data ? <Signed value={spyTotal} /> : "…"} hint={<span className="text-zinc-500">incl. dividends</span>} />
          <StatCard
            size="lg"
            label="Ahead / behind"
            value={
              data && basketTotal != null && spyTotal != null ? (
                <span className="eco-glow-text">
                  <Signed value={basketTotal - spyTotal} />
                </span>
              ) : (
                "…"
              )
            }
            hint={<span className="text-zinc-500">percentage points vs SPY</span>}
          />
          <StatCard
            size="lg"
            label="Beat the market"
            value={data ? `${beat} of ${holdings.length}` : "…"}
            hint={<span className="text-zinc-500">holdings ahead of SPY</span>}
          />
        </div>

        <div className="mt-4">
          {data ? <IndustryChart dates={data.dates} lines={lines} log={period === "5y"} /> : !error && <ChartLoading className="h-72 sm:h-96" />}
        </div>
        {data && (
          <p className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
            {data.live ? (
              <>
                <span className="eco-live-dot inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                Live: latest trades as of{" "}
                {new Date(data.live.asOf).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET,
                updating every minute.
              </>
            ) : (
              <>Daily closes through {data.lastBar}. Alpaca market data, dividends included.</>
            )}
            {period === "5y" && " Log scale: a doubling is the same height anywhere on the chart."}
          </p>
        )}
      </Card>

      {greenSummary && (
        <Card as="section" className="mt-4">
          <SectionHeader
            label="is the fund actually green?"
            description="Each holding's Green Score compares it only with its own industry (see Green Score below). If the fund picks the cleaner companies in each industry, its average should beat the average company's."
          />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard
              size="lg"
              label="Fund holdings' average"
              value={<span style={{ color: scoreColor(greenSummary.fund) }}>{greenSummary.fund ?? "N/A"}</span>}
              hint={<span className="text-zinc-500">Green Score, of {greenSummary.scored} scored</span>}
            />
            <StatCard size="lg" label="All ~210 companies" value={greenSummary.all ?? "N/A"} hint={<span className="text-zinc-500">the benchmark</span>} />
            <StatCard
              size="lg"
              label="Greener half of their industry"
              value={`${greenSummary.topHalf} of ${FUND_HOLDINGS.length}`}
              hint={<span className="text-zinc-500">holdings</span>}
            />
          </div>
        </Card>
      )}

      {data && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map(([theme, list]) => (
            <Card key={theme} as="section" padding="sm">
              <p className="text-[10px] caps text-accent">{theme}</p>
              <div className="mt-2 space-y-2">
                {list.map((h) => {
                  const color = colorOf(h.ticker);
                  const g = greenOf.get(h.ticker);
                  return (
                    <Card
                      key={h.ticker}
                      as="button"
                      interactive
                      padding="sm"
                      onClick={() => togglePick(h.ticker)}
                      onPointerEnter={() => setHovered(h.ticker)}
                      onPointerLeave={() => setHovered(null)}
                      aria-pressed={picked.includes(h.ticker)}
                      className={picked.includes(h.ticker) ? "!border-accent" : ""}
                    >
                      <div className="relative flex items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-xs">
                          <span className="tabular-nums font-semibold" style={{ color: color ?? "var(--foreground)" }}>
                            {h.ticker}
                          </span>{" "}
                          <span className="text-zinc-500">{h.name}</span>
                        </p>
                        <p className="shrink-0 text-xs tabular-nums">
                          <Signed value={h.total} />
                        </p>
                      </div>
                      <div className="relative">
                        <Spark values={h.values} color={color ?? "var(--accent)"} />
                      </div>
                      <p className="relative text-[10px] text-zinc-500" title="0-100 vs its own industry: 100 = cleanest in the industry. See Green Score below.">
                        {g?.score != null ? (
                          <>
                            Green Score <span className="tabular-nums" style={{ color: scoreColor(g.score) }}>{g.score}</span> · #{g.rank} of {g.of}{" "}
                            in {green!.industries[g.industry].label}
                          </>
                        ) : (
                          "Green Score: not enough data"
                        )}
                      </p>
                    </Card>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
