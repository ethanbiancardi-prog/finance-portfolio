"use client";

// Six-persona AI takes on a ticker. The route briefs the model with the
// latest 10-K ratios, current price, and headlines before it writes, and
// reports back what it used so we can show it under the takes.
import { useState } from "react";
import { Button, Callout, Card, SectionHeader } from "@/components/ui";

type PersonaTake = { name: string; take: string };
type Analysis = {
  personas: PersonaTake[];
  key_disagreement: string;
  basedOn: { priceAsOf: string | null; fiscalYearEnd: string | null; headlines: number };
};

function basedOnLabel(b: Analysis["basedOn"]) {
  const parts = [
    b.priceAsOf
      ? `price as of ${new Date(b.priceAsOf).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
      : "no live price",
    b.fiscalYearEnd ? `10-K for FY ending ${b.fiscalYearEnd}` : "no 10-K data",
    b.headlines ? `${b.headlines} recent headlines` : "no headlines",
  ];
  return `Based on: ${parts.join(" / ")}`;
}

export function AnalysisPanel({ ticker }: { ticker: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analyzedTicker, setAnalyzedTicker] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    setAnalysis(null);

    const res = await fetch("/api/research/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker }),
    });

    if (!res.ok) {
      setError("Analysis failed.");
      setLoading(false);
      return;
    }

    setAnalysis(await res.json());
    setAnalyzedTicker(ticker);
    setLoading(false);
  }

  const stale = analysis && analyzedTicker !== ticker;

  return (
    <Card as="section" className="mt-4">
      <SectionHeader
        label="ai analysis"
        description="Six takes on the ticker, each grounded in the latest filing, current price, and headlines, then the sharpest disagreement between them. AI-generated — a starting point for your own thesis, not a recommendation."
      />
      <div className="mt-3 flex items-center gap-3">
        <Button onClick={run} loading={loading} loadingLabel="Analyzing...">
          Analyze {ticker}
        </Button>
        {stale && <span className="text-[10px] caps text-zinc-600">showing {analyzedTicker}</span>}
      </div>

      {error && <p className="mt-3 text-xs text-bad">{error}</p>}

      {analysis && (
        <div className="mt-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {analysis.personas.map((p) => (
              <Card key={p.name} padding="sm">
                <p className="text-[10px] caps text-accent">{p.name}</p>
                <p className="mt-1.5 text-xs leading-5 text-zinc-400">{p.take}</p>
              </Card>
            ))}
          </div>
          <Callout label="key disagreement" className="mt-3">
            {analysis.key_disagreement}
          </Callout>
          <p className="mt-2 text-[10px] caps text-zinc-600">{basedOnLabel(analysis.basedOn)}</p>
        </div>
      )}
    </Card>
  );
}
