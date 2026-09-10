"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatPercent, formatRatio } from "@/lib/format";
import {
  Button,
  Card,
  Icon,
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
  type IconName,
} from "@/components/ui";

type SectorKey = "tech" | "biotech" | "consumer" | "financial" | "healthcare" | "energy" | "indexes";

type Pick = {
  symbol: string;
  sector: SectorKey;
  name: string;
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
  positions: { symbol: string; sector: SectorKey; name?: string; qty: number; weight: number }[];
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
  name?: string;
  qty: string;
  side: string;
  status: string;
  submitted_at: string;
  client_order_id?: string;
};

const SECTOR_ORDER: SectorKey[] = [
  "tech",
  "biotech",
  "consumer",
  "financial",
  "healthcare",
  "energy",
  "indexes",
];

const SECTOR_LABEL: Record<SectorKey, string> = {
  tech: "Tech",
  biotech: "Biotech",
  consumer: "Consumer",
  financial: "Financial",
  healthcare: "Healthcare",
  energy: "Energy",
  indexes: "Indexes",
};

const SECTOR_ICON: Record<SectorKey, IconName> = {
  tech: "tech",
  biotech: "biotech",
  consumer: "consumer",
  financial: "financial",
  healthcare: "healthcare",
  energy: "energy",
  indexes: "indexes",
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
      description="Every month, ranks stocks and index ETFs across tech, biotech, consumer, financial, healthcare, energy, and broad-market indexes by risk-adjusted price momentum, picks the top 2 per sector, caps any single position at 20% of the sleeve, and rebalances automatically via a scheduled job on the Alpaca paper account."
    >
      {loading && <p className="mt-4 text-xs text-zinc-500"><span className="cursor-blink">▌</span> loading</p>}
      {error && <p className="mt-4 text-xs text-bad">{error}</p>}

      {status && (
        <>
          <section className="mt-4 grid grid-cols-2 gap-3">
            <StatCard card size="lg" label="Rotation Sleeve" value={formatCurrency(status.sleeveDollars)} />
            <StatCard
              card
              size="lg"
              label="Last Rebalance"
              value={status.lastRebalance ? status.lastRebalance.month : "Never run"}
              hint={
                status.lastRebalance && (
                  <span className="text-[11px] text-zinc-500">
                    {new Date(status.lastRebalance.ranAt).toLocaleString()}
                  </span>
                )
              }
            />
          </section>

          <section className="mt-4">
            <SectionHeader
              label="current picks"
              description="Momentum score = trailing return ÷ volatility over the lookback window — a risk-adjusted rank, not a raw return."
            />
            <div className="mt-3 space-y-2">
              {SECTOR_ORDER.map((sector) => {
                const picks = status.picks.filter((p) => p.sector === sector);
                if (picks.length === 0) return null;
                return (
                  <Card key={sector} padding="sm">
                    <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-foreground">
                      <Icon name={SECTOR_ICON[sector]} className="text-accent" />
                      {SECTOR_LABEL[sector]}
                    </p>
                    <table className="mt-2 w-full text-left">
                      <thead>
                        <tr className={tableHeadRowClass}>
                          <th className={tableHeadCellClass}>Ticker</th>
                          <th className={`${tableHeadCellClass} text-right`}>Trailing Ret</th>
                          <th className={`${tableHeadCellClass} text-right`}>Vol</th>
                          <th className={`${tableHeadCellClass} text-right`}>Momentum</th>
                          <th className={`${tableHeadCellClass} text-right`}>Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {picks.map((p) => (
                          <tr key={p.symbol} className={tableRowClass}>
                            <td className="py-1">
                              <span className="text-xs text-foreground">{p.symbol}</span>
                              <span className="block text-[10px] text-zinc-600">{p.name}</span>
                            </td>
                            <td className={`${tableCellClass} text-right ${p.trailingReturn >= 0 ? "text-good" : "text-bad"}`}>{formatPercent(p.trailingReturn)}</td>
                            <td className={`${tableCellClass} text-right`}>{formatPercent(p.volatility)}</td>
                            <td className={`${tableCellStrongClass} text-right`}>{formatRatio(p.momentumScore)}</td>
                            <td className={`${tableCellStrongClass} text-right`}>
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
                <p className="text-xs text-zinc-500">-- no candidates scored yet</p>
              )}
            </div>
          </section>

          <section className="mt-4">
            <SectionHeader label="rebalance history" description="Orders placed by this strategy, tagged and filtered from the paper account's order history." />
            <table className="mt-3 w-full text-left">
              <thead>
                <tr className={tableHeadRowClass}>
                  <th className={tableHeadCellClass}>Ticker</th>
                  <th className={tableHeadCellClass}>Side</th>
                  <th className={`${tableHeadCellClass} text-right`}>Qty</th>
                  <th className={`${tableHeadCellClass} pl-4`}>Status</th>
                  <th className={`${tableHeadCellClass} text-right`}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {rotationOrders.map((o) => (
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
                {rotationOrders.length === 0 && <EmptyRow colSpan={5}>No rebalance orders yet.</EmptyRow>}
              </tbody>
            </table>
          </section>

          <section className="mt-4">
            <SectionHeader label="run rebalance" description="Manually trigger the same rebalance the scheduled job runs monthly — useful for demos." />
            <Button className="mt-3" loading={running} loadingLabel="Running..." onClick={runNow}>
              Run Rebalance Now
            </Button>
          </section>
        </>
      )}
    </PageShell>
  );
}
