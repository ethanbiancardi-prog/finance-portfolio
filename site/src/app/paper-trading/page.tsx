"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Account = {
  equity: string;
  buying_power: string;
};

type Position = {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  unrealized_pl: string;
  unrealized_plpc: string;
};

type Order = {
  id: string;
  symbol: string;
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

const money = (value: string) =>
  Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });

const compactMoney = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  });

export default function PaperTrading() {
  const [account, setAccount] = useState<Account | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [equityHistory, setEquityHistory] = useState<EquityPoint[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [message, setMessage] = useState("");

  const [journalDate, setJournalDate] = useState(today());
  const [journalTicker, setJournalTicker] = useState("");
  const [journalAction, setJournalAction] = useState<"buy" | "sell">("buy");
  const [journalThesis, setJournalThesis] = useState("");
  const [journalExit, setJournalExit] = useState("");

  async function loadAll() {
    const [accountRes, positionsRes, ordersRes, historyRes, journalRes] = await Promise.all([
      fetch("/api/paper-trading/account"),
      fetch("/api/paper-trading/positions"),
      fetch("/api/paper-trading/orders"),
      fetch("/api/paper-trading/history"),
      fetch("/api/paper-trading/journal"),
    ]);
    setAccount(await accountRes.json());
    setPositions(await positionsRes.json());
    setOrders(await ordersRes.json());
    setJournal(await journalRes.json());

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

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-20 sm:py-28">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Paper Trading
        </h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Live fake-money account via Alpaca&apos;s paper trading API.
        </p>

        {/* Equity is total account value (cash + position value). Buying power is
            how much you can spend right now — it can exceed cash on hand because
            a margin account lets you borrow against your equity. */}
        <section className="mt-10 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-500">Equity</p>
            <p className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
              {account ? money(account.equity) : "..."}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-500">Buying Power</p>
            <p className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">
              {account ? money(account.buying_power) : "..."}
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Equity (Last Month)
          </h2>
          <div className="mt-4 h-64 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={equityHistory}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="var(--chart-muted)"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={30}
                />
                <YAxis
                  stroke="var(--chart-muted)"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  domain={["auto", "auto"]}
                  tickFormatter={(value) => compactMoney(value)}
                />
                <Tooltip
                  formatter={(value) => money(String(value))}
                  contentStyle={{
                    background: "var(--chart-tooltip-bg)",
                    border: "1px solid var(--chart-grid)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="equity"
                  stroke="var(--chart-line)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Open Positions
          </h2>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="text-zinc-500">
                <th className="py-2 font-medium">Symbol</th>
                <th className="py-2 font-medium">Qty</th>
                <th className="py-2 font-medium">Avg Entry</th>
                <th className="py-2 font-medium">Current</th>
                <th className="py-2 font-medium">P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const pl = Number(p.unrealized_pl);
                return (
                  <tr key={p.symbol} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="py-2 text-black dark:text-zinc-50">{p.symbol}</td>
                    <td className="py-2 text-zinc-600 dark:text-zinc-400">{p.qty}</td>
                    <td className="py-2 text-zinc-600 dark:text-zinc-400">
                      {money(p.avg_entry_price)}
                    </td>
                    <td className="py-2 text-zinc-600 dark:text-zinc-400">
                      {money(p.current_price)}
                    </td>
                    <td className={pl >= 0 ? "py-2 text-emerald-600" : "py-2 text-red-500"}>
                      {money(p.unrealized_pl)} ({(Number(p.unrealized_plpc) * 100).toFixed(2)}%)
                    </td>
                  </tr>
                );
              })}
              {positions.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-zinc-500">
                    No open positions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Trade Journal
          </h2>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="text-zinc-500">
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Ticker</th>
                <th className="py-2 font-medium">Action</th>
                <th className="py-2 font-medium">Thesis</th>
                <th className="py-2 font-medium">Exit Condition</th>
              </tr>
            </thead>
            <tbody>
              {journal.map((entry) => (
                <tr key={entry.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{entry.date}</td>
                  <td className="py-2 text-black dark:text-zinc-50">{entry.ticker}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{entry.action}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{entry.thesis}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{entry.exitCondition}</td>
                </tr>
              ))}
              {journal.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-zinc-500">
                    No journal entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <form
            onSubmit={submitJournalEntry}
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            <div>
              <label className="block text-xs text-zinc-500">Date</label>
              <input
                value={journalDate}
                onChange={(e) => setJournalDate(e.target.value)}
                type="date"
                required
                className="mt-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Ticker</label>
              <input
                value={journalTicker}
                onChange={(e) => setJournalTicker(e.target.value)}
                placeholder="AAPL"
                required
                className="mt-1 w-24 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Action</label>
              <select
                value={journalAction}
                onChange={(e) => setJournalAction(e.target.value as "buy" | "sell")}
                className="mt-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            <div className="min-w-40 flex-1">
              <label className="block text-xs text-zinc-500">Thesis (one line)</label>
              <input
                value={journalThesis}
                onChange={(e) => setJournalThesis(e.target.value)}
                placeholder="Why this trade"
                required
                className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </div>
            <div className="min-w-40 flex-1">
              <label className="block text-xs text-zinc-500">Exit Condition</label>
              <input
                value={journalExit}
                onChange={(e) => setJournalExit(e.target.value)}
                placeholder="What makes you sell"
                required
                className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-black"
            >
              Add Entry
            </button>
          </form>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Recent Orders
          </h2>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="text-zinc-500">
                <th className="py-2 font-medium">Symbol</th>
                <th className="py-2 font-medium">Side</th>
                <th className="py-2 font-medium">Qty</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-2 text-black dark:text-zinc-50">{o.symbol}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{o.side}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{o.qty}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{o.status}</td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">
                    {new Date(o.submitted_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-zinc-500">
                    No orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Place Order
          </h2>
          {/* Market order = buy/sell immediately at the current price. A limit order
              (not implemented in Phase 1) only fills at a price you set or better. */}
          <form onSubmit={submitOrder} className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-zinc-500">Ticker</label>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="AAPL"
                required
                className="mt-1 w-24 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Qty</label>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="1"
                type="number"
                min="1"
                required
                className="mt-1 w-20 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500">Side</label>
              <select
                value={side}
                onChange={(e) => setSide(e.target.value as "buy" | "sell")}
                className="mt-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            <button
              type="submit"
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-black"
            >
              Submit
            </button>
          </form>
          {message && <p className="mt-3 text-sm text-zinc-500">{message}</p>}
        </section>
      </main>
    </div>
  );
}
