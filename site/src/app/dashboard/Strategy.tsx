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
import {
  MAX_HOLDINGS,
  PRESETS,
  type PlannedOrder,
  type Rebalance,
  type SavedStrategy,
  type StrategyConfig,
  type StrategyRun,
} from "@/lib/strategies";

type Row = { symbol: string; weight: string };
type Preview = { equity: number; orders: PlannedOrder[]; cashAfter: number; missingPrices: string[] };

const REBALANCE_LABEL: Record<Rebalance, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  drift: "On drift",
};

const describeRebalance = (c: StrategyConfig) =>
  c.rebalance === "monthly"
    ? "on the first trading day of each month"
    : c.rebalance === "weekly"
      ? "on the first trading day of each week"
      : `whenever any holding drifts ${c.driftPct} pts or more from its target`;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// When the nightly job will next look at the strategy, in words. It runs at
// 22:00 UTC on weekdays (6pm New York in summer); holidays are skipped by the
// job itself, so this can be a day early around them.
function nextCheck() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(22, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  const nyDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const weekday = next.getUTCDay() >= 1 && next.getUTCDay() <= 5;
  return weekday && nyDay(next) === nyDay(now)
    ? "tonight, after the market closes"
    : "after the next trading day's close";
}

// Tell the portfolio card to reload, so its order form pauses or resumes now.
const announce = () => window.dispatchEvent(new Event("strategy-changed"));

export default function Strategy() {
  const [saved, setSaved] = useState<SavedStrategy | null>(null);
  const [runs, setRuns] = useState<StrategyRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState("");
  const [presetKey, setPresetKey] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([{ symbol: "", weight: "" }]);
  const [rebalance, setRebalance] = useState<Rebalance>("monthly");
  const [driftPct, setDriftPct] = useState("5");

  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | "remove" | "toggle" | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/portfolio/strategy");
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setSaved(body.strategy);
        setRuns(body.runs ?? []);
      }
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

  const config = (): StrategyConfig => ({
    name,
    presetKey,
    holdings: rows
      .filter((r) => r.symbol.trim())
      .map((r) => ({ symbol: r.symbol.trim().toUpperCase(), weight: Number(r.weight) })),
    rebalance,
    driftPct: rebalance === "drift" ? Number(driftPct) : null,
  });

  const total = rows.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);

  async function send(method: "POST" | "PUT" | "DELETE" | "PATCH", payload?: object) {
    setBusy(
      method === "POST" ? "preview" : method === "PUT" ? "save" : method === "DELETE" ? "remove" : "toggle",
    );
    setMessage(null);
    const res = await fetch("/api/portfolio/strategy", {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "DELETE" ? undefined : JSON.stringify(payload ?? config()),
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
      setMessage({
        text: body.strategy.active
          ? `Saved "${body.strategy.name}". It's on, so the account moves to the new targets ${nextCheck()}.`
          : `Saved "${body.strategy.name}". It's off: nothing will trade until you turn it on.`,
        ok: true,
      });
    }
    if (method === "PATCH") {
      setSaved(body.strategy);
      setMessage({
        text: body.strategy.active
          ? `Turned on. The first rebalance happens ${nextCheck()}, at closing prices. Manual trading is paused.`
          : "Turned off. Your holdings stay as they are, nothing more will be traded automatically, and manual trading is back on.",
        ok: true,
      });
      announce();
    }
    if (method === "DELETE") {
      setSaved(null);
      setPreview(null);
      setMessage({ text: "Strategy removed. Your holdings stay as they are, and manual trading is back on.", ok: true });
      announce();
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
        description="Pick a preset or build your own, then turn it on and it runs your paper account for you."
      />

      {loaded && !editing && (
        <div className="mt-3">
          {saved ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-foreground">{saved.name}</p>
                <span
                  className={`rounded-[var(--radius-sm)] border px-1.5 py-0.5 text-[10px] caps ${
                    saved.active ? "border-accent text-accent" : "border-border text-zinc-500"
                  }`}
                >
                  {saved.active ? "On" : "Off"}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                {saved.holdings.map((h) => `${h.symbol} ${h.weight}%`).join(" · ")}
                {saved.holdings.reduce((s, h) => s + h.weight, 0) < 100 && " · rest in cash"}
              </p>

              {/* What state it's in, in plain words. */}
              <p className="mt-3 max-w-2xl text-xs leading-5 text-zinc-400">
                {!saved.active ? (
                  <>
                    <span className="text-foreground">Off.</span> Saved, but not running. Turn it on and it takes
                    over your whole account: at the next check after the close it moves your holdings to these
                    targets, then keeps them there by rebalancing {describeRebalance(saved)}. Manual trading pauses
                    while it&apos;s on.
                  </>
                ) : !saved.lastCheckedAt ? (
                  <>
                    <span className="text-foreground">On since {shortDate(saved.activatedAt ?? saved.updatedAt)}.</span>{" "}
                    Nothing has traded yet. The first rebalance happens {nextCheck()}, moving your account to these
                    targets at closing prices.
                  </>
                ) : (
                  <>
                    <span className="text-foreground">On.</span> Last checked{" "}
                    {new Date(saved.lastCheckedAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    : {saved.lastCheckNote} Next check {nextCheck()}.
                  </>
                )}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() => send("PATCH", { active: !saved.active })}
                  loading={busy === "toggle"}
                  loadingLabel={saved.active ? "Turning off" : "Turning on"}
                >
                  {saved.active ? "Turn off" : "Turn on"}
                </Button>
                <Button variant="outline" onClick={edit}>
                  Edit
                </Button>
                <Button variant="outline" onClick={() => send("POST", saved)} loading={busy === "preview"} loadingLabel="Pricing">
                  Preview trades
                </Button>
                <Button variant="outline" onClick={() => send("DELETE")} loading={busy === "remove"} loadingLabel="Removing">
                  Remove
                </Button>
              </div>

              <details className="mt-3 max-w-2xl text-[11px] leading-5 text-zinc-500">
                <summary className="cursor-pointer text-zinc-400">What happens each night while it&apos;s on</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>
                    Every weekday at 6pm ET (5pm in winter), after the market closes, the site checks every strategy
                    that&apos;s turned on. Market holidays are skipped.
                  </li>
                  <li>
                    It decides whether yours is due: {describeRebalance(saved)}. Right after you turn it on or change
                    it, it&apos;s always due.
                  </li>
                  <li>
                    If it&apos;s due, it sells whatever is above its target (and anything the strategy doesn&apos;t
                    hold) first, so the cash is there, then buys whatever is below target. Whole shares only, so a
                    little cash is left over.
                  </li>
                  <li>
                    Every order fills at that day&apos;s closing price, the same price for everyone. Nobody,
                    including you, can pick a better one.
                  </li>
                  <li>What it did, and why, is recorded in the log below.</li>
                </ol>
              </details>
            </>
          ) : (
            <>
              <p className="max-w-2xl text-xs leading-5 text-zinc-400">
                No strategy yet. A strategy is a set of target weights, like 60% stocks and 40% bonds, plus a rule for
                how often to rebalance back to them. Start from a preset or build your own; nothing trades until you
                turn it on.
              </p>
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
          <p className="text-[11px] leading-5 text-zinc-500">
            {presetKey
              ? `${PRESETS.find((p) => p.presetKey === presetKey)?.description} Change any holding to make it your own.`
              : "Choose up to 20 tickers and what percentage of the account each should be. Anything under 100% stays in cash."}
          </p>

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
          <p className="-mt-2 text-[11px] leading-5 text-zinc-500">
            {rebalance === "drift"
              ? `Checks every trading day and rebalances only once a holding is ${driftPct || "?"} percentage points off its target, e.g. a 60% target that has grown to ${60 + (Number(driftPct) || 0)}%. Fewer trades than a calendar schedule.`
              : `Rebalances back to the targets ${rebalance === "monthly" ? "on the first trading day of each month" : "on the first trading day of each week"}, however far things have moved.`}
          </p>

          {saved?.active && (
            <p className="text-[11px] leading-5 text-zinc-500">
              This strategy is on, so saving changes moves your account to the new targets {nextCheck()}.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => send("POST")} loading={busy === "preview"} loadingLabel="Pricing">
              Preview trades
            </Button>
            <Button onClick={() => send("PUT")} loading={busy === "save"} loadingLabel="Saving">
              Save strategy
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(false);
                setPreview(null);
                setMessage(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p className={`mt-3 max-w-2xl text-xs leading-5 ${message.ok ? "text-good" : "text-bad"}`} role="status">
          <span className="text-zinc-600">&gt; </span>
          {message.text}
        </p>
      )}

      {preview && (
        <div className="mt-4">
          <p className="max-w-2xl text-[11px] leading-5 text-zinc-500">
            If this strategy took over your {formatCurrency(preview.equity)} account at the latest prices, it would
            place these orders (whole shares, so about {formatCurrency(preview.cashAfter)} stays in cash). This is only
            a preview: the real rebalance uses that evening&apos;s closing prices, so the numbers will shift a little.
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

      {loaded && saved && !editing && (
        <div className="mt-5">
          <SectionHeader
            label="strategy log"
            description="Every rebalance the strategy has made, and why. Nights where nothing was due only update the status line above."
          />
          <div className="mt-2 space-y-2">
            {runs.map((r) => (
              <div key={r.id} className="border-t border-border/60 pt-2 text-xs leading-5">
                <p>
                  <span className="text-zinc-500">{shortDate(r.ran_at)}</span>{" "}
                  <span className={r.status === "error" ? "text-bad" : "text-foreground"}>
                    {r.status === "error" ? "Didn't rebalance." : "Rebalanced."}
                  </span>{" "}
                  <span className="text-zinc-400">{r.reason}</span>
                </p>
                {r.orders.length > 0 && (
                  <p className="text-[11px] text-zinc-500">
                    {r.orders
                      .map((o) => `${o.side === "buy" ? "Bought" : "Sold"} ${o.qty} ${o.symbol} at ${formatCurrency(o.price)}`)
                      .join(" · ")}
                  </p>
                )}
              </div>
            ))}
            {runs.length === 0 && (
              <p className="text-[11px] text-zinc-500">
                {saved.active ? "No rebalances yet. The first one shows up here the morning after it runs." : "No rebalances yet."}
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
