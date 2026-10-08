"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { formatCurrency, formatPercent, formatRatio } from "@/lib/format";
import type { LabResult, StrategyKey } from "@/lib/strategyLab";
import {
  Callout,
  Card,
  ChartLoading,
  Chip,
  SectionHeader,
  tableCellClass,
  tableCellStrongClass,
  tableHeadCellClass,
  tableHeadRowClass,
  tableRowClass,
} from "@/components/ui";
import { SERIES } from "./series";

const LabChart = dynamic(() => import("./LabChart"), {
  ssr: false,
  loading: () => <ChartLoading className="h-72 sm:h-80" />,
});

// A return, coloured good/bad by its sign. Text color carries the sign; the
// strategy's own series color is only ever on the swatch beside its name.
function Signed({ value }: { value: number }) {
  return (
    <span style={{ color: `var(--status-${value >= 0 ? "good" : "bad"})` }}>
      {value >= 0 ? "+" : ""}
      {formatPercent(value)}
    </span>
  );
}

function Swatch({ k }: { k: StrategyKey }) {
  const s = SERIES[k];
  return (
    <span
      aria-hidden
      className="inline-block w-4 shrink-0 align-middle"
      style={{ borderTop: `2px ${s.dashed ? "dashed" : "solid"} ${s.color}` }}
    />
  );
}

export default function StrategyLab() {
  const [data, setData] = useState<LabResult | null>(null);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState<Set<StrategyKey>>(new Set());

  useEffect(() => {
    fetch("/api/strategy-lab")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "The results couldn't load.");
        setData(body);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "The results couldn't load."));
  }, []);

  const toggle = (k: StrategyKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  if (error) {
    return (
      <Card className="mt-4" padding="sm">
        <p className="text-xs text-bad">{error}</p>
      </Card>
    );
  }

  const strategies = data?.strategies ?? [];
  const names = Object.fromEntries(strategies.map((s) => [s.key, s.name])) as Record<StrategyKey, string>;
  const visible = strategies.map((s) => s.key).filter((k) => !hidden.has(k));
  const years = strategies[0] ? Object.keys(strategies[0].yearly) : [];
  const fmtDate = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  return (
    <>
      <Card as="section" className="mt-4">
        <SectionHeader
          label="growth of $100,000"
          description={
            data
              ? `Each strategy starts with $100,000 on ${fmtDate(data.start)} and trades ${data.universeSize} large US stocks (plus SPY) through ${fmtDate(data.end)}. Log scale: the same percentage move is the same height anywhere on the chart.`
              : undefined
          }
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {strategies.map((s) => (
            <Chip key={s.key} active={!hidden.has(s.key)} onClick={() => toggle(s.key)} title={`Show or hide ${s.name}`}>
              <span className="flex items-center gap-1.5">
                <Swatch k={s.key} />
                {s.name}
              </span>
            </Chip>
          ))}
        </div>
        <div className="mt-3">{data ? <LabChart curve={data.curve} names={names} visible={visible} /> : <ChartLoading className="h-72 sm:h-80" />}</div>
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader
          label="results"
          description="Sharpe is return per unit of risk (higher is better; cash earns nothing here, so it's measured against 0%). Max drawdown is the worst fall from a peak. Trades counts every buy and every sell."
        />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className={tableHeadCellClass}>Strategy</th>
                <th className={`${tableHeadCellClass} text-right`}>Final value</th>
                <th className={`${tableHeadCellClass} text-right`}>Per year</th>
                <th className={`${tableHeadCellClass} text-right`}>Volatility</th>
                <th className={`${tableHeadCellClass} text-right`}>Sharpe</th>
                <th className={`${tableHeadCellClass} text-right`}>Max drawdown</th>
                <th className={`${tableHeadCellClass} text-right`}>Worst year</th>
                <th className={`${tableHeadCellClass} text-right`}>Trades</th>
                <th className={`${tableHeadCellClass} text-right`}>Invested</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((s) => {
                const m = s.metrics;
                return (
                  <tr key={s.key} className={tableRowClass}>
                    <td className="py-1.5 pr-3 text-xs text-foreground">
                      <span className="flex items-center gap-2">
                        <Swatch k={s.key} />
                        {s.name}
                      </span>
                    </td>
                    <td className={`${tableCellStrongClass} text-right`}>{formatCurrency(Math.round(m.finalValue))}</td>
                    <td className={`${tableCellClass} text-right`}><Signed value={m.cagr} /></td>
                    <td className={`${tableCellClass} text-right`}>{formatPercent(m.volatility)}</td>
                    <td className={`${tableCellClass} text-right`}>{formatRatio(m.sharpe)}</td>
                    <td className={`${tableCellClass} text-right`}><Signed value={m.maxDrawdown} /></td>
                    <td className={`${tableCellClass} text-right`}>
                      <Signed value={m.worstYear.ret} /> <span className="opacity-70">{m.worstYear.year}</span>
                    </td>
                    <td className={`${tableCellClass} text-right`}>{m.trades.toLocaleString()}</td>
                    <td className={`${tableCellClass} text-right`}>{formatPercent(m.timeInvested, { decimals: 0 })}</td>
                  </tr>
                );
              })}
              {!data && (
                <tr>
                  <td colSpan={9} className={`${tableCellClass} py-3 text-center`}>
                    Loading results...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader label="year by year" description="Each strategy's return in each calendar year. The first and last years are partial." />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className={tableHeadCellClass}>Year</th>
                {strategies.map((s) => (
                  <th key={s.key} className={`${tableHeadCellClass} text-right`}>
                    <span className="inline-flex items-center gap-1.5">
                      <Swatch k={s.key} />
                      {s.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y} className={tableRowClass}>
                  <td className="py-1 text-xs text-foreground">{y}</td>
                  {strategies.map((s) => (
                    <td key={s.key} className={`${tableCellClass} text-right`}>
                      <Signed value={s.yearly[y]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="mt-4">
        <SectionHeader label="the strategies" />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {strategies.map((s) => (
            <Card key={s.key} padding="sm">
              <div className="flex items-center gap-2">
                <Swatch k={s.key} />
                <h3 className="text-sm text-foreground">{s.name}</h3>
              </div>
              <p className="mt-0.5 text-[10px] caps text-zinc-500">{s.family}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-400">{s.idea}</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-zinc-400">
                {s.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <Callout className="mt-4" label="read before trusting any number here">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <strong>Survivorship bias, the big one.</strong> The stock list is today&apos;s household names, picked with
            hindsight. Companies that shrank or vanished since 2016 aren&apos;t in it, and future winners like NVIDIA are. That
            flatters every stock-picking strategy, momentum most of all, since it piles into whatever was rising.
            Buy-and-hold SPY is the only line here without that head start.
          </li>
          <li>
            Every trade pays 0.05% for slippage; there are no taxes, and cash earns nothing (in reality it earned
            0-5% a year over this period, which would help trend following).
          </li>
          <li>
            Decisions use each day&apos;s close and fill at the next day&apos;s close, so no strategy trades on a price it
            couldn&apos;t have known. Prices include dividends.
          </li>
          <li>
            Five strategies tested on one period: the best-looking one is partly the luckiest. Past results don&apos;t
            predict future ones. Educational, not investment advice.
          </li>
        </ul>
      </Callout>

      {data && (
        <p className="mt-3 text-[10px] text-zinc-500">
          Prices: Alpaca (consolidated feed, dividend-adjusted). Recomputed daily; this run{" "}
          {new Date(data.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.
        </p>
      )}
    </>
  );
}
