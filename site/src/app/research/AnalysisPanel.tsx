"use client";

// Six AI analysts on a ticker, each answering a different question from its
// own slice of the data (business, safety, price, news, biggest risk, plain
// summary). The route briefs the model with the latest 10-K ratios, current
// price, and relevant headlines, and reports back what it used so we can show
// it under the takes.
import { useState } from "react";
import { Button, Card, Section, StatusBadge, type Rating } from "@/components/ui";
import { SimpleText } from "./SimpleMode";

type Role = "business" | "safety" | "price" | "news" | "skeptic" | "summary";
type Stance = "bullish" | "neutral" | "bearish";
type AnalystTake = { role: Role; stance: Stance; verdict: string; reasons: string[]; change_mind: string };
type Analysis = {
  analysts: AnalystTake[];
  basedOn: { priceAsOf: string | null; fiscalYearEnd: string | null; headlines: number };
};

const ROLES: Record<Role, { name: string; question: string }> = {
  business: { name: "Business", question: "Is it growing and becoming more profitable?" },
  safety: { name: "Safety", question: "Could it survive a bad year?" },
  price: { name: "Price", question: "Is the stock expensive for what you get?" },
  news: { name: "News", question: "What changed recently?" },
  skeptic: { name: "Skeptic", question: "What's the biggest thing that could go wrong?" },
  summary: { name: "Plain-English summary", question: "What does it all mean?" },
};

const STANCE: Record<Stance, { rating: Rating; label: string }> = {
  bullish: { rating: "good", label: "Bullish" },
  neutral: { rating: "average", label: "Neutral" },
  bearish: { rating: "bad", label: "Bearish" },
};

function basedOnLabel(b: Analysis["basedOn"]) {
  const parts = [
    b.priceAsOf
      ? `price as of ${new Date(b.priceAsOf).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
      : "no live price",
    b.fiscalYearEnd ? `10-K for FY ending ${b.fiscalYearEnd}` : "no 10-K data",
    b.headlines ? `${b.headlines} relevant headlines` : "no relevant headlines",
  ];
  return `Based on: ${parts.join(" / ")}`;
}

// The route streams one JSON object per line (see api/research/analysis):
// progress, then each analyst's take as soon as it's written, then "done".
type StreamLine =
  | { type: "status"; stage: "briefing" | "thinking" }
  | { type: "take"; take: AnalystTake }
  | { type: "done"; basedOn: Analysis["basedOn"] }
  | { type: "error"; message: string };

const STAGE_LABEL = {
  briefing: "Reading the 10-K, price and headlines...",
  thinking: "Analysts are thinking. Each answer appears here as soon as it's written.",
};

const PANEL_ROLES: Role[] = ["business", "safety", "price", "news", "skeptic"];

export function AnalysisPanel({ ticker }: { ticker: string }) {
  const [takes, setTakes] = useState<AnalystTake[]>([]);
  const [basedOn, setBasedOn] = useState<Analysis["basedOn"] | null>(null);
  const [stage, setStage] = useState<keyof typeof STAGE_LABEL | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analyzedTicker, setAnalyzedTicker] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    setTakes([]);
    setBasedOn(null);
    setStage(null);
    setAnalyzedTicker(ticker);

    try {
      const res = await fetch("/api/research/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Analysis failed.");
      }

      // Read the stream line by line; a line can arrive split across chunks,
      // so keep the unfinished tail until its newline shows up.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const raw of lines) {
          if (!raw.trim()) continue;
          const line = JSON.parse(raw) as StreamLine;
          if (line.type === "status") setStage(line.stage);
          else if (line.type === "take") setTakes((prev) => [...prev.filter((t) => t.role !== line.take.role), line.take]);
          else if (line.type === "done") {
            setBasedOn(line.basedOn);
            finished = true;
          } else if (line.type === "error") throw new Error(line.message);
        }
      }
      if (!finished) throw new Error("The analysis stopped early. Try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setLoading(false);
      setStage(null);
    }
  }

  const started = loading || takes.length > 0;
  const stale = started && analyzedTicker !== ticker;
  const summaryTake = takes.find((a) => a.role === "summary");
  const panel = PANEL_ROLES.map((role) => takes.find((t) => t.role === role) ?? role);
  const arrived = takes.filter((a) => a.role !== "summary");
  const tally = (s: Stance) => arrived.filter((a) => a.stance === s).length;

  const summary = basedOn
    ? `${tally("bullish")} bullish · ${tally("neutral")} neutral · ${tally("bearish")} bearish${summaryTake ? `. ${summaryTake.verdict}` : ""}`
    : loading
      ? undefined
      : "Six analysts, six different questions, open and run to see their answers";

  return (
    <Section id="analysts" label="Six AI analysts" status={loading ? "loading" : basedOn ? "ready" : "idle"} summary={summary}>
      <p className="text-[11px] leading-5 text-zinc-500">
        Each analyst answers one question from its own part of the data, so they don&apos;t repeat each other: the business, its safety, the
        price, the news, the biggest risk, then a plain-English summary. AI-generated from the latest filing, current price, and headlines
        about this company, a starting point for your own thinking, not a recommendation.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={run} loading={loading} loadingLabel="Analyzing...">
          Analyze {ticker}
        </Button>
        {stale && <span className="text-[10px] caps text-zinc-600">showing {analyzedTicker}</span>}
      </div>

      {stage && <p className="mt-3 text-[11px] text-zinc-500">{STAGE_LABEL[stage]}</p>}
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}

      {started && (
        <div className="mt-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {panel.map((a) =>
              typeof a === "string" ? (
                loading && <PendingCard key={a} role={a} />
              ) : (
                <TakeCard key={a.role} take={a} ticker={analyzedTicker} />
              ),
            )}
          </div>
          <div className="mt-2">
            {summaryTake ? (
              <TakeCard take={summaryTake} ticker={analyzedTicker} highlight />
            ) : (
              loading && <PendingCard role="summary" />
            )}
          </div>
          {basedOn && <p className="mt-2 text-[10px] caps text-zinc-600">{basedOnLabel(basedOn)}</p>}
        </div>
      )}
    </Section>
  );
}

// A placeholder for an analyst whose take hasn't arrived yet.
function PendingCard({ role }: { role: Role }) {
  return (
    <Card padding="sm" className={`animate-pulse ${role === "summary" ? "border-l-2 border-l-accent" : ""}`}>
      <p className="text-[10px] caps text-accent">{ROLES[role].name}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500">{ROLES[role].question}</p>
      <p className="mt-2 text-[11px] text-zinc-600">Thinking...</p>
    </Card>
  );
}

function TakeCard({ take, ticker, highlight = false }: { take: AnalystTake; ticker: string; highlight?: boolean }) {
  const role = ROLES[take.role];
  const stance = STANCE[take.stance];
  return (
    <Card padding="sm" className={highlight ? "border-l-2 border-l-accent" : undefined}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] caps text-accent">{role.name}</p>
        <StatusBadge rating={stance.rating} label={stance.label} />
      </div>
      <p className="mt-0.5 text-[11px] text-zinc-500">{role.question}</p>
      <p className="mt-2 text-xs leading-5 text-foreground">{take.verdict}</p>
      <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs leading-5 text-zinc-400 marker:text-zinc-600">
        {take.reasons.map((r, i) => (
          <li key={i}>
            <SimpleText text={r} context={`${role.name} analyst on ${ticker}: ${role.question}`} />
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] leading-5 text-zinc-500">
        <span className="text-zinc-600">Would change my mind: </span>
        {take.change_mind}
      </p>
    </Card>
  );
}
