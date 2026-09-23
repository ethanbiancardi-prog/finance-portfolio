"use client";

// Research Signals: a watchlist of tickers surfaced by different kinds of
// evidence, each with a sourced reason. Served from the daily cache only —
// this component never triggers a refresh. Research leads, not advice.
import { useContext, useEffect, useState, type ReactNode } from "react";
import { Callout, Card, Chip, GeometricLoader, SectionHeader, StatusBadge, Tabs, tableCellClass, tableCellStrongClass, tableHeadCellClass, tableHeadRowClass, tableRowClass } from "@/components/ui";
import { SectionForce } from "@/components/ui/Section";
import type { PresidentialAggregate, PresidentialBatch, Signal, SignalBatch, SignalCategory } from "@/lib/signals/types";
import { JargonText, SimpleText } from "./SimpleMode";

// A signal card that opens on click. The header is the digest — ticker,
// company, chips, and a one-line summary — the body is the reasoning,
// bull/risk, and sources. Listens to the page's expand/collapse-all.
function SignalShell({
  id,
  header,
  summary,
  children,
}: {
  id: string;
  header: ReactNode; // ticker/company/chips row
  summary: ReactNode; // one line under the header, always visible
  children: ReactNode; // the detail
}) {
  const force = useContext(SectionForce);
  const [open, setOpen] = useState(false);
  const [seenSeq, setSeenSeq] = useState(force?.seq ?? 0);
  if (force && force.seq !== seenSeq) {
    setSeenSeq(force.seq);
    setOpen(force.open);
  }
  return (
    <Card padding="none" className="overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={`${id}-body`} className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-border/30">
        <span className="min-w-0 flex-1">
          {header}
          <span className="mt-1.5 block text-xs leading-5 text-foreground">{summary}</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className={`mt-1 shrink-0 text-zinc-500 transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
          <path d="M3 5 L7 9 L11 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div id={`${id}-body`} className="border-t border-border/60 px-3 pb-3 pt-2.5">
          {children}
        </div>
      )}
    </Card>
  );
}

// Ticker + company as a header row; the ticker button opens full research
// without toggling the card (stopPropagation).
function TickerHeader({ signal, right, onResearch }: { signal: Signal; right: ReactNode; onResearch: (ticker: string) => void }) {
  return (
    <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span className="text-sm">
        <span
          role="link"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onResearch(signal.ticker);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.stopPropagation();
              onResearch(signal.ticker);
            }
          }}
          className="text-accent hover:underline"
          title={`Research ${signal.ticker}`}
        >
          {signal.ticker}
        </span>
        <span className="ml-2 text-zinc-500">{signal.company}</span>
      </span>
      <span className="flex items-center gap-3 text-[10px] caps text-zinc-500">{right}</span>
    </span>
  );
}

function Sources({ sources }: { sources: Signal["sources"] }) {
  return (
    <p className="mt-3 text-[10px] text-zinc-600">
      Sources:{" "}
      {sources.map((src, i) => (
        <span key={src.url}>
          {i > 0 && " · "}
          <a href={src.url} target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-4 hover:text-accent">
            {src.label}
          </a>
        </span>
      ))}
    </p>
  );
}

// Ordered by how fresh the evidence is: legislation and geopolitics are
// days old, the financial story is the latest 10-K, political trades arrive
// weeks after the fact — so they come last.
const CATEGORIES: { key: SignalCategory; label: string; live: boolean }[] = [
  { key: "legislation", label: "Legislation", live: true },
  { key: "geopolitics", label: "Geopolitics", live: true },
  { key: "financial", label: "Financial story", live: true },
  { key: "political", label: "Political trades", live: true },
];

// Text cells: the shared cell class is tabular (mono) for numbers; names read better in the UI font.
const textCell = "py-1 text-xs text-zinc-400";

const OWNER_LABEL = { self: "Self", spouse: "Spouse", joint: "Joint", child: "Child" } as const;

// Price change since a trade date, colored by sign. Null when Alpaca had no
// bars for the ticker (foreign listings, very recent IPOs).
function SincePct({ pct, title }: { pct: number | null | undefined; title?: string }) {
  if (pct == null) return <span className="text-zinc-600">—</span>;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return (
    <span className={pct > 0 ? "text-good" : pct < 0 ? "text-bad" : ""} title={title}>
      {sign}
      {Math.abs(pct * 100).toFixed(1)}%
    </span>
  );
}

function fmtDate(iso: string) {
  return new Date(iso + (iso.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function SignalsPanel({
  onResearch,
  simple,
  onSimple,
}: {
  onResearch: (ticker: string) => void;
  simple: boolean;
  onSimple: (v: boolean) => void;
}) {
  const [category, setCategory] = useState<SignalCategory>("legislation");
  const [force, setForce] = useState<{ open: boolean; seq: number } | undefined>(undefined);
  const [political, setPolitical] = useState<SignalBatch | null | undefined>(undefined);
  const [presidential, setPresidential] = useState<PresidentialBatch | null | undefined>(undefined);
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
        setPresidential(json.presidential ?? null);
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
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-2 text-[11px] text-zinc-500">
          <button type="button" onClick={() => setForce({ open: true, seq: (force?.seq ?? 0) + 1 })} className="hover:text-foreground">
            Expand all
          </button>
          <span>·</span>
          <button type="button" onClick={() => setForce({ open: false, seq: (force?.seq ?? 0) + 1 })} className="hover:text-foreground">
            Collapse all
          </button>
        </span>
        <span className="ml-auto">
          <Chip active={simple} onClick={() => onSimple(!simple)}>
            {simple ? "Explaining simply" : "Explain simply"}
          </Chip>
        </span>
      </div>
      {simple && (
        <p className="mt-2 text-[11px] leading-5 text-zinc-500">
          Jargon is underlined — hover or tap for a plain definition. Open a card and use &ldquo;Say it simply&rdquo; to rewrite its reasoning
          without the jargon, with an everyday example.
        </p>
      )}

      <SectionForce.Provider value={force}>
      {(active.key === "legislation" || active.key === "geopolitics" || active.key === "financial") && (
        <>
          {/* Kept mounted once loading ends so the mark can reassemble; it
              removes itself when the reconstruct finishes. */}
          <div className="mt-4 text-xs text-zinc-500 empty:mt-0">
            <GeometricLoader
              loading={ai[active.key] === undefined && !error}
              size={13}
              label="Loading signals"
            />
          </div>
          {error && <p className="mt-4 text-xs text-bad">{error}</p>}
          {ai[active.key] === null && <p className="mt-4 text-xs text-zinc-500">No {active.label.toLowerCase()} signals have been generated yet — the daily refresh hasn&apos;t run.</p>}
          {ai[active.key] && <AiSignals batch={ai[active.key]!} label={active.label} onResearch={onResearch} />}
        </>
      )}

      {active.key === "political" && (
        <>
          <div className="mt-4 text-xs text-zinc-500 empty:mt-0">
            <GeometricLoader
              loading={political === undefined && !error}
              size={13}
              label="Loading signals"
            />
          </div>
          {error && <p className="mt-4 text-xs text-bad">{error}</p>}
          {presidential && <PresidentialSection batch={presidential} onResearch={onResearch} />}
          {presidential === null && <p className="mt-4 text-xs text-zinc-500">Presidential trades haven&apos;t been generated yet — the daily refresh hasn&apos;t run.</p>}
          {political === null && <p className="mt-4 text-xs text-zinc-500">No congressional-trade signals have been generated yet — the daily refresh hasn&apos;t run.</p>}
          {political && <PoliticalSignals batch={political} onResearch={onResearch} />}
        </>
      )}
      </SectionForce.Provider>
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
      {batch.items.length > 0 && (
        <p className="mt-3 text-xs text-foreground">
          <span className="text-[10px] caps text-zinc-500">In one line · </span>
          {batch.items.length} {batch.items.length === 1 ? "lead" : "leads"}: {batch.items.map((s) => s.ticker).join(", ")}. Newest event {fmtDate(batch.items[0].eventDate)}.
        </p>
      )}
      <div className="mt-3 space-y-2">
        {batch.items.map((s) => (
          <AiSignalCard key={s.id} signal={s} label={label} onResearch={onResearch} />
        ))}
      </div>
    </div>
  );
}

function AiSignalCard({ signal, label, onResearch }: { signal: Signal; label: string; onResearch: (ticker: string) => void }) {
  return (
    <SignalShell
      id={signal.id}
      header={
        <TickerHeader
          signal={signal}
          onResearch={onResearch}
          right={
            <>
              <span className="rounded-[var(--radius-sm)] border border-border px-1.5 py-0.5">{label}</span>
              <span>{signal.category === "financial" ? "FY ending" : "Event"} {fmtDate(signal.eventDate)}</span>
            </>
          }
        />
      }
      summary={<JargonText text={signal.title ?? signal.reasoning.split(/(?<=\.)\s/)[0]} />}
    >
      <SimpleText text={signal.reasoning} context={`${label} lead on ${signal.ticker}: ${signal.title ?? ""}`} className="block max-w-3xl text-xs leading-5 text-foreground" />
      <div className="mt-3 grid grid-cols-1 gap-3 text-[11px] leading-5 md:grid-cols-2">
        <p className="text-zinc-500">
          <span className="text-good">Bull case:</span> <JargonText text={signal.bullCase} />
        </p>
        <p className="text-zinc-500">
          <span className="text-bad">What could go wrong:</span> <JargonText text={signal.risk} />
        </p>
      </div>
      <Sources sources={signal.sources} />
    </SignalShell>
  );
}

const fmtUsd = (v: number) => `${v < 0 ? "−" : ""}${Math.round(Math.abs(v)).toLocaleString()}`;
const fmtCompact = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}K` : `${Math.round(a)}`;
  return (v < 0 ? "−" : "") + "$" + s;
};

// Section A: the President's 278-T trades, aggregated per ticker from the
// most recent filing. Aggregates, not raw rows — the filings run to
// thousands of trustee-managed transactions.
function PresidentialSection({ batch, onResearch }: { batch: PresidentialBatch; onResearch: (ticker: string) => void }) {
  const filingLabel = new Date(batch.filingDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return (
    <div className="mt-4">
      <SectionHeader
        label="section a — presidential trades"
        description={`Securities transactions disclosed by ${batch.official.split(", ").reverse().join(" ")} on OGE Form 278-T, filed ${filingLabel}, covering trades from ${fmtDate(batch.firstTradeDate)} to ${fmtDate(batch.lastTradeDate)}. ${batch.stats.rows} transactions, ${batch.stats.rowsWithTicker} matched to a ticker across ${batch.stats.tickers} names (the rest are mostly municipal bonds). Ranked by estimated net dollars using the midpoint of each disclosed range.`}
      />

      <Callout className="mt-3" label="read this first">
        <span className="block"><span className="text-foreground">Trustee-managed.</span> These accounts are run by trustees and outside managers; the President does not personally select these trades.</span>
        <span className="mt-1 block"><span className="text-foreground">Ranges, not figures.</span> Each trade is disclosed as a range (e.g. $1,000,001 – $5,000,000). &ldquo;Estimated&rdquo; amounts here sum the midpoints; the true totals lie somewhere in the range shown.</span>
        <span className="mt-1 block"><span className="text-foreground">Weeks to months late.</span> This filing landed <span className="text-foreground">{batch.lagDays} days</span> after its last trade; {batch.stats.lateRows} of {batch.stats.rows} rows were filed past the 30-day deadline. The market has long since moved — the &ldquo;since last trade&rdquo; column shows by how much.</span>
      </Callout>

      <div className="mt-3 space-y-3">
        <PresidentialTable title="Top net purchases" rows={batch.netPurchases} onResearch={onResearch} />
        <PresidentialTable title="Top net sales" rows={batch.netSales} onResearch={onResearch} />
      </div>

      <p className="mt-3 text-[10px] text-zinc-600">
        Sources:{" "}
        {batch.filingUrls.map((u, i) => (
          <span key={u}>
            {i > 0 && " · "}
            <a href={u} target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-4 hover:text-accent">
              OGE Form 278-T filed {batch.filingDate}{batch.filingUrls.length > 1 ? ` (part ${i + 1})` : ""} (official PDF)
            </a>
          </span>
        ))}
        {" · "}
        Data:{" "}
        <a href={batch.credit.url} target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-4 hover:text-accent">
          {batch.credit.label}
        </a>{" "}
        ({batch.stats.machineChecked} rows machine-checked, {batch.stats.verifiedByHuman} human-verified against the PDF). Updated{" "}
        {new Date(batch.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.
      </p>
    </div>
  );
}

function PresidentialTable({ title, rows, onResearch }: { title: string; rows: PresidentialAggregate[]; onResearch: (ticker: string) => void }) {
  return (
    <Card padding="sm">
      <p className="text-[10px] caps text-zinc-500">{title}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[600px] text-left">
          <thead>
            <tr className={tableHeadRowClass}>
              <th className={tableHeadCellClass}>Ticker</th>
              <th className={`${tableHeadCellClass} pr-3 text-right`}>Trades</th>
              <th className={`${tableHeadCellClass} pr-3 text-right`}>Est. net</th>
              <th className={`${tableHeadCellClass} pr-3`}>Range</th>
              <th className={`${tableHeadCellClass} pr-3`}>Trade dates</th>
              <th className={`${tableHeadCellClass} pr-3 text-right`}>Since last trade</th>
              <th className={tableHeadCellClass}>Filing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ticker} className={tableRowClass}>
                <td className={`${textCell} pr-3`}>
                  <button type="button" onClick={() => onResearch(r.ticker)} className="text-accent hover:underline" title={`Research ${r.ticker}`}>
                    {r.ticker}
                  </button>
                  <span className="block max-w-[11rem] truncate text-[10px] text-zinc-600" title={r.company}>
                    {r.company}
                  </span>
                </td>
                <td className={`${tableCellClass} pr-3 text-right`} title={`${r.buys} buys, ${r.sells} sales`}>
                  {r.transactions}
                  <span className="block text-[10px] text-zinc-600">
                    {r.buys}b / {r.sells}s
                  </span>
                </td>
                <td className={`${tableCellStrongClass} pr-3 text-right ${r.netMid > 0 ? "text-good" : "text-bad"}`} title={fmtUsd(r.netMid)}>
                  {fmtCompact(r.netMid)}
                </td>
                <td className={`${tableCellClass} pr-3 whitespace-nowrap`}>
                  {fmtCompact(r.netLow)} – {fmtCompact(r.netHigh)}
                </td>
                <td className={`${tableCellClass} pr-3 whitespace-nowrap`}>
                  {r.firstTradeDate === r.lastTradeDate ? fmtDate(r.firstTradeDate) : `${fmtDate(r.firstTradeDate)} – ${fmtDate(r.lastTradeDate)}`}
                </td>
                <td className={`${tableCellClass} pr-3 text-right tabular-nums`}>
                  <SincePct pct={r.sinceTrade?.pct} title={r.sinceTrade ? `${fmtDate(r.sinceTrade.from)} close to ${fmtDate(r.sinceTrade.asOf)} close` : undefined} />
                </td>
                <td className={tableCellClass}>
                  <a href={r.sources[0]?.url} target="_blank" rel="noreferrer" className="text-accent underline decoration-border underline-offset-4 hover:decoration-accent">
                    PDF
                  </a>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-xs text-zinc-500">
                  None in this filing.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type ChamberFilter = "all" | "House" | "Senate";
type PartyFilter = "all" | "Democrat" | "Republican" | "Independent";
const CHAMBERS: { key: ChamberFilter; label: string }[] = [
  { key: "all", label: "Both chambers" },
  { key: "House", label: "House" },
  { key: "Senate", label: "Senate" },
];
const PARTIES: { key: PartyFilter; label: string }[] = [
  { key: "all", label: "All parties" },
  { key: "Democrat", label: "Democrats" },
  { key: "Republican", label: "Republicans" },
  { key: "Independent", label: "Independents" },
];

type SortKey = "conviction" | "recent" | "count";
const SORTS: { key: SortKey; label: string; title: string }[] = [
  { key: "conviction", label: "Conviction", title: "Several members buying the same name with nobody selling, plus a committee overlap, ranks first" },
  { key: "recent", label: "Recently disclosed", title: "Most recently filed first" },
  { key: "count", label: "Most traded", title: "Most trades in the window first" },
];

function latestDisclosure(s: Signal): string {
  return (s.trades ?? []).reduce((m, t) => (t.disclosureDate > m ? t.disclosureDate : m), "");
}

function PoliticalSignals({ batch, onResearch }: { batch: SignalBatch; onResearch: (ticker: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const [chamber, setChamber] = useState<ChamberFilter>("all");
  const [party, setParty] = useState<PartyFilter>("all");
  const [sort, setSort] = useState<SortKey>("conviction");
  const lagHouse = Number(batch.stats.medianLagHouse ?? batch.stats.medianLagDays);
  const lagSenate = Number(batch.stats.medianLagSenate ?? batch.stats.medianLagDays);

  // Filters apply to the trades inside each card; a card with no matching
  // trades disappears, and the oversight flags only keep committees that a
  // remaining member actually sits on. The summary paragraph still
  // describes every trade in the ticker — it's written once, server-side.
  const filtering = chamber !== "all" || party !== "all";
  const filtered = batch.items
    .map((sig): Signal | null => {
      const trades = (sig.trades ?? []).filter((t) => (chamber === "all" || t.chamber === chamber) && (party === "all" || t.party === party));
      if (trades.length === 0) return null;
      const committees = new Set(trades.flatMap((t) => t.committees ?? []));
      return { ...sig, trades, oversight: (sig.oversight ?? []).filter((o) => committees.has(o.committee)) };
    })
    .filter((sig): sig is Signal => sig !== null)
    .sort((a, b) => {
      if (sort === "recent") return latestDisclosure(b).localeCompare(latestDisclosure(a));
      if (sort === "count") return (b.trades?.length ?? 0) - (a.trades?.length ?? 0) || latestDisclosure(b).localeCompare(latestDisclosure(a));
      return (b.conviction?.score ?? 0) - (a.conviction?.score ?? 0) || latestDisclosure(b).localeCompare(latestDisclosure(a));
    });
  const items = showAll ? filtered : filtered.slice(0, 12);
  const tradeCount = filtered.reduce((n, sig) => n + (sig.trades?.length ?? 0), 0);

  return (
    <div className="mt-6">
      <SectionHeader
        label="section b — stock trades reported by members of congress"
        description={`Periodic Transaction Reports filed in the last ${batch.windowDays} days — House reports parsed from the Clerk's official PDFs, Senate reports from the electronic filings on efdsearch.senate.gov. ${batch.stats.tradesParsed} individual-stock trades (${batch.stats.houseTrades ?? "?"} House, ${batch.stats.senateTrades ?? 0} Senate) across ${batch.stats.tickers} tickers. ETFs, funds, options and bonds are left out, as are paper filings with no text layer. Updated ${new Date(batch.generatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`}
      />

      <Callout className="mt-3" label="how to read late data">
        The STOCK Act gives members up to <span className="text-foreground">45 days</span> to disclose a trade; the median lag here is{" "}
        <span className="text-foreground">{lagHouse} days</span> in the House and <span className="text-foreground">{lagSenate} days</span> in the Senate, so the
        price has usually moved before a trade is public. Two things make it usable anyway: the <span className="text-foreground">since trade</span> figure shows
        what the stock did from the trade date to the latest close, and the default <span className="text-foreground">conviction</span> order puts names that
        several members bought over the {batch.windowDays}-day window, with nobody selling, at the top — one trade is noise, five in the same name is not.
      </Callout>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex flex-wrap gap-1.5">
          {CHAMBERS.map((c) => (
            <Chip key={c.key} active={chamber === c.key} onClick={() => setChamber(c.key)}>
              {c.label}
            </Chip>
          ))}
        </span>
        <span className="flex flex-wrap gap-1.5">
          {PARTIES.map((pt) => (
            <Chip key={pt.key} active={party === pt.key} onClick={() => setParty(pt.key)}>
              {pt.label}
            </Chip>
          ))}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] caps text-zinc-500">Sort</span>
          {SORTS.map((o) => (
            <Chip key={o.key} active={sort === o.key} onClick={() => setSort(o.key)} title={o.title}>
              {o.label}
            </Chip>
          ))}
        </span>
        <span className="text-[11px] text-zinc-500">
          {tradeCount} {tradeCount === 1 ? "trade" : "trades"} across {filtered.length} {filtered.length === 1 ? "ticker" : "tickers"}
          {filtering && " match"}
        </span>
      </div>
      {filtering && (
        <p className="mt-2 text-[11px] text-zinc-500">
          Trade lists, counts and committee flags reflect the filter; each ticker&apos;s summary paragraph still describes all of its trades.
        </p>
      )}

      <div className="mt-3 space-y-3">
        {items.map((s) => (
          <SignalCard key={s.id} signal={s} onResearch={onResearch} />
        ))}
        {filtered.length === 0 && <p className="text-xs text-zinc-500">No trades match that filter in the last {batch.windowDays} days.</p>}
      </div>
      {filtered.length > 12 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-xs text-accent underline decoration-border underline-offset-4 hover:decoration-accent">
          {showAll ? "Show fewer" : `Show all ${filtered.length} tickers`}
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
  const exchanges = trades.filter((t) => t.type === "exchange").length;

  const memberCount = new Set(trades.map((t) => t.member)).size;
  // The conviction label ("3 members buying, none selling") already says
  // what matters; fall back to the member count when it's plain "mixed".
  const conviction = signal.conviction?.label.replace(" · committee overlap", "");
  const digest = [
    conviction && conviction !== "mixed" ? conviction : `${memberCount} ${memberCount === 1 ? "member" : "members"}, mixed buying and selling`,
    signal.oversight && signal.oversight.length > 0 ? `sits on ${signal.oversight.map((o) => o.committee).join(" and ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <SignalShell
      id={signal.id}
      header={
        <TickerHeader
          signal={signal}
          onResearch={onResearch}
          right={
            <>
              {signal.oversight && signal.oversight.length > 0 && (
                <span className="rounded-[var(--radius-sm)] border border-average/60 px-1.5 py-0.5 text-average">Committee oversight overlap</span>
              )}
              <span>Latest trade {fmtDate(signal.eventDate)}</span>
              {signal.sinceTrade && (
                <span title={`${fmtDate(signal.sinceTrade.from)} close to ${fmtDate(signal.sinceTrade.asOf)} close`}>
                  Since trade <SincePct pct={signal.sinceTrade.pct} />
                </span>
              )}
            </>
          }
        />
      }
      summary={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
          <StatusBadge rating="good" label={`${buys} ${buys === 1 ? "buy" : "buys"}`} />
          <StatusBadge rating="bad" label={`${sells} ${sells === 1 ? "sale" : "sales"}`} />
          {exchanges > 0 && <StatusBadge rating="average" label={`${exchanges} ${exchanges === 1 ? "exchange" : "exchanges"}`} />}
          <span className="text-foreground">{digest}</span>
        </span>
      }
    >
      {signal.oversight && signal.oversight.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-zinc-500">
          {signal.oversight.map((o) => (
            <li key={o.committee}>
              <span className="text-foreground">{o.committee}</span> — {o.members.join(", ")}
            </li>
          ))}
        </ul>
      )}

      <SimpleText text={signal.reasoning} context={`Congressional trades in ${signal.ticker}`} className="mt-2 block max-w-3xl text-xs leading-5 text-foreground" />

      <div className="mt-3 grid grid-cols-1 gap-3 text-[11px] leading-5 md:grid-cols-2">
        <p className="text-zinc-500">
          <span className="text-good">Bull case:</span> <JargonText text={signal.bullCase} />
        </p>
        <p className="text-zinc-500">
          <span className="text-bad">What could go wrong:</span> <JargonText text={signal.risk} />
        </p>
      </div>

      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-3 text-[11px] text-accent underline decoration-border underline-offset-4 hover:decoration-accent">
        {open ? "Hide trades" : `Show ${trades.length} ${trades.length === 1 ? "trade" : "trades"}`}
      </button>
      {open && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className={tableHeadCellClass}>Member</th>
                <th className={tableHeadCellClass}>Owner</th>
                <th className={tableHeadCellClass}>Type</th>
                <th className={tableHeadCellClass}>Trade date</th>
                <th className={tableHeadCellClass}>Disclosed</th>
                <th className={`${tableHeadCellClass} pr-4 text-right`}>Lag</th>
                <th className={`${tableHeadCellClass} pr-4 text-right`}>Since</th>
                <th className={tableHeadCellClass}>Amount</th>
                <th className={tableHeadCellClass}>Source</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
                <tr key={i} className={tableRowClass}>
                  <td className={`${textCell} pr-3`}>
                    {t.member}
                    <span className="ml-1.5 text-zinc-600">
                      {t.district}
                      {t.party ? ` · ${t.party[0]}` : ""}
                    </span>
                    {t.committees && t.committees.length > 0 && (
                      <span className="block text-[10px] leading-4 text-zinc-600">{t.committees.join(" · ")}</span>
                    )}
                  </td>
                  <td className={`${textCell} pr-3`}>{OWNER_LABEL[t.owner]}</td>
                  <td className={`${textCell} pr-3 ${t.type === "buy" ? "text-good" : t.type === "sell" ? "text-bad" : ""}`}>
                    {t.type === "sell" && t.partial ? "Partial sale" : t.type === "buy" ? "Buy" : t.type === "sell" ? "Sale" : "Exchange"}
                    {t.amended && <span className="ml-1.5 text-[10px] caps text-average">amended</span>}
                  </td>
                  <td className={`${tableCellClass} pr-3 tabular-nums whitespace-nowrap`}>{fmtDate(t.tradeDate)}</td>
                  <td className={`${tableCellClass} pr-3 tabular-nums whitespace-nowrap`}>{fmtDate(t.disclosureDate)}</td>
                  <td className={`${tableCellClass} pr-4 text-right tabular-nums ${t.lagDays > 45 ? "text-bad" : ""}`}>{t.lagDays}d</td>
                  <td className={`${tableCellClass} pr-4 text-right tabular-nums`}>
                    <SincePct pct={t.sincePct} title="Price change from the trade date to the latest close" />
                  </td>
                  <td className={`${tableCellClass} pr-3 tabular-nums`}>{t.amountRange}</td>
                  <td className={tableCellClass}>
                    <a href={t.filingUrl} target="_blank" rel="noreferrer" className="text-accent underline decoration-border underline-offset-4 hover:decoration-accent">
                      {t.chamber === "Senate" ? "Filing" : "PDF"}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sources sources={signal.sources} />
    </SignalShell>
  );
}
