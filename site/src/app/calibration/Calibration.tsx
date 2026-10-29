"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Callout,
  Card,
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
import { MEANINGFUL_SAMPLE, type Prediction, type Scores } from "@/lib/calibration";

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
          label="log a prediction"
          description="Write down the market's price at the moment you log it. Once saved, a prediction can't be edited, so you can't quietly adjust it later; you can delete it while it's still open."
        />
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
                      </span>
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

      <p className="mt-4 text-[10px] leading-4 text-zinc-500">
        A personal forecasting log for learning, not trading advice. Nothing here connects to a betting or trading account.
      </p>
    </>
  );
}
