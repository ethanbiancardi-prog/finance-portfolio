"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { AlgoView } from "@/lib/algoPortfolios";
import type { StrategyKey } from "@/lib/strategyLab";
import {
  Card,
  ChartLoading,
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

function Signed({ value }: { value: number }) {
  return (
    <span style={{ color: `var(--status-${value >= 0 ? "good" : "bad"})` }}>
      {value >= 0 ? "+" : ""}
      {formatPercent(value, { decimals: 2 })}
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

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// The live algo portfolios (lib/algoPortfolios.ts): three strategies on the
// backtest's rules, trading real prices from the day they opened, against a
// control portfolio that simply holds the S&P 500 (SPY).
export default function LivePortfolios() {
  const [data, setData] = useState<AlgoView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () =>
      fetch("/api/algo-portfolios")
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? "The portfolios couldn't load.");
          setData(body);
          setError("");
        })
        .catch((err) => setError(err instanceof Error ? err.message : "The portfolios couldn't load."));
    load();
    const timer = setInterval(load, 60_000); // prices move; the server caches for two minutes
    return () => clearInterval(timer);
  }, []);

  if (error) {
    return (
      <Card className="mt-4" padding="sm">
        <p className="text-xs text-bad">{error}</p>
      </Card>
    );
  }
  if (!data) return <ChartLoading className="mt-4 h-72 sm:h-80" />;

  const ports = data.portfolios;
  if (ports.length === 0) {
    return (
      <Card as="section" className="mt-4">
        <SectionHeader label="not trading yet" />
        <p className="mt-3 max-w-2xl text-xs leading-5 text-zinc-400">
          Three of these strategies (momentum, breakout and mean reversion) each get their own $100,000 paper portfolio and
          trade it automatically, once a day at {data.startsAt}, by exactly the rules on the Backtest tab. A fourth portfolio
          is the control: $100,000 in the S&amp;P 500, never sold. The first trades happen at the next 3:45pm on a trading
          day; this tab fills in from then.
        </p>
      </Card>
    );
  }

  // One row per day across all the portfolios. The control (buy-and-hold
  // SPY) is a real portfolio here, drawn as the dashed benchmark line.
  const byDate = new Map<string, { date: string } & Partial<Record<StrategyKey, number>>>();
  for (const p of ports) {
    for (const h of p.history) {
      const row = byDate.get(h.date) ?? { date: h.date };
      row[p.key] = Math.round(h.equity);
      byDate.set(h.date, row);
    }
  }
  const curve = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const names: Partial<Record<StrategyKey, string>> = {};
  for (const p of ports) names[p.key] = p.key === "buyhold" ? "S&P 500 (control)" : p.name;
  const visible = ports.map((p) => p.key);
  const ranked = [...ports].sort((a, b) => b.equity - a.equity);
  // "Vs. control" compares with the control portfolio's actual value; before
  // it exists, with what the same money in SPY would be worth.
  const control = ports.find((p) => p.key === "buyhold");
  const baseline = (p: (typeof ports)[number]) => control?.equity ?? p.spyEquity;
  const opened = new Date(Math.min(...ports.map((p) => new Date(p.openedAt).getTime()))).toISOString();

  return (
    <>
      <Card as="section" className="mt-4">
        <SectionHeader
          label="live since"
          description={`Each portfolio opened with $100,000 on ${new Date(opened).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} and trades once a day at ${data.startsAt}, by the Backtest tab's rules, at real prices. Values update every minute while this page is open.${data.lastRun ? ` Last trading run: ${when(data.lastRun.ranAt)}.` : ""}`}
        />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          {visible.map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <Swatch k={k} />
              {names[k]}
            </span>
          ))}
        </div>
        <div className="mt-3">
          <LabChart curve={curve} names={names} visible={visible} short />
        </div>
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader label="leaderboard" description="Ranked by account value. 'Vs. control' is how far ahead of or behind the S&P 500 control portfolio each one is." />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className={tableHeadCellClass}>Strategy</th>
                <th className={`${tableHeadCellClass} text-right`}>Value</th>
                <th className={`${tableHeadCellClass} text-right`}>Return</th>
                <th className={`${tableHeadCellClass} text-right`}>Vs. control</th>
                <th className={`${tableHeadCellClass} text-right`}>Cash</th>
                <th className={`${tableHeadCellClass} text-right`}>Holdings</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((p) => (
                <tr key={p.key} className={tableRowClass}>
                  <td className="py-1.5 pr-3 text-xs text-foreground">
                    <span className="flex items-center gap-2">
                      <Swatch k={p.key} />
                      {names[p.key]}
                    </span>
                  </td>
                  <td className={`${tableCellStrongClass} text-right`}>{formatCurrency(p.equity)}</td>
                  <td className={`${tableCellClass} text-right`}><Signed value={p.equity / p.startingCash - 1} /></td>
                  <td className={`${tableCellClass} text-right`}>
                    {p.key === "buyhold" ? "—" : <Signed value={(p.equity - baseline(p)) / p.startingCash} />}
                  </td>
                  <td className={`${tableCellClass} text-right`}>{formatCurrency(p.cash)}</td>
                  <td className={`${tableCellClass} text-right`}>{p.positions.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="mt-4">
        <SectionHeader label="holdings and recent trades" />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {ports.map((p) => {
            const note = data.lastRun?.bots.find((b) => b.key === p.key)?.note;
            return (
              <Card key={p.key} padding="sm">
                <div className="flex items-center gap-2">
                  <Swatch k={p.key} />
                  <h3 className="text-sm text-foreground">{names[p.key]}</h3>
                </div>
                {note && <p className="mt-0.5 text-[10px] text-zinc-500">Last run: {note}</p>}
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className={tableHeadRowClass}>
                        <th className={tableHeadCellClass}>Symbol</th>
                        <th className={`${tableHeadCellClass} text-right`}>Value</th>
                        <th className={`${tableHeadCellClass} text-right`}>P&amp;L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.positions.map((pos) => (
                        <tr key={pos.symbol} className={tableRowClass}>
                          <td className="py-1 text-xs text-foreground">{pos.symbol}</td>
                          <td className={`${tableCellClass} text-right`}>{formatCurrency(pos.marketValue)}</td>
                          <td className={`${tableCellClass} text-right`}><Signed value={pos.unrealizedPlPct} /></td>
                        </tr>
                      ))}
                      {p.positions.length === 0 && (
                        <tr>
                          <td colSpan={3} className={`${tableCellClass} py-2`}>All cash.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {p.trades.length > 0 && (
                  <p className="mt-2 text-[10px] leading-4 text-zinc-500">
                    Recent:{" "}
                    {p.trades
                      .slice(0, 6)
                      .map((t) => `${t.side} ${t.qty} ${t.symbol} (${new Date(t.executedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })})`)
                      .join(" · ")}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <p className="mt-4 text-[10px] leading-4 text-zinc-500">
        Paper money, educational, not investment advice. Live fills use the 3:45pm price for both the decision and the trade,
        where the backtest decides on one close and fills at the next; there are no trading costs here.
      </p>
    </>
  );
}
