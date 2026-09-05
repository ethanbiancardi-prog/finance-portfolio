"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatPercent, formatRatio } from "@/lib/format";
import {
  Button,
  Card,
  PageShell,
  SectionHeader,
  StatCard,
  StatusBadge,
  tableCellClass,
  tableCellStrongClass,
  tableHeadCellClass,
  tableHeadRowClass,
  tableRowClass,
  EmptyRow,
} from "@/components/ui";

type SectorKey = "tech" | "biotech" | "consumer";

type Pick = {
  symbol: string;
  sector: SectorKey;
  trailingReturn: number;
  volatility: number;
  momentumScore: number;
  lastPrice: number;
  weight: number;
  capped: boolean;
};

type RebalanceRecord = {
  month: string;
  ranAt: string;
  positions: { symbol: string; sector: SectorKey; qty: number; weight: number }[];
  sleeveDollars: number;
};

type Status = {
  asOf: string;
  sleeveDollars: number;
  picks: Pick[];
  lastRebalance: RebalanceRecord | null;
};

type Order = {
  id: string;
  symbol: string;
  qty: string;
  side: string;
  status: string;
  submitted_at: string;
  client_order_id?: string;
};

const SECTOR_LABEL: Record<SectorKey, string> = {
  tech: "Tech",
  biotech: "Biotech",
  consumer: "Consumer",
};

export default function SectorRotation() {
  const [status, setStatus] = useState<Status | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [statusRes, ordersRes] = await Promise.all([
        fetch("/api/rotation/status"),
        fetch("/api/paper-trading/orders?limit=100"),
      ]);
      if (!statusRes.ok) throw new Error("Failed to load rotation status");
      setStatus(await statusRes.json());
      setOrders(await ordersRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount
    load();
  }, []);

  async function runNow() {
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/rotation/run", { method: "POST" });
      if (!res.ok) throw new Error("Rebalance run failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rebalance run failed");
    } finally {
      setRunning(false);
    }
  }

  const rotationOrders = orders.filter((o) => o.client_order_id?.startsWith("rotation-"));

  return (
    <PageShell
      eyebrow="sector rotation"
      title="Sector Rotation"
      description="Every month, ranks stocks in tech, biotech, and consumer by risk-adjusted price momentum, picks the top 2 per sector, caps any single position at 20% of the sleeve, and rebalances automatically via a scheduled job on the Alpaca paper account."
    >
      {loading && <p className="mt-8 text-sm text-zinc-500">Loading...</p>}
      {error && <p className="mt-8 text-sm text-red-500">{error}</p>}

      {status && (
        <>
          <section className="mt-8 grid grid-cols-2 gap-4">
            <StatCard card size="lg" label="Rotation Sleeve" value={formatCurrency(status.sleeveDollars)} />
            <StatCard
              card
              size="lg"
              label="Last Rebalance"
              value={status.lastRebalance ? status.lastRebalance.month : "Never run"}
              hint={
                status.lastRebalance && (
                  <span className="text-xs text-zinc-500">
                    {new Date(status.lastRebalance.ranAt).toLocaleString()}
                  </span>
                )
              }
            />
          </section>

          <section className="mt-8">
            <SectionHeader
              label="current picks"
              description="Momentum score = trailing return ÷ volatility over the lookback window — a risk-adjusted rank, not a raw return."
            />
            <div className="mt-4 space-y-4">
              {(["tech", "biotech", "consumer"] as SectorKey[]).map((sector) => {
                const picks = status.picks.filter((p) => p.sector === sector);
                if (picks.length === 0) return null;
                return (
                  <Card key={sector} padding="sm">
                    <p className="text-sm font-medium text-black dark:text-zinc-50">
                      {SECTOR_LABEL[sector]}
                    </p>
                    <table className="mt-3 w-full text-left text-sm">
                      <thead>
                        <tr className={tableHeadRowClass}>
                          <th className={tableHeadCellClass}>Symbol</th>
                          <th className={tableHeadCellClass}>Trailing Return</th>
                          <th className={tableHeadCellClass}>Volatility</th>
                          <th className={tableHeadCellClass}>Momentum Score</th>
                          <th className={tableHeadCellClass}>Target Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {picks.map((p) => (
                          <tr key={p.symbol} className={tableRowClass}>
                            <td className={tableCellStrongClass}>{p.symbol}</td>
                            <td className={tableCellClass}>{formatPercent(p.trailingReturn)}</td>
                            <td className={tableCellClass}>{formatPercent(p.volatility)}</td>
                            <td className={tableCellClass}>{formatRatio(p.momentumScore)}</td>
                            <td className={tableCellClass}>
                              <span className="inline-flex items-center gap-1.5">
                                {formatPercent(p.weight)}
                                {p.capped && <StatusBadge rating="average" label="Capped at 20%" />}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                );
              })}
              {status.picks.length === 0 && (
                <p className="text-sm text-zinc-500">No candidates scored yet.</p>
              )}
            </div>
          </section>

          <section className="mt-8">
            <SectionHeader label="rebalance history" description="Orders placed by this strategy, tagged and filtered from the paper account's order history." />
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
                {rotationOrders.map((o) => (
                  <tr key={o.id} className={tableRowClass}>
                    <td className={tableCellStrongClass}>{o.symbol}</td>
                    <td className={tableCellClass}>{o.side}</td>
                    <td className={tableCellClass}>{o.qty}</td>
                    <td className={tableCellClass}>{o.status}</td>
                    <td className={tableCellClass}>{new Date(o.submitted_at).toLocaleString()}</td>
                  </tr>
                ))}
                {rotationOrders.length === 0 && <EmptyRow colSpan={5}>No rebalance orders yet.</EmptyRow>}
              </tbody>
            </table>
          </section>

          <section className="mt-8">
            <SectionHeader label="run rebalance" description="Manually trigger the same rebalance the scheduled job runs monthly — useful for demos." />
            <Button className="mt-4" loading={running} loadingLabel="Running..." onClick={runNow}>
              Run Rebalance Now
            </Button>
          </section>
        </>
      )}
    </PageShell>
  );
}
