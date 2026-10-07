"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { formatCurrency, formatPercent, formatRatio } from "@/lib/format";
import type { Showcase } from "@/lib/showcase";
import { RULES } from "@/lib/signalTraderRules";
import {
  Button,
  Card,
  ChartLoading,
  GeometricLoader,
  useLoaderHold,
  PageShell,
  SectionHeader,
  StatCard,
  StatusBadge,
  Term,
  tableCellClass,
  tableCellStrongClass,
  tableHeadCellClass,
  tableHeadRowClass,
  tableRowClass,
  EmptyRow,
} from "@/components/ui";

const PortfolioChart = dynamic(() => import("../dashboard/PortfolioChart"), {
  ssr: false,
  loading: () => <ChartLoading className="h-56" />,
});

// Signed percentage change against the starting cash, coloured good/bad.
function Change({ value, base }: { value: number; base: number }) {
  const pct = (value - base) / base;
  return (
    <span style={{ color: `var(--status-${pct >= 0 ? "good" : "bad"})` }}>
      {pct >= 0 ? "+" : ""}
      {formatPercent(pct, { decimals: 2 })}
    </span>
  );
}

// View-only showcase of my own dashboard paper portfolio, traded by the
// Signal Trader algorithm (lib/signalTrader.ts). Visitors get their own
// account to trade on /dashboard.
export default function PaperTrading() {
  const [data, setData] = useState<Showcase | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // Hold the mark on screen while it reassembles, before the timestamp
  // replaces it.
  const heldLoader = useLoaderHold(!updatedAt && !error);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/showcase");
      if (!res.ok) throw new Error("The portfolio couldn't load right now.");
      setData(await res.json());
      setError("");
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "The portfolio couldn't load right now.");
    } finally {
      setRefreshing(false);
    }
  }

  // Prices move through the day, so re-pull every minute while the tab is
  // open (the server caches for two, so this never hammers anything).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount, then poll
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, []);

  const opened = data && new Date(data.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const risk = data?.risk ?? null;

  return (
    <PageShell
      eyebrow="live paper account"
      title="Paper Trading"
      description="My own practice portfolio: $100,000 of simulated cash traded by an algorithm I wrote, priced live and compared against putting the same money into the S&P 500. View-only. Sign in to get your own $100,000 account and trade it from your dashboard."
    >
      <div className="mt-3 flex items-center gap-3 text-[10px] caps text-zinc-500">
        <span>
          {heldLoader ? (
            <GeometricLoader loading={!updatedAt && !error} size={11} label="Loading" />
          ) : updatedAt ? (
            `Updated ${updatedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
          ) : null}
        </span>
        <span>Refreshes every minute</span>
        <Button variant="outline" onClick={load} loading={refreshing} loadingLabel="Refreshing">
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="mt-3" padding="sm">
          <p className="text-xs text-bad">{error}</p>
        </Card>
      )}

      <section className="mt-4">
        <SectionHeader
          label="the portfolio"
          description={opened ? `Opened ${opened} with ${formatCurrency(data!.startingCash)}. The S&P 500 line is what the same money would be worth had it all gone into SPY that day.` : undefined}
        />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard card label="Starting cash" value={data ? formatCurrency(data.startingCash) : "..."} />
          <StatCard
            card
            label="Account value"
            term="equity"
            value={data ? formatCurrency(data.equity) : "..."}
            hint={data && <Change value={data.equity} base={data.startingCash} />}
          />
          <StatCard card label="Cash" value={data ? formatCurrency(data.cash) : "..."} />
          <StatCard
            card
            label="Same $ in SPY"
            value={data ? formatCurrency(data.spyEquity) : "..."}
            hint={data && <Change value={data.spyEquity} base={data.startingCash} />}
          />
        </div>
        {data && <PortfolioChart history={data.history} />}
      </section>

      <Card as="section" className="mt-4">
        <SectionHeader
          label="risk metrics"
          description={
            risk
              ? `Based on ${risk.periodDays} trading days since the account opened. On this short a window Sharpe and beta are noisy, treat them as directional, not precise.`
              : data
                ? "Shown once the account has a few trading days of history."
                : undefined
          }
        />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Sharpe Ratio"
            term="sharpe"
            value={risk ? formatRatio(risk.sharpe) : "..."}
            hint={
              risk && (
                <StatusBadge rating={risk.sharpe >= 0 ? "good" : "bad"} label={risk.sharpe >= 0 ? "Positive" : "Negative"} />
              )
            }
          />
          <StatCard label="Volatility (ann.)" term="volatility" value={risk ? formatPercent(risk.annualizedVolatility) : "..."} />
          <StatCard label="Max Drawdown" term="drawdown" value={risk ? formatPercent(risk.maxDrawdown) : "..."} />
          <StatCard label="Beta vs SPY" term="beta" value={risk ? formatRatio(risk.beta) : "..."} />
        </div>
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader
          label="the algorithm"
          description={
            !data
              ? undefined
              : data.algo.live
              ? `Trading on its own every 15 minutes while the market is open.${data.algo.lastCheck ? ` Last check ${new Date(data.algo.lastCheck.ranAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}: ${data.algo.lastCheck.note}` : ""}`
              : "Built and checking the market, but not switched on yet: it reports what it would do and places nothing."
          }
        />
        <ul className="mt-3 max-w-2xl list-disc space-y-1 pl-4 text-xs leading-5 text-zinc-400">
          <li>
            Scores each stock from the Research Signals: Congress members&apos; disclosed trades (more buyers, no
            sellers and committee oversight score higher), the latest 10-K&apos;s story, and the President&apos;s trades.
          </li>
          <li>
            Buys a score of {RULES.entryScore} or more, only while the price is above its 50- and 200-day averages, about{" "}
            {RULES.positionWeight * 100}% of the account each, at most {RULES.maxPositions} stocks.
          </li>
          <li>
            Sells at {RULES.stopLoss * 100}% below cost, {RULES.trailingStop * 100}% below its high since buying, when the price
            falls under its 200-day average, or when the score drops below {RULES.holdScore}.
          </li>
          <li>Paper money and educational, not investment advice. Congress trades are disclosed up to 45 days late.</li>
        </ul>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className={tableHeadCellClass}>Time</th>
                <th className={tableHeadCellClass}>Side</th>
                <th className={tableHeadCellClass}>Symbol</th>
                <th className={`${tableHeadCellClass} text-right`}>Qty</th>
                <th className={`${tableHeadCellClass} text-right`}>Price</th>
                <th className={`${tableHeadCellClass} pl-4`}>Why</th>
              </tr>
            </thead>
            <tbody>
              {data?.algo.recent.map((o, i) => (
                <tr key={`${o.ranAt}-${o.symbol}-${i}`} className={tableRowClass}>
                  <td className={`${tableCellClass} whitespace-nowrap`}>
                    {new Date(o.ranAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </td>
                  <td className={`${tableCellClass} caps ${o.side === "buy" ? "text-good" : "text-bad"}`}>{o.side}</td>
                  <td className="py-1 text-xs text-foreground">{o.symbol}</td>
                  <td className={`${tableCellStrongClass} text-right`}>{o.qty}</td>
                  <td className={`${tableCellClass} text-right`}>{formatCurrency(o.price)}</td>
                  <td className={`${tableCellClass} min-w-[220px] pl-4`}>{o.reason}</td>
                </tr>
              ))}
              {data && data.algo.recent.length === 0 && <EmptyRow colSpan={6}>no algorithm trades yet</EmptyRow>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader label="open positions" />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className={tableHeadCellClass}>Symbol</th>
                <th className={`${tableHeadCellClass} text-right`}>Qty</th>
                <th className={`${tableHeadCellClass} text-right`}>
                  <Term term="avgEntry">Avg Cost</Term>
                </th>
                <th className={`${tableHeadCellClass} text-right`}>Current</th>
                <th className={`${tableHeadCellClass} text-right`}>Value</th>
                <th className={`${tableHeadCellClass} text-right`}>
                  <Term term="pnl">P&L</Term>
                </th>
              </tr>
            </thead>
            <tbody>
              {data?.positions.map((p) => (
                <tr key={p.symbol} className={tableRowClass}>
                  <td className="py-1 text-xs text-foreground">{p.symbol}</td>
                  <td className={`${tableCellClass} text-right`}>{p.qty}</td>
                  <td className={`${tableCellClass} text-right`}>{formatCurrency(p.avgCost)}</td>
                  <td className={`${tableCellStrongClass} text-right`}>{formatCurrency(p.price)}</td>
                  <td className={`${tableCellClass} text-right`}>{formatCurrency(p.marketValue)}</td>
                  <td
                    className="py-1 text-right text-xs tabular-nums"
                    style={{ color: `var(--status-${p.unrealizedPl >= 0 ? "good" : "bad"})` }}
                  >
                    {p.unrealizedPl >= 0 ? "+" : ""}
                    {formatCurrency(p.unrealizedPl)}
                    <span className="ml-1.5 opacity-70">{formatPercent(p.unrealizedPlPct, { decimals: 2 })}</span>
                  </td>
                </tr>
              ))}
              {data && data.positions.length === 0 && <EmptyRow colSpan={6}>no open positions</EmptyRow>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader label="trade history" />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className={tableHeadCellClass}>Symbol</th>
                <th className={tableHeadCellClass}>Side</th>
                <th className={`${tableHeadCellClass} text-right`}>Qty</th>
                <th className={`${tableHeadCellClass} text-right`}>Price</th>
                <th className={`${tableHeadCellClass} text-right`}>Time</th>
              </tr>
            </thead>
            <tbody>
              {/* buildPortfolio() already returns these newest first. */}
              {data?.trades.map((t) => (
                  <tr key={t.id} className={tableRowClass}>
                    <td className="py-1 text-xs text-foreground">{t.symbol}</td>
                    <td className={`${tableCellClass} caps ${t.side === "buy" ? "text-good" : "text-bad"}`}>{t.side}</td>
                    <td className={`${tableCellStrongClass} text-right`}>{t.qty}</td>
                    <td className={`${tableCellClass} text-right`}>{formatCurrency(t.price)}</td>
                    <td className={`${tableCellClass} whitespace-nowrap text-right`}>{new Date(t.executedAt).toLocaleString()}</td>
                  </tr>
                ))}
              {data && data.trades.length === 0 && <EmptyRow colSpan={5}>no trades yet</EmptyRow>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader label="your own account" />
        <p className="mt-3 max-w-2xl text-xs leading-5 text-zinc-400">
          Want to try it?{" "}
          <Link href="/dashboard#portfolio" className="text-accent underline decoration-accent/40 underline-offset-4">
            Sign in
          </Link>{" "}
          and you get your own $100,000 paper account to trade, a trade journal, and automated strategies, all private to you.
        </p>
      </Card>
    </PageShell>
  );
}
