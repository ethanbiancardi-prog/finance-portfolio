"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { formatCurrency, formatPercent, formatRatio } from "@/lib/format";
import {
  Button,
  Callout,
  Card,
  Field,
  PageShell,
  SectionHeader,
  SelectField,
  StatCard,
  StatusBadge,
  TickerSearch,
  tableCellClass,
  tableCellStrongClass,
  tableHeadCellClass,
  tableHeadRowClass,
  tableRowClass,
  EmptyRow,
  type Rating,
} from "@/components/ui";

const Chart = dynamic(() => import("./Chart"), {
  ssr: false,
  loading: () => <div className="mt-4 h-64 animate-pulse bg-border" />,
});

type Account = {
  equity: string;
  buying_power: string;
};

type Position = {
  symbol: string;
  name?: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  unrealized_pl: string;
  unrealized_plpc: string;
};

type Order = {
  id: string;
  symbol: string;
  name?: string;
  qty: string;
  side: string;
  status: string;
  submitted_at: string;
};

type EquityPoint = {
  date: string;
  equity: number;
};

type JournalEntry = {
  id: string;
  date: string;
  ticker: string;
  action: "buy" | "sell";
  thesis: string;
  exitCondition: string;
};

const today = () => new Date().toISOString().slice(0, 10);

type PortfolioHistory = {
  timestamp: number[];
  equity: (number | null)[];
};

type PersonaTake = {
  name: string;
  take: string;
};

type Analysis = {
  personas: PersonaTake[];
  key_disagreement: string;
};

type RiskMetrics = {
  sharpe: number;
  annualizedVolatility: number;
  maxDrawdown: number;
  beta: number;
  periodDays: number;
};

export default function PaperTrading() {
  const [account, setAccount] = useState<Account | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [equityHistory, setEquityHistory] = useState<EquityPoint[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics | null>(null);
  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [message, setMessage] = useState("");

  const [analysisTicker, setAnalysisTicker] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  const [journalDate, setJournalDate] = useState(today());
  const [journalTicker, setJournalTicker] = useState("");
  const [journalAction, setJournalAction] = useState<"buy" | "sell">("buy");
  const [journalThesis, setJournalThesis] = useState("");
  const [journalExit, setJournalExit] = useState("");

  async function loadAll() {
    const [accountRes, positionsRes, ordersRes, historyRes, journalRes, riskMetricsRes] =
      await Promise.all([
        fetch("/api/paper-trading/account"),
        fetch("/api/paper-trading/positions"),
        fetch("/api/paper-trading/orders"),
        fetch("/api/paper-trading/history"),
        fetch("/api/paper-trading/journal"),
        fetch("/api/paper-trading/risk-metrics"),
      ]);
    setAccount(await accountRes.json());
    setPositions(await positionsRes.json());
    setOrders(await ordersRes.json());
    setJournal(await journalRes.json());
    setRiskMetrics(await riskMetricsRes.json());

    const history: PortfolioHistory = await historyRes.json();
    setEquityHistory(
      history.timestamp
        .map((t, i) => ({ t, equity: history.equity[i] }))
        .filter((point): point is { t: number; equity: number } => point.equity != null)
        .map((point) => ({
          date: new Date(point.t * 1000).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          equity: point.equity,
        })),
    );
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount
    loadAll();
  }, []);

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    setMessage("Submitting...");

    const res = await fetch("/api/paper-trading/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: symbol.toUpperCase(), qty, side }),
    });

    if (!res.ok) {
      setMessage(`Order failed: ${await res.text()}`);
      return;
    }

    setMessage(`Order submitted: ${side} ${qty} ${symbol.toUpperCase()}`);
    setSymbol("");
    setQty("");
    loadAll();
  }

  async function submitJournalEntry(e: React.FormEvent) {
    e.preventDefault();

    const res = await fetch("/api/paper-trading/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: journalDate,
        ticker: journalTicker,
        action: journalAction,
        thesis: journalThesis,
        exitCondition: journalExit,
      }),
    });

    const entry = await res.json();
    setJournal([entry, ...journal]);
    setJournalTicker("");
    setJournalThesis("");
    setJournalExit("");
  }

  async function submitAnalysis(e: React.FormEvent) {
    e.preventDefault();
    runAnalysis(analysisTicker);
  }

  async function runAnalysis(ticker: string) {
    setAnalysisLoading(true);
    setAnalysisError("");
    setAnalysis(null);

    const res = await fetch("/api/paper-trading/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker }),
    });

    if (!res.ok) {
      setAnalysisError("Analysis failed.");
      setAnalysisLoading(false);
      return;
    }

    setAnalysis(await res.json());
    setAnalysisLoading(false);
  }

  return (
    <PageShell
      eyebrow="paper trading"
      title="Paper Trading"
      description="Live fake-money account via Alpaca's paper trading API."
    >
      {/* Equity is total account value (cash + position value). Buying power is
          how much you can spend right now — it can exceed cash on hand because
          a margin account lets you borrow against your equity. */}
      <section className="mt-4 grid grid-cols-2 gap-3">
        <StatCard card size="lg" label="Equity" value={account ? formatCurrency(account.equity) : "..."} />
        <StatCard
          card
          size="lg"
          label="Buying Power"
          value={account ? formatCurrency(account.buying_power) : "..."}
        />
      </section>

      <Card as="section" className="mt-4">
        <SectionHeader
          label="risk metrics"
          description={
            riskMetrics
              ? `Based on ~${riskMetrics.periodDays} trading days — Sharpe/beta on this short a window are noisy, treat as directional, not precise.`
              : undefined
          }
        />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Sharpe Ratio"
            value={riskMetrics ? formatRatio(riskMetrics.sharpe) : "..."}
            hint={
              riskMetrics && (
                <StatusBadge
                  rating={riskMetrics.sharpe >= 0 ? "good" : "bad"}
                  label={riskMetrics.sharpe >= 0 ? "Positive" : "Negative"}
                />
              )
            }
          />
          <StatCard
            label="Volatility (ann.)"
            value={riskMetrics ? formatPercent(riskMetrics.annualizedVolatility) : "..."}
          />
          <StatCard
            label="Max Drawdown"
            value={riskMetrics ? formatPercent(riskMetrics.maxDrawdown) : "..."}
          />
          <StatCard label="Beta vs SPY" value={riskMetrics ? formatRatio(riskMetrics.beta) : "..."} />
        </div>
      </Card>

      <section className="mt-4">
        <SectionHeader label="equity (last month)" />
        <Chart equityHistory={equityHistory} />
      </section>

      <Card as="section" className="mt-4">
        <SectionHeader label="open positions" />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className={tableHeadCellClass}>Symbol</th>
                <th className={`${tableHeadCellClass} text-right`}>Qty</th>
                <th className={`${tableHeadCellClass} text-right`}>Avg Entry</th>
                <th className={`${tableHeadCellClass} text-right`}>Current</th>
                <th className={`${tableHeadCellClass} text-right`}>P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const pl = Number(p.unrealized_pl);
                const plRating: Rating = pl >= 0 ? "good" : "bad";
                return (
                  <tr key={p.symbol} className={tableRowClass}>
                    <td className="py-1">
                      <span className="text-xs text-foreground">{p.symbol}</span>
                      {p.name && <span className="block text-[10px] text-zinc-600">{p.name}</span>}
                    </td>
                    <td className={`${tableCellClass} text-right`}>{p.qty}</td>
                    <td className={`${tableCellClass} text-right`}>{formatCurrency(p.avg_entry_price)}</td>
                    <td className={`${tableCellStrongClass} text-right`}>{formatCurrency(p.current_price)}</td>
                    <td
                      className="py-1 text-right text-xs tabular-nums"
                      style={{ color: `var(--status-${plRating})` }}
                    >
                      {pl >= 0 ? "+" : ""}
                      {formatCurrency(p.unrealized_pl)}
                      <span className="ml-1.5 opacity-70">
                        {formatPercent(Number(p.unrealized_plpc), { decimals: 2 })}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {positions.length === 0 && <EmptyRow colSpan={5}>no open positions</EmptyRow>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader label="trade journal" />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className={tableHeadCellClass}>Date</th>
                <th className={tableHeadCellClass}>Ticker</th>
                <th className={tableHeadCellClass}>Action</th>
                <th className={tableHeadCellClass}>Thesis</th>
                <th className={tableHeadCellClass}>Exit Condition</th>
              </tr>
            </thead>
            <tbody>
              {journal.map((entry) => (
                <tr key={entry.id} className={`${tableRowClass} align-top`}>
                  <td className={`${tableCellClass} whitespace-nowrap pr-3`}>{entry.date}</td>
                  <td className={`${tableCellStrongClass} pr-3`}>{entry.ticker}</td>
                  <td className={`${tableCellClass} pr-3 uppercase ${entry.action === "buy" ? "text-good" : "text-bad"}`}>
                    {entry.action}
                  </td>
                  <td className={`${tableCellClass} pr-3 leading-4`}>{entry.thesis}</td>
                  <td className={`${tableCellClass} leading-4`}>{entry.exitCondition}</td>
                </tr>
              ))}
              {journal.length === 0 && <EmptyRow colSpan={5}>no journal entries yet</EmptyRow>}
            </tbody>
          </table>
        </div>

        <form onSubmit={submitJournalEntry} className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <Field
            label="Date"
            type="date"
            value={journalDate}
            onChange={(e) => setJournalDate(e.target.value)}
            required
            className="w-auto"
          />
          <Field
            label="Ticker"
            placeholder="AAPL"
            value={journalTicker}
            onChange={(e) => setJournalTicker(e.target.value)}
            required
            className="w-24"
          />
          <SelectField
            label="Action"
            value={journalAction}
            onChange={(e) => setJournalAction(e.target.value as "buy" | "sell")}
            options={[
              { value: "buy", label: "Buy" },
              { value: "sell", label: "Sell" },
            ]}
          />
          <Field
            label="Thesis (one line)"
            placeholder="Why this trade"
            value={journalThesis}
            onChange={(e) => setJournalThesis(e.target.value)}
            required
            wrapperClassName="min-w-40 flex-1"
          />
          <Field
            label="Exit Condition"
            placeholder="What makes you sell"
            value={journalExit}
            onChange={(e) => setJournalExit(e.target.value)}
            required
            wrapperClassName="min-w-40 flex-1"
          />
          <Button type="submit">Add Entry</Button>
        </form>
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader label="recent orders" />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className={tableHeadCellClass}>Symbol</th>
                <th className={tableHeadCellClass}>Side</th>
                <th className={`${tableHeadCellClass} text-right`}>Qty</th>
                <th className={`${tableHeadCellClass} pl-4`}>Status</th>
                <th className={`${tableHeadCellClass} text-right`}>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className={tableRowClass}>
                  <td className="py-1">
                    <span className="text-xs text-foreground">{o.symbol}</span>
                    {o.name && <span className="block text-[10px] text-zinc-600">{o.name}</span>}
                  </td>
                  <td className={`${tableCellClass} uppercase ${o.side === "buy" ? "text-good" : "text-bad"}`}>{o.side}</td>
                  <td className={`${tableCellStrongClass} text-right`}>{o.qty}</td>
                  <td className={`${tableCellClass} pl-4 text-[10px] uppercase tracking-[0.08em]`}>{o.status}</td>
                  <td className={`${tableCellClass} whitespace-nowrap text-right`}>{new Date(o.submitted_at).toLocaleString()}</td>
                </tr>
              ))}
              {orders.length === 0 && <EmptyRow colSpan={5}>no orders yet</EmptyRow>}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card as="section">
          <SectionHeader label="place order" description="Market order — fills immediately at the current price." />
          {/* Market order = buy/sell immediately at the current price. A limit order
              (not implemented in Phase 1) only fills at a price you set or better. */}
          <form onSubmit={submitOrder} className="mt-3 flex flex-wrap items-end gap-3">
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
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
              className="w-16"
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
            <Button type="submit">Submit</Button>
          </form>
          {message && (
            <p className="mt-3 text-xs text-zinc-400">
              <span className="text-zinc-600">&gt; </span>
              {message}
            </p>
          )}
        </Card>

        <Card as="section">
          <SectionHeader
            label="ai analysis"
            description="Six takes on a ticker, then the sharpest disagreement between them."
          />
          <form onSubmit={submitAnalysis} className="mt-3 flex items-end gap-3">
            <TickerSearch
              label="Ticker"
              value={analysisTicker}
              onChange={setAnalysisTicker}
              onSelect={runAnalysis}
              endpoint="/api/paper-trading/search"
              required
              wrapperClassName="w-40"
            />
            <Button type="submit" loading={analysisLoading} loadingLabel="Analyzing...">
              Analyze
            </Button>
          </form>
          {analysisError && <p className="mt-3 text-xs text-bad">{analysisError}</p>}
        </Card>
      </div>

      {analysis && (
        <section className="mt-4">
          <SectionHeader label={`analysis: ${analysisTicker.toUpperCase() || "ticker"}`} />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {analysis.personas.map((p) => (
              <Card key={p.name} padding="sm">
                <p className="text-[10px] uppercase tracking-[0.14em] text-accent">{p.name}</p>
                <p className="mt-1.5 text-xs leading-5 text-zinc-400">{p.take}</p>
              </Card>
            ))}
          </div>
          <Callout label="key disagreement" className="mt-3">
            {analysis.key_disagreement}
          </Callout>
        </section>
      )}
    </PageShell>
  );
}
