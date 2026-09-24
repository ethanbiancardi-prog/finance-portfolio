"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  Button,
  Card,
  ChartLoading,
  EmptyRow,
  Field,
  SectionHeader,
  SelectField,
  StatCard,
  Term,
  TickerSearch,
  tableCellClass,
  tableCellStrongClass,
  tableHeadCellClass,
  tableHeadRowClass,
  tableRowClass,
} from "@/components/ui";
import type { PortfolioSummary } from "@/lib/portfolio";

const PortfolioChart = dynamic(() => import("./PortfolioChart"), {
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

export default function Portfolio() {
  const [data, setData] = useState<(PortfolioSummary & { activeStrategy: string | null }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/portfolio");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Could not load your portfolio.");
      return;
    }
    setError(null);
    setData(body);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount, then poll
    load();
    // Prices move while the market is open; match the paper-trading page.
    const timer = setInterval(load, 60_000);
    // The strategy card announces on/off changes so the order form pauses or
    // resumes straight away rather than at the next poll.
    window.addEventListener("strategy-changed", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("strategy-changed", load);
    };
  }, [load]);

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    setPlacing(true);
    setMessage(null);
    // Only symbol, side and quantity are sent. The server looks up the price.
    const res = await fetch("/api/portfolio/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, side, qty: Number(qty) }),
    });
    const body = await res.json().catch(() => ({}));
    setPlacing(false);
    if (!res.ok) {
      setMessage({ text: body.error ?? "The order failed.", ok: false });
      return;
    }
    setMessage({
      text: `Filled: ${body.side} ${Number(body.qty)} ${body.symbol} at ${formatCurrency(body.price)}.`,
      ok: true,
    });
    setSymbol("");
    setQty("");
    load();
  }

  const opened =
    data &&
    new Date(data.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <section className="mt-4" id="portfolio">
      <SectionHeader
        label="your paper portfolio"
        description={
          data
            ? `Every account starts with ${formatCurrency(data.startingCash)} of simulated cash. Opened ${opened}. Compared against putting the same amount into SPY that day.`
            : "Every account starts with $100,000 of simulated cash."
        }
      />

      {error && (
        <Card className="mt-3" padding="sm">
          <p className="text-xs text-bad">{error}</p>
        </Card>
      )}

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

      <Card as="section" className="mt-4">
        <SectionHeader
          label="place order"
          description="Market order at the live price, filled instantly. Only while the market is open."
        />
        {data?.activeStrategy ? (
          <p className="mt-3 max-w-2xl text-xs leading-5 text-zinc-400">
            Manual trading is paused because your strategy,{" "}
            <span className="text-foreground">{data.activeStrategy}</span>, is managing this account. It
            rebalances on its own after the market closes, and any trade placed here would just be undone at
            its next rebalance. Turn it off in the{" "}
            <a href="#strategy" className="text-accent underline decoration-accent/40 underline-offset-4">
              strategy card
            </a>{" "}
            to trade by hand again.
          </p>
        ) : (
        <form onSubmit={placeOrder} className="mt-3 flex flex-wrap items-end gap-3">
          <TickerSearch
            label="Ticker"
            value={symbol}
            onChange={setSymbol}
            onSelect={setSymbol}
            endpoint="/api/paper-trading/search"
            required
            wrapperClassName="w-36"
          />
          <Field
            label="Qty"
            placeholder="1"
            type="number"
            min="1"
            step="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
            className="w-20"
          />
          <SelectField
            label="Side"
            value={side}
            onChange={(e) => setSide(e.target.value as "buy" | "sell")}
            options={[
              { value: "buy", label: "Buy" },
              { value: "sell", label: "Sell" },
            ]}
          />
          <Button type="submit" loading={placing} loadingLabel="Placing">
            Submit
          </Button>
        </form>
        )}
        {message && (
          <p className={`mt-3 text-xs ${message.ok ? "text-good" : "text-bad"}`} role="status">
            <span className="text-zinc-600">&gt; </span>
            {message.text}
          </p>
        )}
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader label="positions" />
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
              {data && data.positions.length === 0 && (
                <EmptyRow colSpan={6}>no positions yet, place an order above</EmptyRow>
              )}
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
              {data?.trades.map((t) => (
                <tr key={t.id} className={tableRowClass}>
                  <td className="py-1 text-xs text-foreground">{t.symbol}</td>
                  <td className={`${tableCellClass} caps ${t.side === "buy" ? "text-good" : "text-bad"}`}>{t.side}</td>
                  <td className={`${tableCellStrongClass} text-right`}>{t.qty}</td>
                  <td className={`${tableCellClass} text-right`}>{formatCurrency(t.price)}</td>
                  <td className={`${tableCellClass} whitespace-nowrap text-right`}>
                    {new Date(t.executedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {data && data.trades.length === 0 && <EmptyRow colSpan={5}>no trades yet</EmptyRow>}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
