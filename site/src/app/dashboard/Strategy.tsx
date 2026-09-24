"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";
import {
  Button,
  Card,
  EmptyRow,
  Field,
  SectionHeader,
  SelectField,
  TickerSearch,
  tableCellClass,
  tableCellStrongClass,
  tableHeadCellClass,
  tableHeadRowClass,
  tableRowClass,
} from "@/components/ui";
import { MAX_HOLDINGS, PRESETS, type PlannedOrder, type Rebalance, type StrategyConfig } from "@/lib/strategies";

type Saved = StrategyConfig & { updatedAt: string };
type Row = { symbol: string; weight: string };
type Preview = { equity: number; orders: PlannedOrder[]; cashAfter: number; missingPrices: string[] };

const REBALANCE_LABEL: Record<Rebalance, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  drift: "On drift",
};

const describeRebalance = (c: StrategyConfig) =>
  c.rebalance === "drift" ? `when any holding drifts ${c.driftPct} pts from target` : c.rebalance;

export default function Strategy() {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState("");
  const [presetKey, setPresetKey] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([{ symbol: "", weight: "" }]);
  const [rebalance, setRebalance] = useState<Rebalance>("monthly");
  const [driftPct, setDriftPct] = useState("5");

  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | "remove" | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/portfolio/strategy");
      const body = await res.json().catch(() => ({}));
      if (res.ok) setSaved(body.strategy);
      setLoaded(true);
    })();
  }, []);

  function load(c: StrategyConfig) {
    setName(c.name);
    setPresetKey(c.presetKey);
    setRows(c.holdings.map((h) => ({ symbol: h.symbol, weight: String(h.weight) })));
    setRebalance(c.rebalance);
    setDriftPct(String(c.driftPct ?? 5));
    setPreview(null);
    setMessage(null);
  }

  function startCustom() {
    load({ name: "My strategy", presetKey: null, holdings: [], rebalance: "monthly", driftPct: null });
    setRows([{ symbol: "", weight: "" }]);
  }

  // Editing a preset's holdings makes it a custom strategy.
  function updateRow(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
    setPresetKey(null);
    setPreview(null);
  }

  const config = () => ({
    name,
    presetKey,
    holdings: rows
      .filter((r) => r.symbol.trim())
      .map((r) => ({ symbol: r.symbol.trim().toUpperCase(), weight: Number(r.weight) })),
    rebalance,
    driftPct: rebalance === "drift" ? Number(driftPct) : null,
  });

  const total = rows.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);

  async function send(method: "POST" | "PUT" | "DELETE", cfg: StrategyConfig = config()) {
    setBusy(method === "POST" ? "preview" : method === "PUT" ? "save" : "remove");
    setMessage(null);
    const res = await fetch("/api/portfolio/strategy", {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "DELETE" ? undefined : JSON.stringify(cfg),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setMessage({ text: body.error ?? "Something went wrong.", ok: false });
      return;
    }
    if (method === "POST") setPreview(body);
    if (method === "PUT") {
      setSaved(body.strategy);
      setEditing(false);
      setMessage({ text: `Saved "${body.strategy.name}".`, ok: true });
    }
    if (method === "DELETE") {
      setSaved(null);
      setPreview(null);
      setMessage({ text: "Strategy removed.", ok: true });
    }
  }

  function edit() {
    if (saved) load(saved);
    else startCustom();
    setEditing(true);
  }

  return (
    <Card as="section" className="mt-4" id="strategy">
      <SectionHeader
        label="strategy"
        description="Pick a preset or build your own. For now this saves the strategy and previews the trades it would make; automatic rebalancing comes next."
      />

      {loaded && !editing && (
        <div className="mt-3">
          {saved ? (
            <>
              <p className="text-sm text-foreground">{saved.name}</p>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                {saved.holdings.map((h) => `${h.symbol} ${h.weight}%`).join(" · ")}
                {saved.holdings.reduce((s, h) => s + h.weight, 0) < 100 && " · rest in cash"}
                <span className="text-zinc-600"> — rebalance {describeRebalance(saved)}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={edit}>
                  Edit
                </Button>
                <Button
                  variant="outline"
                  onClick={() => send("POST", saved)}
                  loading={busy === "preview"}
                  loadingLabel="Pricing"
                >
                  Preview trades
                </Button>
                <Button variant="outline" onClick={() => send("DELETE")} loading={busy === "remove"} loadingLabel="Removing">
                  Remove
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-zinc-400">No strategy yet. Start from a preset or build your own.</p>
              <div className="mt-3">
                <Button onClick={edit}>Choose a strategy</Button>
              </div>
            </>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.presetKey}
                type="button"
                onClick={() => load(p)}
                title={p.description}
                className={`rounded-[var(--radius-sm)] border px-2 py-1 text-xs transition-colors ${
                  presetKey === p.presetKey
                    ? "border-accent text-accent"
                    : "border-border text-zinc-400 hover:text-foreground"
                }`}
              >
                {p.name}
              </button>
            ))}
            <button
              type="button"
              onClick={startCustom}
              className={`rounded-[var(--radius-sm)] border px-2 py-1 text-xs transition-colors ${
                presetKey === null ? "border-accent text-accent" : "border-border text-zinc-400 hover:text-foreground"
              }`}
            >
              Custom
            </button>
          </div>
          {presetKey && (
            <p className="text-[11px] leading-5 text-zinc-500">
              {PRESETS.find((p) => p.presetKey === presetKey)?.description} Change any holding to make it your own.
            </p>
          )}

          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="w-64" />

          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <TickerSearch
                  label={i === 0 ? "Ticker" : ""}
                  value={row.symbol}
                  onChange={(v) => updateRow(i, { symbol: v })}
                  onSelect={(v) => updateRow(i, { symbol: v })}
                  endpoint="/api/paper-trading/search"
                  wrapperClassName="w-36"
                />
                <Field
                  label={i === 0 ? "Weight %" : ""}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={row.weight}
                  onChange={(e) => updateRow(i, { weight: e.target.value })}
                  className="w-20"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : [{ symbol: "", weight: "" }]));
                    setPresetKey(null);
                    setPreview(null);
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                disabled={rows.length >= MAX_HOLDINGS}
                onClick={() => setRows((r) => [...r, { symbol: "", weight: "" }])}
              >
                Add holding
              </Button>
              <span className={`text-[11px] tabular-nums ${total > 100 ? "text-bad" : "text-zinc-500"}`}>
                Total {total.toFixed(1)}%{total < 100 && ` · ${(100 - total).toFixed(1)}% stays in cash`}
                {total > 100 && " · can't exceed 100%"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label="Rebalance"
              value={rebalance}
              onChange={(e) => setRebalance(e.target.value as Rebalance)}
              options={(Object.keys(REBALANCE_LABEL) as Rebalance[]).map((k) => ({ value: k, label: REBALANCE_LABEL[k] }))}
            />
            {rebalance === "drift" && (
              <Field
                label="Drift (pts)"
                type="number"
                min="0.5"
                max="50"
                step="0.5"
                value={driftPct}
                onChange={(e) => setDriftPct(e.target.value)}
                className="w-20"
              />
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => send("POST")} loading={busy === "preview"} loadingLabel="Pricing">
              Preview trades
            </Button>
            <Button onClick={() => send("PUT")} loading={busy === "save"} loadingLabel="Saving">
              Save strategy
            </Button>
            <Button variant="outline" onClick={() => { setEditing(false); setPreview(null); setMessage(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p className={`mt-3 text-xs ${message.ok ? "text-good" : "text-bad"}`} role="status">
          <span className="text-zinc-600">&gt; </span>
          {message.text}
        </p>
      )}

      {preview && (
        <div className="mt-4">
          <p className="text-[11px] leading-5 text-zinc-500">
            If this strategy took over your {formatCurrency(preview.equity)} account at today&apos;s prices, it would
            place these orders (whole shares, so about {formatCurrency(preview.cashAfter)} stays in cash). Nothing is
            traded.
            {preview.missingPrices.length > 0 && ` No live price for ${preview.missingPrices.join(", ")}; left out.`}
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead>
                <tr className={tableHeadRowClass}>
                  <th className={tableHeadCellClass}>Symbol</th>
                  <th className={`${tableHeadCellClass} text-right`}>Target</th>
                  <th className={`${tableHeadCellClass} text-right`}>Now</th>
                  <th className={`${tableHeadCellClass} text-right`}>Price</th>
                  <th className={`${tableHeadCellClass} text-right`}>Hold</th>
                  <th className={`${tableHeadCellClass} text-right`}>Order</th>
                </tr>
              </thead>
              <tbody>
                {preview.orders.map((o) => (
                  <tr key={o.symbol} className={tableRowClass}>
                    <td className="py-1 text-xs text-foreground">{o.symbol}</td>
                    <td className={`${tableCellClass} text-right`}>{o.targetWeight.toFixed(1)}%</td>
                    <td className={`${tableCellClass} text-right`}>{o.currentWeight.toFixed(1)}%</td>
                    <td className={`${tableCellClass} text-right`}>{formatCurrency(o.price)}</td>
                    <td className={`${tableCellClass} text-right`}>{o.currentQty}</td>
                    <td
                      className={`${tableCellStrongClass} text-right ${
                        o.orderQty > 0 ? "text-good" : o.orderQty < 0 ? "text-bad" : ""
                      }`}
                    >
                      {o.orderQty > 0 ? `Buy ${o.orderQty}` : o.orderQty < 0 ? `Sell ${-o.orderQty}` : "—"}
                    </td>
                  </tr>
                ))}
                {preview.orders.length === 0 && <EmptyRow colSpan={6}>nothing to trade</EmptyRow>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
