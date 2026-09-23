"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatPercent, formatRatio } from "@/lib/format";
import { SECTOR_KEYS, SECTORS, type SectorKey as StockSectorKey } from "@/lib/sectors";
import {
  Button,
  Card,
  GeometricLoader,
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

type SectorKey = StockSectorKey | "leveraged" | "indexes";

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

type Regime = { riskOn: boolean; spyClose: number; spySma: number; asOf: string };

type RebalanceRecord = {
  month: string;
  ranAt: string;
  trigger?: "monthly" | "manual" | "regime-change";
  regime?: Regime;
  positions: { symbol: string; sector: SectorKey; name?: string; qty: number; weight: number }[];
  sleeveDollars: number;
};

type Target = { symbol: string; sector: SectorKey; name: string; targetWeight: number; targetQty: number };

type Status = {
  asOf: string;
  equity: number;
  cash: number;
  regime: Regime;
  sleeveDollars: number;
  picks: Pick[];
  leveraged: Target[];
  targets: Target[];
  lastRebalance: RebalanceRecord | null;
};

type RunResult = { blocked: boolean; reason?: string; placedOrders: unknown[]; failedOrders: unknown[] };

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

// Sector display comes from lib/sectors.ts; "indexes" is the strategy's
// extra broad-market bucket. Icon names match sector keys one-to-one.
const SECTOR_ORDER: SectorKey[] = [...SECTOR_KEYS, "leveraged", "indexes"];
const SECTOR_LABEL: Record<SectorKey, string> = {
  ...Object.fromEntries(SECTOR_KEYS.map((k) => [k, SECTORS[k].label])),
  leveraged: "Leveraged Index",
  indexes: "Indexes",
} as Record<SectorKey, string>;
const SECTOR_ICON = (sector: SectorKey): IconName => sector;

const TRIGGER_LABEL = {
  monthly: "Scheduled monthly run",
  manual: "Run by hand from this page",
  "regime-change": "Circuit breaker: regime flipped",
} as const;

export default function SectorRotation() {
  const [status, setStatus] = useState<Status | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState("");

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
      const result: RunResult = await res.json();
      setRunMessage(
        result.blocked
          ? result.reason ?? "Blocked."
          : `Placed ${result.placedOrders.length} orders${result.failedOrders.length ? `, ${result.failedOrders.length} failed` : ""}.`,
      );
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
      eyebrow="automated strategy"
      title="Momentum + Leverage"
      description="An aggressive, rule-based book. 60% of equity goes to the 10 strongest stocks by risk-adjusted momentum across eight sectors (max 3 per sector); 30% to 3x leveraged index ETFs (TQQQ, SOXL); 10% stays in cash. Circuit breaker: if SPY is below its 200-day average, the leveraged sleeve goes to cash and momentum shrinks to 5 names. Rebalanced monthly by a scheduled job on the Alpaca paper account, never on margin."
    >
      {/* Stays mounted after loading ends so the mark can reassemble; the
          loader removes itself once the reconstruct finishes. */}
      <div className="mt-4 text-xs text-zinc-500 empty:mt-0">
        <GeometricLoader loading={loading} size={13} label="Recomputing this month’s picks" />
      </div>
      {error && <p className="mt-4 text-xs text-bad">{error}</p>}

      {status && (
        <>
          <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              card
              size="lg"
              label="Regime"
              value={status.regime.riskOn ? "Risk on" : "Risk off"}
              hint={
                <span className={`block text-[11px] ${status.regime.riskOn ? "text-good" : "text-bad"}`}>
                  SPY {status.regime.spyClose.toFixed(0)} vs 200-day {status.regime.spySma.toFixed(0)}
                  <span className="mt-0.5 block text-zinc-500">Checked every weekday after the close</span>
                </span>
              }
            />
            <StatCard
              card
              size="lg"
              label="Momentum Sleeve"
              value={formatCurrency(status.sleeveDollars)}
              hint={<span className="text-[11px] text-zinc-500">{formatPercent(status.sleeveDollars / status.equity, { decimals: 0 })} of equity</span>}
            />
            <StatCard
              card
              size="lg"
              label="Leveraged Sleeve"
              value={formatCurrency(status.leveraged.reduce((s, t) => s + t.targetWeight * status.equity, 0))}
              hint={
                <span className="text-[11px] text-zinc-500">
                  {status.leveraged.length ? status.leveraged.map((t) => t.symbol).join(" + ") : "in cash (risk off)"}
                </span>
              }
            />
            <StatCard
              card
              size="lg"
              label="Last Rebalance"
              value={status.lastRebalance ? status.lastRebalance.month : "Never run"}
              hint={
                status.lastRebalance && (
                  <span className="block text-[11px] text-zinc-500">
                    {new Date(status.lastRebalance.ranAt).toLocaleString()}
                    {status.lastRebalance.trigger && (
                      <span className="mt-0.5 block">{TRIGGER_LABEL[status.lastRebalance.trigger]}</span>
                    )}
                  </span>
                )
              }
            />
          </section>

          <section className="mt-4">
            <SectionHeader
              label="current picks"
              description="Top 10 across every sector by momentum score = trailing return ÷ volatility over the lookback window, a risk-adjusted rank, not a raw return. Each pick is 6% of equity; the leveraged ETFs are 20% and 10%."
            />
            <div className="mt-3 space-y-2">
              {status.leveraged.length > 0 && (
                <Card padding="sm">
                  <p className="flex items-center gap-2 text-[11px] caps text-foreground">
                    <Icon name="leveraged" className="text-accent" />
                    {SECTOR_LABEL.leveraged}
                  </p>
                  <table className="mt-2 w-full text-left">
                    <thead>
                      <tr className={tableHeadRowClass}>
                        <th className={tableHeadCellClass}>Ticker</th>
                        <th className={`${tableHeadCellClass} text-right`}>Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.leveraged.map((t) => (
                        <tr key={t.symbol} className={tableRowClass}>
                          <td className="py-1">
                            <span className="text-xs text-foreground">{t.symbol}</span>
                            <span className="block text-[10px] text-zinc-600">{t.name}</span>
                          </td>
                          <td className={`${tableCellStrongClass} text-right`}>{formatPercent(t.targetWeight, { decimals: 0 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
              {SECTOR_ORDER.map((sector) => {
                const picks = status.picks.filter((p) => p.sector === sector);
                if (picks.length === 0) return null;
                return (
                  <Card key={sector} padding="sm">
                    <p className="flex items-center gap-2 text-[11px] caps text-foreground">
                      <Icon name={SECTOR_ICON(sector)} className="text-accent" />
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
                                {formatPercent((p.weight * status.sleeveDollars) / status.equity)}
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
                <p className="text-xs text-zinc-500">No candidates scored yet</p>
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
                    <td className={`${tableCellClass} caps ${o.side === "buy" ? "text-good" : "text-bad"}`}>{o.side}</td>
                    <td className={`${tableCellStrongClass} text-right`}>{o.qty}</td>
                    <td className={`${tableCellClass} pl-4 text-[10px] caps-tight`}>{o.status}</td>
                    <td className={`${tableCellClass} whitespace-nowrap text-right`}>{new Date(o.submitted_at).toLocaleString()}</td>
                  </tr>
                ))}
                {rotationOrders.length === 0 && <EmptyRow colSpan={5}>No rebalance orders yet.</EmptyRow>}
              </tbody>
            </table>
          </section>

          <section className="mt-4">
            <SectionHeader
              label="run rebalance"
              description="Manually trigger the same rebalance the scheduled job runs monthly. It refuses to place anything that would need margin, sell positions outside the strategy first."
            />
            <Button className="mt-3" loading={running} loadingLabel="Running..." onClick={runNow}>
              Run Rebalance Now
            </Button>
            {runMessage && <p className="mt-3 max-w-2xl text-xs leading-5 text-zinc-500">{runMessage}</p>}
          </section>
        </>
      )}
    </PageShell>
  );
}
