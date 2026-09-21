"use client";

// Research Signals: a watchlist of tickers surfaced by different kinds of
// evidence, each with a sourced reason. Served from the daily cache only —
// this component never triggers a refresh. Research leads, not advice.
import { useEffect, useState } from "react";
import { Callout, Card, SectionHeader, StatusBadge, Tabs, tableCellClass, tableHeadCellClass, tableHeadRowClass, tableRowClass } from "@/components/ui";
import type { Signal, SignalBatch, SignalCategory } from "@/lib/signals/types";

const CATEGORIES: { key: SignalCategory; label: string; live: boolean }[] = [
  { key: "political", label: "Political trades", live: true },
  { key: "legislation", label: "Legislation", live: true },
  { key: "geopolitics", label: "Geopolitics", live: true },
  { key: "financial", label: "Financial story", live: true },
];

// Text cells: the shared cell class is tabular (mono) for numbers; names read better in the UI font.
const textCell = "py-1 text-xs text-zinc-400";

const OWNER_LABEL = { self: "Self", spouse: "Spouse", joint: "Joint", child: "Child" } as const;

function fmtDate(iso: string) {
  return new Date(iso + (iso.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function SignalsPanel({ onResearch }: { onResearch: (ticker: string) => void }) {
  const [category, setCategory] = useState<SignalCategory>("political");
  const [political, setPolitical] = useState<SignalBatch | null | undefined>(undefined);
  const [ai, setAi] = useState<Partial<Record<SignalCategory, SignalBatch | null>>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/signals")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Couldn't load signals");
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setPolitical(json.political ?? null);
        setAi({ legislation: json.legislation ?? null, geopolitics: json.geopolitics ?? null, financial: json.financial ?? null });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load signals");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = CATEGORIES.find((c) => c.key === category)!;

  return (
    <section className="mt-4">
      <Callout label="research leads, not advice">
        Everything here is educational research: tickers that showed up in public data for a reason worth reading about. Nothing on this
        page is a recommendation to buy or sell anything. Check the sources, form your own view, and remember the paper account exists so
        mistakes are free.
      </Callout>

      <div className="mt-4">
        <Tabs tabs={CATEGORIES.map((c) => ({ key: c.key, label: c.live ? c.label : `${c.label} (soon)` }))} active={category} onChange={setCategory} />
      </div>

      {(active.key === "legislation" || active.key === "geopolitics" || active.key === "financial") && (
        <>
          {ai[active.key] === undefined && !error && <p className="mt-4 text-xs text-zinc-500">Loading...</p>}
          {error && <p className="mt-4 text-xs text-bad">{error}</p>}
          {ai[active.key] === null && <p className="mt-4 text-xs text-zinc-500">No {active.label.toLowerCase()} signals have been generated yet — the daily refresh hasn&apos;t run.</p>}
          {ai[active.key] && <AiSignals batch={ai[active.key]!} label={active.label} onResearch={onResearch} />}
        </>
      )}

      {active.key === "political" && (
        <>
          {political === undefined && !error && <p className="mt-4 text-xs text-zinc-500">Loading...</p>}
          {error && <p className="mt-4 text-xs text-bad">{error}</p>}
          {political === null && <p className="mt-4 text-xs text-zinc-500">No political-trade signals have been generated yet — the daily refresh hasn&apos;t run.</p>}
          {political && <PoliticalSignals batch={political} onResearch={onResearch} />}
        </>
      )}
    </section>
  );
}

const AI_BLURB: Record<string, string> = {
  legislation: "Bills, agency rules, approvals, and enforcement actions from the last few weeks, tied to the companies they hit.",
  geopolitics: "Sanctions, trade, conflicts, central banks, and commodity decisions from the last few weeks, tied to the companies most exposed.",
  financial: "Companies in the eight-sector universe whose latest 10-K tells a story — margins moving, a turnaround, unusual cash generation, leverage changing. Good and bad stories both count.",
};

function AiSignals({ batch, label, onResearch }: { batch: SignalBatch; label: string; onResearch: (ticker: string) => void }) {
  return (
    <div className="mt-4">
      <SectionHeader
        label={label}
        description={
          batch.category === "financial"
            ? `${AI_BLURB.financial} Computed from SEC filing data by the same ratio engine as the Search tab — no AI involved; ${batch.stats.companiesScreened} companies screened, ${batch.stats.withStory} with a story, top ${batch.stats.kept} shown. Updated ${new Date(batch.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`
            : `${AI_BLURB[batch.category] ?? ""} Researched with web search over the last ${batch.windowDays} days; every lead cites the specific pages it came from and leads without a source are dropped before they reach this page (${batch.stats.returned} found, ${batch.stats.kept} kept). Updated ${new Date(batch.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`
        }
      />
      {batch.items.length === 0 && <p className="mt-3 text-xs text-zinc-500">Nothing sourced well enough to show for this window.</p>}
      <div className="mt-3 space-y-3">
        {batch.items.map((s) => (
          <AiSignalCard key={s.id} signal={s} label={label} onResearch={onResearch} />
        ))}
      </div>
    </div>
  );
}

function AiSignalCard({ signal, label, onResearch }: { signal: Signal; label: string; onResearch: (ticker: string) => void }) {
  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm">
          <button type="button" onClick={() => onResearch(signal.ticker)} className="text-accent hover:underline" title={`Research ${signal.ticker}`}>
            {signal.ticker}
          </button>
          <span className="ml-2 text-zinc-500">{signal.company}</span>
        </h3>
        <span className="flex items-center gap-3 text-[10px] caps text-zinc-500">
          <span className="rounded-[var(--radius-sm)] border border-border px-1.5 py-0.5">{label}</span>
          <span>{signal.category === "financial" ? "FY ending" : "Event"} {fmtDate(signal.eventDate)}</span>
        </span>
      </div>
      {signal.title && <p className="mt-2 text-xs font-medium text-foreground">{signal.title}</p>}
      <p className="mt-2 max-w-3xl text-xs leading-5 text-foreground">{signal.reasoning}</p>
      <div className="mt-3 grid grid-cols-1 gap-3 text-[11px] leading-5 md:grid-cols-2">
        <p className="text-zinc-500">
          <span className="text-good">Bull case:</span> {signal.bullCase}
        </p>
        <p className="text-zinc-500">
          <span className="text-bad">What could go wrong:</span> {signal.risk}
        </p>
      </div>
      <p className="mt-3 text-[10px] text-zinc-600">
        Sources:{" "}
        {signal.sources.map((src, i) => (
          <span key={src.url}>
            {i > 0 && " · "}
            <a href={src.url} target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-4 hover:text-accent">
              {src.label}
            </a>
          </span>
        ))}
      </p>
    </Card>
  );
}

function PoliticalSignals({ batch, onResearch }: { batch: SignalBatch; onResearch: (ticker: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const items = showAll ? batch.items : batch.items.slice(0, 12);
  const lag = Number(batch.stats.medianLagDays);

  return (
    <div className="mt-4">
      <SectionHeader
        label="stock trades reported by members of congress"
        description={`Periodic Transaction Reports filed with the House Clerk in the last ${batch.windowDays} days, parsed from the official PDFs. ${batch.stats.tradesParsed} trades across ${batch.stats.tickers} tickers from ${batch.stats.filingsScanned} filings. ${batch.stats.chambers}. Updated ${new Date(batch.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`}
      />

      <Callout className="mt-3" label="reporting lag">
        The STOCK Act gives members up to <span className="text-foreground">45 days</span> to disclose a trade. The median lag in this batch is{" "}
        <span className="text-foreground">{lag} days</span> — by the time a trade appears here, the price has usually already moved. Trade dates below are
        when the trade happened; disclosed dates are when the public could first see it.
      </Callout>

      <div className="mt-3 space-y-3">
        {items.map((s) => (
          <SignalCard key={s.id} signal={s} onResearch={onResearch} />
        ))}
      </div>
      {batch.items.length > 12 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-xs text-accent underline decoration-border underline-offset-4 hover:decoration-accent">
          {showAll ? "Show fewer" : `Show all ${batch.items.length} tickers`}
        </button>
      )}
    </div>
  );
}

function SignalCard({ signal, onResearch }: { signal: Signal; onResearch: (ticker: string) => void }) {
  const [open, setOpen] = useState(false);
  const trades = signal.trades ?? [];
  const buys = trades.filter((t) => t.type === "buy").length;
  const sells = trades.filter((t) => t.type === "sell").length;

  return (
    <Card padding="sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm">
          <button type="button" onClick={() => onResearch(signal.ticker)} className="text-accent hover:underline" title={`Research ${signal.ticker}`}>
            {signal.ticker}
          </button>
          <span className="ml-2 text-zinc-500">{signal.company}</span>
        </h3>
        <span className="flex items-center gap-3 text-[10px] caps text-zinc-500">
          <span className="rounded-[var(--radius-sm)] border border-border px-1.5 py-0.5">Political trades</span>
          <span>Latest trade {fmtDate(signal.eventDate)}</span>
        </span>
      </div>

      <p className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-500">
        <StatusBadge rating="good" label={`${buys} ${buys === 1 ? "buy" : "buys"}`} />
        <StatusBadge rating="bad" label={`${sells} ${sells === 1 ? "sale" : "sales"}`} />
        <span>{new Set(trades.map((t) => t.member)).size} {new Set(trades.map((t) => t.member)).size === 1 ? "member" : "members"}</span>
      </p>

      <p className="mt-2 max-w-3xl text-xs leading-5 text-foreground">{signal.reasoning}</p>

      <div className="mt-3 grid grid-cols-1 gap-3 text-[11px] leading-5 md:grid-cols-2">
        <p className="text-zinc-500">
          <span className="text-good">Bull case:</span> {signal.bullCase}
        </p>
        <p className="text-zinc-500">
          <span className="text-bad">What could go wrong:</span> {signal.risk}
        </p>
      </div>

      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-3 text-[11px] text-accent underline decoration-border underline-offset-4 hover:decoration-accent">
        {open ? "Hide trades" : `Show ${trades.length} ${trades.length === 1 ? "trade" : "trades"}`}
      </button>
      {open && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className={tableHeadCellClass}>Member</th>
                <th className={tableHeadCellClass}>Owner</th>
                <th className={tableHeadCellClass}>Type</th>
                <th className={tableHeadCellClass}>Trade date</th>
                <th className={tableHeadCellClass}>Disclosed</th>
                <th className={`${tableHeadCellClass} pr-4 text-right`}>Lag</th>
                <th className={tableHeadCellClass}>Amount</th>
                <th className={tableHeadCellClass}>Source</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
                <tr key={i} className={tableRowClass}>
                  <td className={`${textCell} pr-3`}>
                    {t.member}
                    <span className="ml-1.5 text-zinc-600">{t.district}</span>
                  </td>
                  <td className={`${textCell} pr-3`}>{OWNER_LABEL[t.owner]}</td>
                  <td className={`${textCell} pr-3 ${t.type === "buy" ? "text-good" : t.type === "sell" ? "text-bad" : ""}`}>
                    {t.type === "sell" && t.partial ? "Partial sale" : t.type === "buy" ? "Buy" : t.type === "sell" ? "Sale" : "Exchange"}
                    {t.amended && <span className="ml-1.5 text-[10px] caps text-average">amended</span>}
                  </td>
                  <td className={`${tableCellClass} pr-3 tabular-nums`}>{fmtDate(t.tradeDate)}</td>
                  <td className={`${tableCellClass} pr-3 tabular-nums`}>{fmtDate(t.disclosureDate)}</td>
                  <td className={`${tableCellClass} pr-4 text-right tabular-nums ${t.lagDays > 45 ? "text-bad" : ""}`}>{t.lagDays}d</td>
                  <td className={`${tableCellClass} pr-3 tabular-nums`}>{t.amountRange}</td>
                  <td className={tableCellClass}>
                    <a href={t.filingUrl} target="_blank" rel="noreferrer" className="text-accent underline decoration-border underline-offset-4 hover:decoration-accent">
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[10px] text-zinc-600">
        Sources:{" "}
        {signal.sources.map((src, i) => (
          <span key={src.url}>
            {i > 0 && " · "}
            <a href={src.url} target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-4 hover:text-accent">
              {src.label}
            </a>
          </span>
        ))}
      </p>
    </Card>
  );
}
