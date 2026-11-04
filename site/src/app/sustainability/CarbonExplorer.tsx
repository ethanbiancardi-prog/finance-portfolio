"use client";

// The Carbon Intensity page: S&P 500 companies ranked by greenhouse gas per
// $1M of sales, filterable by sector, with each company's 5-year trend and
// biggest facilities.
//
// Data: public/data/carbon.json, built offline by scripts/carbon/build-carbon.ts
// from the EPA Greenhouse Gas Reporting Program (facility emissions split by
// ownership share to each parent company) and SEC revenue. Nothing is fetched
// from EPA or SEC at page load.
//
// Carbon intensity = metric tons CO2-equivalent / ($ revenue / 1,000,000).
// It's the standard way to compare a big company with a small one: a utility
// and a refiner can emit the same tons, but if the refiner sells 10x as much,
// each dollar of its business is 10x less carbon-heavy.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Callout, Card, ChartLoading, Chip, SectionHeader, StatCard } from "@/components/ui";
import type { TrendPoint } from "./CarbonTrend";

const CarbonTrend = dynamic(() => import("./CarbonTrend"), { ssr: false, loading: () => <ChartLoading className="h-56" /> });

type Company = {
  ticker: string;
  name: string;
  sector: string;
  facilityCount: number;
  topFacilities: { name: string; state: string; tons: number }[];
  emissions: Record<string, number>;
  revenue: Record<string, number | null>;
  opIncome: Record<string, number | null>;
};
type Data = { generated: string; years: number[]; source: string; companies: Company[] };

// A typical US passenger car emits about 4.6 metric tons of CO2 a year (EPA,
// "Greenhouse Gas Emissions from a Typical Passenger Vehicle").
const TONS_PER_CAR = 4.6;

const intensity = (c: Company, y: number) => {
  const r = c.revenue[y];
  return r ? c.emissions[y] / (r / 1e6) : null;
};
const mt = (t: number) =>
  t >= 1e9 ? `${(t / 1e9).toFixed(2)}B t` : t >= 1e6 ? `${(t / 1e6).toFixed(t < 1e7 ? 1 : 0)}M t` : `${Math.round(t / 1e3).toLocaleString()}K t`;
const cars = (t: number) => {
  const n = t / TONS_PER_CAR;
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)} million` : `${Math.round(n / 1e3).toLocaleString()} thousand`;
};
const change = (from: number | null, to: number | null) => (from && to ? to / from - 1 : null);
// Names as SEC and EPA file them ("DUKE ENERGY CORP", "MARTIN LAKE") in
// title case, minus the legal suffix. A word that is the company's own ticker
// (CMS, AES, PPL) or has an "&" (PG&E) is an acronym and stays in capitals.
const tidy = (n: string, ticker = "") =>
  n
    .replace(/\s*\/[A-Z]{2,3}\/?$/, "")
    .split(" ")
    .map((w) => (w === ticker || w.includes("&") ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ")
    .replace(/,?\s+(Inc|Corp|Co|Plc|Ltd|Llc|Lp)\.?$/i, "");

type Sort = "intensity" | "tons";

export default function CarbonExplorer() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [sector, setSector] = useState("All");
  const [sort, setSort] = useState<Sort>("intensity");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/carbon.json")
      .then((res) => {
        if (!res.ok) throw new Error("The data couldn't load.");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "The data couldn't load."));
  }, []);

  const latest = data?.years[data.years.length - 1] ?? 2023;
  const first = data?.years[0] ?? 2019;

  // Sectors with at least three companies get their own chip; the rest sit under "All".
  const sectors = useMemo(() => {
    const count = new Map<string, number>();
    for (const c of data?.companies ?? []) count.set(c.sector, (count.get(c.sector) ?? 0) + 1);
    return ["All", ...[...count].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([s]) => s)];
  }, [data]);

  const rows = useMemo(() => {
    const list = (data?.companies ?? []).filter((c) => sector === "All" || c.sector === sector);
    const key = (c: Company) => (sort === "tons" ? c.emissions[latest] : (intensity(c, latest) ?? -1));
    return list.sort((a, b) => key(b) - key(a));
  }, [data, sector, sort, latest]);
  const max = Math.max(1, ...rows.map((c) => (sort === "tons" ? c.emissions[latest] : (intensity(c, latest) ?? 0))));

  const totalTons = rows.reduce((s, c) => s + c.emissions[latest], 0);
  const totalRevenue = rows.reduce((s, c) => s + (c.revenue[latest] ?? 0), 0);
  const tonsWithRevenue = rows.reduce((s, c) => s + (c.revenue[latest] ? c.emissions[latest] : 0), 0);
  // Like for like: only companies with emissions in both years, so a spin-off
  // (Constellation appears in 2022) doesn't read as a rise.
  const both = rows.filter((c) => c.emissions[first] > 0 && c.emissions[latest] > 0);
  const firstTons = both.reduce((s, c) => s + c.emissions[first], 0);
  const bothLatest = both.reduce((s, c) => s + c.emissions[latest], 0);

  if (error) return <p className="mt-4 text-xs text-bad">{error}</p>;
  if (!data) return <ChartLoading className="mt-4 h-96" />;

  return (
    <>
      <Card as="section" className="mt-4">
        <SectionHeader
          label={`${sector === "All" ? "all companies" : sector}, ${latest}`}
          description={`${rows.length} S&P 500 companies with large US facilities. Totals are their US facilities' direct emissions in ${latest}, the latest year the EPA has published.`}
        />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard size="lg" label="Emissions" value={mt(totalTons)} hint={<span className="text-zinc-500">metric tons of CO₂-equivalent</span>} />
          <StatCard
            size="lg"
            label="Per $1M of sales"
            value={totalRevenue ? `${Math.round(tonsWithRevenue / (totalRevenue / 1e6)).toLocaleString()} t` : "N/A"}
            hint={<span className="text-zinc-500">all these companies together</span>}
          />
          <StatCard
            size="lg"
            label={`Change since ${first}`}
            value={
              <span style={{ color: `var(--status-${bothLatest <= firstTons ? "good" : "bad"})` }}>
                {firstTons ? `${bothLatest >= firstTons ? "+" : ""}${((bothLatest / firstTons - 1) * 100).toFixed(0)}%` : "N/A"}
              </span>
            }
            hint={<span className="text-zinc-500">total tons, companies reporting both years</span>}
          />
          <StatCard
            size="lg"
            label="Like this many cars"
            value={cars(totalTons).replace(" million", "M").replace(" thousand", "K")}
            hint={<span className="text-zinc-500">driven for a year, at 4.6 t each</span>}
          />
        </div>
      </Card>

      <Card as="section" className="mt-4">
        <div className="flex flex-wrap gap-2">
          {sectors.map((s) => (
            <Chip key={s} active={sector === s} onClick={() => { setSector(s); setOpen(null); }}>
              {s}
            </Chip>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-500">Rank by:</span>
          <Chip active={sort === "intensity"} onClick={() => setSort("intensity")}>Per $1M of sales</Chip>
          <Chip active={sort === "tons"} onClick={() => setSort("tons")}>Total emissions</Chip>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-zinc-500">
          {sort === "intensity"
            ? "Tons released for every $1 million the company sells: how carbon-heavy each dollar of its business is. Fair for comparing big and small companies."
            : "Total tons released: who emits the most overall, which mostly means who is biggest."}{" "}
          Click a company for its trend and biggest sites.
        </p>

        <ol className="mt-3 divide-y divide-border">
          {rows.map((c, i) => {
            const value = sort === "tons" ? c.emissions[latest] : intensity(c, latest);
            const trend = change(intensity(c, first), intensity(c, latest));
            const isOpen = open === c.ticker;
            return (
              <li key={c.ticker}>
                <button
                  onClick={() => setOpen(isOpen ? null : c.ticker)}
                  className="w-full py-2 text-left"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-xs text-foreground">
                      <span className="tabular-nums text-zinc-600">{i + 1}.</span> <span className="text-accent">{c.ticker}</span> {tidy(c.name, c.ticker)}
                    </p>
                    <p className="shrink-0 text-xs tabular-nums text-foreground">
                      {value === null ? "no sales data" : sort === "tons" ? mt(value) : `${Math.round(value).toLocaleString()} t / $1M`}
                    </p>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-border/60">
                    <div className="h-1.5 rounded-full" style={{ width: `${((value ?? 0) / max) * 100}%`, background: "var(--series-3)" }} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {c.sector} · {mt(c.emissions[latest])} · {c.facilityCount} site{c.facilityCount === 1 ? "" : "s"}
                    {trend !== null && (
                      <>
                        {" "}· intensity{" "}
                        <span style={{ color: `var(--status-${trend <= 0 ? "good" : "bad"})` }}>
                          {trend <= 0 ? "▼" : "▲"} {Math.abs(trend * 100).toFixed(0)}% since {first}
                        </span>
                      </>
                    )}
                  </p>
                </button>
                {isOpen && <CompanyDetail c={c} years={data.years} />}
              </li>
            );
          })}
        </ol>
      </Card>

      <Callout label="what this covers, and what it doesn't" className="mt-4">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <strong className="text-foreground">Direct emissions only (Scope 1):</strong>{" "} what comes out of the company&apos;s own smokestacks and
            pipes. Not the electricity it buys (Scope 2) or what customers release burning its products (Scope 3), which for an oil company is
            most of its footprint.
          </li>
          <li>
            <strong className="text-foreground">US facilities over 25,000 tons a year only.</strong>{" "} Overseas plants and small sites aren&apos;t
            counted, but sales are worldwide, so global companies look cleaner than they are. Compare companies within a sector.
          </li>
          <li>
            <strong className="text-foreground">Per-dollar numbers move with prices, not just pollution.</strong> Oil and gas prices jumped in
            2022, so energy companies&apos; sales rose and their intensity fell even where their tons barely changed. Check the total tons too.
          </li>
          <li>
            Shared facilities are split by ownership share. A company only gets a site&apos;s emissions for years it owned it.
          </li>
          <li>
            {latest} is the latest year published. The EPA has twice delayed the next round of reporting and has proposed ending the program for
            most industries, so this free data source may stop.
          </li>
          <li>Source: {data.source}. Educational, not investment advice.</li>
        </ul>
      </Callout>
    </>
  );
}

function CompanyDetail({ c, years }: { c: Company; years: number[] }) {
  const latest = years[years.length - 1];
  const first = years[0];
  const trend: TrendPoint[] = years.map((y) => ({ year: String(y), tons: c.emissions[y], intensity: intensity(c, y) }));
  const tonsChange = change(c.emissions[first], c.emissions[latest]);
  const intChange = change(intensity(c, first), intensity(c, latest));
  // Plain-English read of the trend: did the cut come from cleaner operations or from selling more?
  const read =
    tonsChange === null || intChange === null
      ? null
      : tonsChange < -0.05 && intChange < -0.05
        ? "Emitting less in total and per dollar of sales: a real cut, not just a smaller business."
        : tonsChange >= -0.05 && intChange < -0.05
          ? "Total emissions held steady or rose, but the business grew faster: cleaner per dollar, not in total."
          : tonsChange < -0.05 && intChange >= -0.05
            ? "Total emissions fell, but sales fell about as much: it shrank more than it got cleaner."
            : "No improvement: emissions per dollar of sales held steady or rose.";
  return (
    <div className="mb-3 rounded-[var(--radius-sm)] border border-border p-3">
      <p className="text-[10px] caps text-zinc-500">
        {first}–{latest}: bars = million tons, line = tons per $1M of sales
      </p>
      <CarbonTrend data={trend} />
      {read && <p className="mt-2 text-xs text-foreground">{read}</p>}
      <p className="mt-1 text-[11px] text-zinc-500">
        Total {tonsChange !== null ? `${tonsChange >= 0 ? "+" : ""}${(tonsChange * 100).toFixed(0)}%` : "N/A"}, per $1M of sales{" "}
        {intChange !== null ? `${intChange >= 0 ? "+" : ""}${(intChange * 100).toFixed(0)}%` : "N/A"} since {first}. {latest}:{" "}
        {mt(c.emissions[latest])}, the same as about {cars(c.emissions[latest])} cars driven for a year.
      </p>
      {c.topFacilities.length > 0 && (
        <>
          <p className="mt-3 text-[10px] caps text-zinc-500">Biggest US sites, {latest}</p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-zinc-400">
            {c.topFacilities.map((f) => (
              <li key={f.name + f.state} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {tidy(f.name)}, {f.state}
                </span>
                <span className="shrink-0 tabular-nums">{mt(f.tons)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
