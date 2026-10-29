"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  Button,
  Callout,
  Card,
  ChartLoading,
  Chip,
  EmptyRow,
  Field,
  SectionHeader,
  StatCard,
  tableCellClass,
  tableCellStrongClass,
  tableHeadCellClass,
  tableHeadRowClass,
  tableRowClass,
} from "@/components/ui";
import { calibrationBins, MEANINGFUL_SAMPLE, type Prediction, type Scores } from "@/lib/calibration";
import type { KalshiMarket } from "@/lib/kalshi";
import type { KalshiPick } from "@/lib/kalshiPicks";
import type { HorizonKey, KalshiStudy } from "@/lib/kalshiStudy";

const CalibrationChart = dynamic(() => import("./CalibrationChart"), {
  ssr: false,
  loading: () => <ChartLoading className="h-72 sm:h-80" />,
});

const pct = (p: number) => `${Math.round(p * 1000) / 10}%`;
const fmtDate = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const brier = (v: number | null) => (v === null ? "N/A" : v.toFixed(3));
// One prediction's own Brier contribution: (probability - outcome)^2.
const sq = (p: number, outcome: boolean) => (p - (outcome ? 1 : 0)) ** 2;

// The plain-English line under the scores.
function verdict(s: Scores): string {
  if (s.edge === null) return "No resolved predictions yet. Resolve one to get your first score.";
  const gap = Math.abs(s.edge).toFixed(3);
  if (Math.abs(s.edge) < 0.005) return `You and the market are scoring about the same (within ${gap}).`;
  return s.edge > 0
    ? `Your probabilities have been closer to what actually happened than the market's, by ${gap} on average.`
    : `The market's probabilities have been closer to what actually happened than yours, by ${gap} on average.`;
}

// The market's probability since you logged a prediction (one point a day),
// with your own probability as a dashed line, on a fixed 0-100% scale.
function PriceTrail({ history, mine, color }: { history: { date: string; probability: number }[]; mine: number; color: string }) {
  if (history.length < 2) return null;
  const x = (i: number) => (i / (history.length - 1)) * 100;
  const y = (v: number) => 28 - v * 26;
  const d = history.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(h.probability).toFixed(2)}`).join("");
  const first = history[0].probability;
  const last = history[history.length - 1].probability;
  const move = Math.round((last - first) * 1000) / 10;
  return (
    <span className="mt-1 flex items-center gap-2">
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-6 w-28 shrink-0" aria-hidden>
        <line x1="0" x2="100" y1={y(mine)} y2={y(mine)} stroke="var(--accent)" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
        <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="text-[10px] text-zinc-500">
        market {pct(first)} → {pct(last)} ({move >= 0 ? "+" : ""}
        {move} pts) · dashed = you
      </span>
    </span>
  );
}

const HORIZON_LABEL: Record<HorizonKey, string> = { "1d": "1 day before close", "7d": "1 week before close" };
const signedPctPts = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 1000) / 10}%`;

export default function Calibration() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [scores, setScores] = useState<Scores | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Resolving can't be undone, so it takes two clicks: pick yes/no, then confirm.
  const [confirming, setConfirming] = useState<{ id: string; outcome: "yes" | "no" } | null>(null);

  const [question, setQuestion] = useState("");
  const [mine, setMine] = useState("");
  const [market, setMarket] = useState("");
  const [source, setSource] = useState("Kalshi");
  const [resolves, setResolves] = useState("");
  const [reasoning, setReasoning] = useState("");

  const [picks, setPicks] = useState<KalshiPick[] | null>(null);
  const [study, setStudy] = useState<KalshiStudy | null | undefined>(undefined); // undefined = loading
  const [horizon, setHorizon] = useState<HorizonKey>("7d");

  // Kalshi lookup: paste a link or ticker, pick a market, and it fills the form.
  const [kalshiQuery, setKalshiQuery] = useState("");
  const [kalshiMarkets, setKalshiMarkets] = useState<KalshiMarket[]>([]);
  const [kalshiBusy, setKalshiBusy] = useState(false);
  const [kalshiError, setKalshiError] = useState<string | null>(null);

  async function lookupKalshi(e: React.FormEvent) {
    e.preventDefault();
    setKalshiBusy(true);
    setKalshiError(null);
    setKalshiMarkets([]);
    const res = await fetch(`/api/calibration/kalshi?q=${encodeURIComponent(kalshiQuery)}`);
    const body = await res.json().catch(() => ({}));
    setKalshiBusy(false);
    if (!res.ok) return setKalshiError(body.error ?? "Kalshi lookup failed.");
    const markets: KalshiMarket[] = body.markets;
    if (markets.length === 1) pickKalshi(markets[0]);
    else setKalshiMarkets(markets);
  }

  function pickKalshi(m: KalshiMarket) {
    setQuestion(m.question.slice(0, 300));
    setMarket(m.probability === null ? "" : String(Math.round(m.probability * 1000) / 10));
    setSource(`Kalshi: ${m.ticker}`); // read back later to check settlement
    if (m.closeTime) setResolves(m.closeTime.slice(0, 10));
    setKalshiMarkets([]);
    setKalshiError(m.probability === null ? "This market has no price yet; enter the market probability yourself." : null);
    document.getElementById("log")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function load() {
    const res = await fetch("/api/calibration");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error ?? "Could not load your predictions.");
    else {
      setPredictions(body.predictions);
      setScores(body.scores);
    }
    setLoading(false);
  }
  useEffect(() => {
    // Deferred a tick so load()'s state updates don't run inside the effect.
    const id = window.setTimeout(load, 0);
    fetch("/api/calibration/picks")
      .then((res) => (res.ok ? res.json() : { picks: [] }))
      .then((body) => setPicks(body.picks ?? []))
      .catch(() => setPicks([]));
    fetch("/api/calibration/study")
      .then((res) => (res.ok ? res.json() : { study: null }))
      .then((body) => setStudy(body.study ?? null))
      .catch(() => setStudy(null));
    return () => window.clearTimeout(id);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/calibration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, myProbability: mine, marketProbability: market, marketSource: source, resolutionDate: resolves, reasoning }),
    });
    setSaving(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? "Could not log that prediction.");
    setQuestion("");
    setMine("");
    setMarket("");
    setResolves("");
    setReasoning("");
    setSource("Kalshi");
    setPicks((list) => list?.filter((x) => `Kalshi: ${x.ticker}` !== source) ?? list);
    load();
  }

  async function act(id: string, method: "POST" | "DELETE", outcome?: "yes" | "no") {
    setError(null);
    const res = await fetch(`/api/calibration/${id}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: outcome ? JSON.stringify({ outcome }) : undefined,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error ?? "That didn't work.");
    setConfirming(null);
    load();
  }

  const open = predictions.filter((p) => p.outcome === null);
  const resolved = predictions.filter((p) => p.outcome !== null);

  return (
    <>
      <Callout className="mt-4" label="how scoring works">
        <p>
          A <strong className="text-foreground">Brier score</strong> measures how good a set of probabilities was. For each
          prediction, take the probability you gave, subtract what happened (1 if yes, 0 if no) and square it; the score is
          the average. Say 80% on something that happened: (0.8 - 1)² = 0.04, good. Say 80% on something that didn&apos;t:
          (0.8 - 0)² = 0.64, bad.
        </p>
        <p className="mt-2">
          <strong className="text-foreground">Lower is better.</strong> 0 is perfect; 0.25 is what you&apos;d get by saying
          50% every time; 1 is confidently wrong every time. The market gets scored the same way, using the price it showed
          when you logged the prediction. If your score is lower than the market&apos;s, your probabilities were closer to
          reality than the crowd&apos;s.
        </p>
      </Callout>

      <Card as="section" className="mt-4">
        <SectionHeader label="scores" description="Over every resolved prediction. Computed on the server from your saved entries." />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard card size="lg" label="Your Brier score" value={brier(scores?.myBrier ?? null)} />
          <StatCard card size="lg" label="Market's Brier score" value={brier(scores?.marketBrier ?? null)} />
          <StatCard
            card
            size="lg"
            label="Difference (market - you)"
            value={
              scores?.edge == null ? (
                "N/A"
              ) : (
                <span className={scores.edge >= 0 ? "text-good" : "text-bad"}>
                  {scores.edge >= 0 ? "+" : ""}
                  {scores.edge.toFixed(3)}
                </span>
              )
            }
            hint={<span className="text-zinc-500">positive = you beat the market</span>}
          />
        </div>
        {scores && <p className="mt-3 text-xs leading-5 text-foreground">{verdict(scores)}</p>}
        <p className="mt-1 text-[11px] leading-5 text-zinc-500">
          {scores?.resolved ?? 0} resolved prediction{scores?.resolved === 1 ? "" : "s"}.{" "}
          {(scores?.resolved ?? 0) < MEANINGFUL_SAMPLE &&
            `With fewer than about ${MEANINGFUL_SAMPLE}, luck swamps skill: treat the comparison as a running tally, not a verdict.`}
        </p>
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader
          label="today's picks"
          description="Live Kalshi markets worth forecasting today: settling within a month, genuinely uncertain (priced 15-85%), busy, and spread across topics. Pick one, think before you look at the price too hard, then log your own number. Refreshed every few hours."
        />
        {picks === null ? (
          <p className="mt-3 text-xs text-zinc-500">Loading today&apos;s markets...</p>
        ) : picks.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">No picks right now (or you&apos;ve logged them all).</p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {picks.map((m) => (
              <li key={m.ticker} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-5 text-foreground">{m.question}</span>
                  <span className="text-[10px] caps text-zinc-500">
                    {m.category} · settles in ~{m.daysLeft} day{m.daysLeft === 1 ? "" : "s"} · market {m.probability === null ? "no price" : pct(m.probability)}
                  </span>
                </span>
                <Button variant="outline" onClick={() => pickKalshi(m)}>
                  Forecast this
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card as="section" className="mt-4" id="log">
        <SectionHeader
          label="log a prediction"
          description="Write down the market's price at the moment you log it, or fill it from Kalshi, which uses Kalshi's price right now (midpoint of the yes bid and ask). Once saved, a prediction can't be edited, so you can't quietly adjust it later; you can delete it while it's still open."
        />
        <form onSubmit={lookupKalshi} className="mt-3 flex flex-wrap items-end gap-3 border-b border-border pb-3">
          <Field
            label="Fill from Kalshi"
            suffix="optional: paste a kalshi.com link or ticker"
            placeholder="https://kalshi.com/markets/kxfed/... or KXFED-26DEC"
            value={kalshiQuery}
            onChange={(e) => setKalshiQuery(e.target.value)}
            wrapperClassName="min-w-0 flex-1"
          />
          <Button type="submit" variant="outline" disabled={kalshiBusy || !kalshiQuery.trim()}>
            {kalshiBusy ? "Looking up..." : "Look up"}
          </Button>
        </form>
        {kalshiError && <p className="mt-2 text-xs leading-5 text-bad">{kalshiError}</p>}
        {kalshiMarkets.length > 1 && (
          <div className="mt-2">
            <p className="text-[11px] text-zinc-500">This event has {kalshiMarkets.length} markets. Pick the one you&apos;re predicting:</p>
            <ul className="mt-1 max-h-64 divide-y divide-border/60 overflow-y-auto border border-border">
              {kalshiMarkets.map((m) => (
                <li key={m.ticker}>
                  <button
                    type="button"
                    onClick={() => pickKalshi(m)}
                    className="flex w-full items-baseline justify-between gap-3 px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-border/40"
                  >
                    <span>{m.question}</span>
                    <span className="shrink-0 tabular-nums text-zinc-500">{m.probability === null ? "no price" : pct(m.probability)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p className="mt-3 text-xs leading-5 text-bad" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Question"
            placeholder="Will the Fed cut rates at the December meeting?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={300}
            required
            wrapperClassName="sm:col-span-2"
          />
          <Field label="My probability" suffix="%" type="number" min={0} max={100} step="0.1" value={mine} onChange={(e) => setMine(e.target.value)} required />
          <Field label="Market probability" suffix="% (price when logged)" type="number" min={0} max={100} step="0.1" value={market} onChange={(e) => setMarket(e.target.value)} required />
          <Field label="Market source" placeholder="Kalshi" value={source} onChange={(e) => setSource(e.target.value)} maxLength={100} required />
          <Field label="Expected resolution date" type="date" value={resolves} onChange={(e) => setResolves(e.target.value)} required />
          <Field
            label="Reasoning"
            suffix="one line"
            placeholder="Why you differ from the market"
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            maxLength={280}
            required
            wrapperClassName="sm:col-span-2"
          />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Log prediction"}
            </Button>
          </div>
        </form>
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader
          label={`open predictions (${open.length})`}
          description="Resolve one when the event is settled. Resolving is final: a resolved prediction can't be edited, un-resolved or deleted."
        />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className={tableHeadCellClass}>Question</th>
                <th className={`${tableHeadCellClass} text-right`}>Me</th>
                <th className={`${tableHeadCellClass} text-right`}>Market</th>
                <th className={tableHeadCellClass}>Resolves</th>
                <th className={tableHeadCellClass}>Resolve</th>
              </tr>
            </thead>
            <tbody>
              {open.map((p) => (
                <tr key={p.id} className={`${tableRowClass} align-top`}>
                  <td className={`${tableCellClass} pr-3 leading-4`}>
                    <span className="text-foreground">{p.question}</span>
                    <span className="mt-0.5 block text-[11px] text-zinc-500">
                      {p.reasoning} · {p.marketSource}, logged {fmtDate(p.entryDate)}
                    </span>
                    {p.kalshi && (
                      <span className="mt-0.5 block text-[11px]">
                        {p.kalshi.result ? (
                          <>
                            <span className={p.kalshi.result === "yes" ? "text-good" : "text-bad"}>
                              Kalshi settled {p.kalshi.result.toUpperCase()}
                            </span>{" "}
                            <button
                              type="button"
                              onClick={() => setConfirming({ id: p.id, outcome: p.kalshi!.result! })}
                              className="caps text-[10px] text-accent hover:underline"
                            >
                              resolve to match
                            </button>
                          </>
                        ) : (
                          <span className="text-zinc-500">
                            Kalshi now {p.kalshi.probability === null ? "no price" : pct(p.kalshi.probability)} ({p.kalshi.status})
                          </span>
                        )}
                      </span>
                    )}
                    {p.history && <PriceTrail history={p.history} mine={p.myProbability} color="var(--chart-line)" />}
                  </td>
                  <td className={`${tableCellStrongClass} pr-3 text-right`}>{pct(p.myProbability)}</td>
                  <td className={`${tableCellClass} pr-3 text-right`}>{pct(p.marketProbability)}</td>
                  <td className={`${tableCellClass} whitespace-nowrap pr-3`}>{fmtDate(p.resolutionDate)}</td>
                  <td className={`${tableCellClass} whitespace-nowrap`}>
                    {confirming?.id === p.id ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-foreground">
                          Mark {confirming.outcome.toUpperCase()}? This is final.
                        </span>
                        <Button onClick={() => act(p.id, "POST", confirming.outcome)}>Confirm</Button>
                        <Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
                      </span>
                    ) : (
                      <span className="flex gap-2">
                        <Button variant="outline" onClick={() => setConfirming({ id: p.id, outcome: "yes" })}>Yes</Button>
                        <Button variant="outline" onClick={() => setConfirming({ id: p.id, outcome: "no" })}>No</Button>
                        <button
                          type="button"
                          onClick={() => act(p.id, "DELETE")}
                          className="text-[10px] caps text-zinc-500 transition-colors hover:text-bad"
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && open.length === 0 && <EmptyRow colSpan={5}>no open predictions</EmptyRow>}
              {loading && <EmptyRow colSpan={5}>loading...</EmptyRow>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader
          label={`resolved predictions (${resolved.length})`}
          description="Locked: these can't be edited or deleted. 'Score' is each prediction's own Brier contribution, (probability - outcome)²; lower is better."
        />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className={tableHeadRowClass}>
                <th className={tableHeadCellClass}>Question</th>
                <th className={tableHeadCellClass}>Outcome</th>
                <th className={`${tableHeadCellClass} text-right`}>Me</th>
                <th className={`${tableHeadCellClass} text-right`}>Market</th>
                <th className={`${tableHeadCellClass} text-right`}>My score</th>
                <th className={`${tableHeadCellClass} text-right`}>Market score</th>
              </tr>
            </thead>
            <tbody>
              {resolved.map((p) => {
                const me = sq(p.myProbability, p.outcome!);
                const mkt = sq(p.marketProbability, p.outcome!);
                return (
                  <tr key={p.id} className={`${tableRowClass} align-top`}>
                    <td className={`${tableCellClass} pr-3 leading-4`}>
                      <span className="text-foreground">{p.question}</span>
                      <span className="mt-0.5 block text-[11px] text-zinc-500">
                        {p.reasoning} · {p.marketSource}, resolved {fmtDate(p.resolvedAt!)}
                        {p.marketSource.startsWith("Kalshi: ") && " (settled by Kalshi)"}
                      </span>
                      {p.history && (
                        <PriceTrail history={p.history} mine={p.myProbability} color={p.outcome ? "var(--status-good)" : "var(--status-bad)"} />
                      )}
                    </td>
                    <td className={`${tableCellClass} pr-3 caps ${p.outcome ? "text-good" : "text-bad"}`}>
                      {p.outcome ? "yes" : "no"}
                    </td>
                    <td className={`${tableCellClass} pr-3 text-right`}>{pct(p.myProbability)}</td>
                    <td className={`${tableCellClass} pr-3 text-right`}>{pct(p.marketProbability)}</td>
                    <td className={`${tableCellStrongClass} pr-3 text-right ${me < mkt ? "text-good" : me > mkt ? "text-bad" : ""}`}>
                      {me.toFixed(3)}
                    </td>
                    <td className={`${tableCellClass} text-right`}>{mkt.toFixed(3)}</td>
                  </tr>
                );
              })}
              {!loading && resolved.length === 0 && <EmptyRow colSpan={6}>nothing resolved yet</EmptyRow>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader
          label="your calibration"
          description="Your resolved predictions grouped by the probability you gave. If you're well calibrated, the dots sit on the dashed line: things you called 70% happened about 70% of the time. Dots below the line mean you were too confident something would happen; above it, not confident enough. The market's prices at entry are shown for comparison."
        />
        {resolved.length < 1 ? (
          <p className="mt-3 text-xs text-zinc-500">Resolve some predictions to see your chart. It needs a few dozen before the pattern means much.</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-4 text-[10px] caps text-zinc-500">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[var(--series-1)]" /> You</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[var(--chart-muted)]" /> Market at entry</span>
            </div>
            <CalibrationChart
              series={[
                { name: "You", color: "var(--series-1)", bins: calibrationBins(resolved.map((p) => ({ p: p.myProbability, outcome: p.outcome! }))) },
                { name: "Market", color: "var(--chart-muted)", bins: calibrationBins(resolved.map((p) => ({ p: p.marketProbability, outcome: p.outcome! }))) },
              ]}
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              Based on {resolved.length} resolved prediction{resolved.length === 1 ? "" : "s"}
              {resolved.length < MEANINGFUL_SAMPLE && "; with this few, each dot can swing a lot on one result"}.
            </p>
          </>
        )}
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader
          label="is kalshi calibrated?"
          description="The same chart for the market itself: thousands of settled Kalshi markets from the last year, each placed by its price shortly before it closed and whether it happened. Where the crowd's prices drift off the line is exactly where a careful forecaster can find an edge."
        />
        {study === undefined ? (
          <ChartLoading className="mt-3 h-72 sm:h-80" />
        ) : study === null ? (
          <p className="mt-3 text-xs text-zinc-500">The study is still being collected (a fifth of Kalshi&apos;s markets each weekday). Check back tomorrow.</p>
        ) : (
          (() => {
            const h = study.horizons[horizon];
            return (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {(Object.keys(HORIZON_LABEL) as HorizonKey[]).map((k) => (
                    <Chip key={k} active={horizon === k} onClick={() => setHorizon(k)}>
                      Price {HORIZON_LABEL[k]}
                    </Chip>
                  ))}
                  <span className="text-[11px] text-zinc-500">
                    {h.markets.toLocaleString()} markets from {study.seriesScanned} weekly/monthly/quarterly series, {fmtDate(study.from)} to {fmtDate(study.to)}
                  </span>
                </div>
                <CalibrationChart series={[{ name: "Kalshi", color: "var(--accent)", bins: h.bins }]} />
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left">
                    <thead>
                      <tr className={tableHeadRowClass}>
                        <th className={tableHeadCellClass}>Market priced</th>
                        <th className={`${tableHeadCellClass} text-right`}>Markets</th>
                        <th className={`${tableHeadCellClass} text-right`}>Average price</th>
                        <th className={`${tableHeadCellClass} text-right`}>Actually happened</th>
                        <th className={`${tableHeadCellClass} text-right`}>Gap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {h.bins.map((b) => {
                        const gap = b.hitRate - b.avgProbability;
                        return (
                          <tr key={b.lo} className={tableRowClass}>
                            <td className={tableCellClass}>{Math.round(b.lo * 100)}-{Math.round(b.lo * 100) + 10}%</td>
                            <td className={`${tableCellClass} text-right`}>{b.count.toLocaleString()}</td>
                            <td className={`${tableCellClass} text-right`}>{pct(b.avgProbability)}</td>
                            <td className={`${tableCellStrongClass} text-right`}>{pct(b.hitRate)}</td>
                            <td className={`${tableCellClass} text-right ${Math.abs(gap) < 0.03 ? "" : gap > 0 ? "text-good" : "text-bad"}`}>
                              {signedPctPts(gap)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {(h.longshots || h.favourites) && (
                  <Callout className="mt-3" label="the favourite-longshot bias">
                    {h.longshots && (
                      <p>
                        <strong className="text-foreground">Long shots</strong> (priced under 20%): the market said {pct(h.longshots.avgPrice)} on
                        average; they happened {pct(h.longshots.hitRate)} of the time. Buying YES on every one would have returned{" "}
                        <strong className={h.longshots.returnPerDollar >= 0 ? "text-good" : "text-bad"}>{signedPctPts(h.longshots.returnPerDollar)}</strong>{" "}
                        per dollar, before fees ({h.longshots.count.toLocaleString()} markets).
                      </p>
                    )}
                    {h.favourites && (
                      <p className="mt-2">
                        <strong className="text-foreground">Favourites</strong> (over 80%): priced {pct(h.favourites.avgPrice)}, happened{" "}
                        {pct(h.favourites.hitRate)}; buying YES on every one returned{" "}
                        <strong className={h.favourites.returnPerDollar >= 0 ? "text-good" : "text-bad"}>{signedPctPts(h.favourites.returnPerDollar)}</strong>{" "}
                        per dollar ({h.favourites.count.toLocaleString()} markets).
                      </p>
                    )}
                    <p className="mt-2">
                      People like lottery tickets: they overpay for small chances of a big payout, which leaves the likely outcomes a
                      little underpriced. It&apos;s one of the oldest findings about betting markets.
                    </p>
                  </Callout>
                )}
                <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                  Caveats: markets in the same event (say, every strike of one CPI print) move together, so the sample is smaller
                  than it looks; prices are daily midpoints of the bid and ask; returns ignore Kalshi&apos;s fees, which eat most of
                  a few-percent edge. Educational, not trading advice.
                </p>
              </>
            );
          })()
        )}
      </Card>

      <p className="mt-4 text-[10px] leading-4 text-zinc-500">
        A personal forecasting log for learning, not trading advice. Nothing here connects to a betting or trading account.
      </p>
    </>
  );
}
