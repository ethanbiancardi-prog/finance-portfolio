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
  loading: () => <div className="mt-4 h-64 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />,
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
    setAnalysisLoading(true);
    setAnalysisError("");
    setAnalysis(null);

    const res = await fetch("/api/paper-trading/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: analysisTicker }),
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
      <section className="mt-8 grid grid-cols-2 gap-4">
        <StatCard card size="lg" label="Equity" value={account ? formatCurrency(account.equity) : "..."} />
        <StatCard
          card
          size="lg"
          label="Buying Power"
          value={account ? formatCurrency(account.buying_power) : "..."}
        />
      </section>

      <section className="mt-8">
        <SectionHeader label="equity (last month)" />
        <Chart equityHistory={equityHistory} />
      </section>

      <section className="mt-8">
        <SectionHeader
          label="risk metrics"
          description={
            riskMetrics
              ? `Based on ~${riskMetrics.periodDays} trading days — Sharpe/beta on this short a window are noisy, treat as directional, not precise.`
              : undefined
          }
        />
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
      </section>

      <section className="mt-8">
        <SectionHeader label="open positions" />
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className={tableHeadRowClass}>
              <th className={tableHeadCellClass}>Symbol</th>
              <th className={tableHeadCellClass}>Qty</th>
              <th className={tableHeadCellClass}>Avg Entry</th>
              <th className={tableHeadCellClass}>Current</th>
              <th className={tableHeadCellClass}>P&L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const pl = Number(p.unrealized_pl);
              const plRating: Rating = pl >= 0 ? "good" : "bad";
              return (
                <tr key={p.symbol} className={tableRowClass}>
                  <td className="py-2">
                    <span className="tabular-nums text-black dark:text-zinc-50">{p.symbol}</span>
                    {p.name && <span className="block text-xs text-zinc-500">{p.name}</span>}
                  </td>
                  <td className={tableCellClass}>{p.qty}</td>
                  <td className={tableCellClass}>{formatCurrency(p.avg_entry_price)}</td>
                  <td className={tableCellClass}>{formatCurrency(p.current_price)}</td>
                  <td
                    className="py-2 tabular-nums"
                    style={{ color: `var(--status-${plRating})` }}
                  >
                    {formatCurrency(p.unrealized_pl)} (
                    {formatPercent(Number(p.unrealized_plpc), { decimals: 2 })})
                  </td>
                </tr>
              );
            })}
            {positions.length === 0 && <EmptyRow colSpan={5}>No open positions.</EmptyRow>}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <SectionHeader label="trade journal" />
        <table className="mt-4 w-full text-left text-sm">
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
              <tr key={entry.id} className={tableRowClass}>
                <td className={tableCellClass}>{entry.date}</td>
                <td className={tableCellStrongClass}>{entry.ticker}</td>
                <td className={tableCellClass}>{entry.action}</td>
                <td className={tableCellClass}>{entry.thesis}</td>
                <td className={tableCellClass}>{entry.exitCondition}</td>
              </tr>
            ))}
            {journal.length === 0 && <EmptyRow colSpan={5}>No journal entries yet.</EmptyRow>}
          </tbody>
        </table>

        <form onSubmit={submitJournalEntry} className="mt-4 flex flex-wrap items-end gap-3">
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
      </section>

      <section className="mt-8">
        <SectionHeader label="recent orders" />
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className={tableHeadRowClass}>
              <th className={tableHeadCellClass}>Symbol</th>
              <th className={tableHeadCellClass}>Side</th>
              <th className={tableHeadCellClass}>Qty</th>
              <th className={tableHeadCellClass}>Status</th>
              <th className={tableHeadCellClass}>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className={tableRowClass}>
                <td className="py-2">
                  <span className="tabular-nums text-black dark:text-zinc-50">{o.symbol}</span>
                  {o.name && <span className="block text-xs text-zinc-500">{o.name}</span>}
                </td>
                <td className={tableCellClass}>{o.side}</td>
                <td className={tableCellClass}>{o.qty}</td>
                <td className={tableCellClass}>{o.status}</td>
                <td className={tableCellClass}>{new Date(o.submitted_at).toLocaleString()}</td>
              </tr>
            ))}
            {orders.length === 0 && <EmptyRow colSpan={5}>No orders yet.</EmptyRow>}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <SectionHeader label="place order" />
        {/* Market order = buy/sell immediately at the current price. A limit order
            (not implemented in Phase 1) only fills at a price you set or better. */}
        <form onSubmit={submitOrder} className="mt-4 flex flex-wrap items-end gap-3">
          <Field
            label="Ticker"
            placeholder="AAPL"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            required
            className="w-24"
          />
          <Field
            label="Qty"
            placeholder="1"
            type="number"
            min="1"
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
          <Button type="submit">Submit</Button>
        </form>
        {message && <p className="mt-3 text-sm text-zinc-500">{message}</p>}
      </section>

      <section className="mt-8">
        <SectionHeader label="ai analysis" />
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Six takes on a ticker, then the sharpest disagreement between them.
        </p>
        <form onSubmit={submitAnalysis} className="mt-4 flex items-end gap-3">
          <Field
            label="Ticker"
            placeholder="AAPL"
            value={analysisTicker}
            onChange={(e) => setAnalysisTicker(e.target.value)}
            required
            className="w-32"
          />
          <Button type="submit" loading={analysisLoading} loadingLabel="Analyzing...">
            Analyze
          </Button>
        </form>

        {analysisError && <p className="mt-3 text-sm text-red-500">{analysisError}</p>}

        {analysis && (
          <div className="mt-4 space-y-3">
            {analysis.personas.map((p) => (
              <Card key={p.name} padding="sm">
                <p className="text-sm font-medium text-black dark:text-zinc-50">{p.name}</p>
                <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{p.take}</p>
              </Card>
            ))}
            <Callout label="key disagreement">{analysis.key_disagreement}</Callout>
          </div>
        )}
      </section>
    </PageShell>
  );
}
