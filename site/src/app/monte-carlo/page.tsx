"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { formatCurrency, formatPercent } from "@/lib/format";
import { Button, Callout, Card, Field, PageShell, SectionHeader, StatCard } from "@/components/ui";

const Chart = dynamic(() => import("./Chart"), {
  ssr: false,
  loading: () => <div className="mt-4 h-72 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />,
});

type YearlyBand = { year: number; p10: number; p50: number; p90: number };

type SimulationResponse = {
  bands: YearlyBand[];
  probabilityOfHittingGoal: number;
  assumptions: { annualReturn: number; annualVolatility: number };
};

export default function MonteCarlo() {
  const [startingBalance, setStartingBalance] = useState("50000");
  const [annualContribution, setAnnualContribution] = useState("10000");
  const [stockAllocationPct, setStockAllocationPct] = useState(80);
  const [years, setYears] = useState("30");
  const [goal, setGoal] = useState("1000000");

  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runSimulation(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/monte-carlo/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startingBalance: Number(startingBalance) || 0,
          annualContribution: Number(annualContribution) || 0,
          stockAllocationPct: stockAllocationPct / 100,
          years: Number(years) || 1,
          goal: Number(goal) || 0,
        }),
      });
      if (!res.ok) throw new Error("Simulation failed");
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell
      eyebrow="monte carlo simulator"
      title="Monte Carlo Simulator"
      description="Runs 10,000 simulated portfolio paths from your inputs, using real historical SPY/AGG returns to estimate a stock/bond blend's expected return and volatility."
    >
      <Card as="section" className="mt-8">
        <SectionHeader label="inputs" />
        <form onSubmit={runSimulation} className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field
            label="Starting Balance"
            suffix="$"
            type="number"
            step="any"
            value={startingBalance}
            onChange={(e) => setStartingBalance(e.target.value)}
          />
          <Field
            label="Annual Contribution"
            suffix="$"
            type="number"
            step="any"
            value={annualContribution}
            onChange={(e) => setAnnualContribution(e.target.value)}
          />
          <Field
            label="Years"
            type="number"
            step="1"
            min="1"
            max="60"
            value={years}
            onChange={(e) => setYears(e.target.value)}
          />
          <Field
            label="Goal"
            suffix="$"
            type="number"
            step="any"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <label className="col-span-2 block sm:col-span-2">
            <span className="block text-xs text-zinc-500">
              Allocation ({stockAllocationPct}% stocks / {100 - stockAllocationPct}% bonds)
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={stockAllocationPct}
              onChange={(e) => setStockAllocationPct(Number(e.target.value))}
              className="mt-3 w-full accent-accent"
            />
          </label>
          <div className="col-span-2 flex items-end sm:col-span-3">
            <Button type="submit" loading={loading} loadingLabel="Simulating...">
              Run Simulation
            </Button>
          </div>
        </form>
      </Card>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      {result && (
        <>
          <section className="mt-8 grid grid-cols-2 gap-4">
            <StatCard
              card
              size="lg"
              label="Probability of Hitting Goal"
              value={formatPercent(result.probabilityOfHittingGoal, { decimals: 0 })}
            />
            <StatCard
              card
              size="lg"
              label="Median Final Balance"
              value={formatCurrency(result.bands[result.bands.length - 1]?.p50 ?? 0)}
            />
          </section>

          <section className="mt-8">
            <SectionHeader
              label="projected balance"
              description="10th / 50th / 90th percentile across all simulated paths each year."
            />
            <Chart bands={result.bands} />
          </section>

          <Callout label="assumptions" className="mt-8">
            Assumed {formatPercent(result.assumptions.annualReturn)} annual return and{" "}
            {formatPercent(result.assumptions.annualVolatility)} annual volatility, blended from
            ~5 years of real SPY/AGG history at your chosen allocation. Each simulated year draws
            a random return from a normal distribution around these numbers — real returns have
            fatter tails than normal predicts, so this likely understates how bad a truly bad
            stretch could be.
          </Callout>
        </>
      )}
    </PageShell>
  );
}
