"use client";

// Factor risk attribution: sliders for the asset mix on the left, the risk
// decomposition on the right. All math is in lib/factorRisk.ts and runs
// synchronously on every slider move — it's three weights and a 3×3 matrix.
import { useState } from "react";
import { Card, Slider, StatCard, Term } from "@/components/ui";
import { ASSETS, FACTORS, attribute, type AssetKey, type FactorKey } from "@/lib/factorRisk";

const ASSET_COLOR: Record<AssetKey, string> = { equities: "#c4b5fd", bonds: "#93c5fd", commodities: "#fdba74" };

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
const signedPct = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${(Math.abs(v) * 100).toFixed(digits)}%`;
const num = (v: number, digits = 2) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;

export function FactorRiskAttribution() {
  const [weights, setWeights] = useState<Record<AssetKey, number>>({ equities: 60, bonds: 30, commodities: 10 });
  const a = attribute(weights);

  // Moving one slider rescales the other two so the mix always sums to
  // 100% — a portfolio is fully invested, not a set of independent dials.
  function setWeight(key: AssetKey, value: number) {
    const others = ASSETS.filter((x) => x.key !== key).map((x) => x.key);
    const otherTotal = others.reduce((s, k) => s + weights[k], 0);
    const remaining = 100 - value;
    const next = { ...weights, [key]: value };
    for (const k of others) next[k] = otherTotal > 0 ? (weights[k] / otherTotal) * remaining : remaining / others.length;
    setWeights(next);
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-5">
      {/* Left: allocation */}
      <Card padding="sm" className="lg:col-span-2">
        <p className="text-[10px] caps text-zinc-500">Asset allocation</p>
        <div className="mt-3 space-y-4">
          {ASSETS.map((asset) => (
            <Slider
              key={asset.key}
              label={asset.label}
              value={Math.round(weights[asset.key])}
              min={0}
              max={100}
              onChange={(v) => setWeight(asset.key, v)}
              display={pct(a.weights[asset.key], 0)}
              color={ASSET_COLOR[asset.key]}
              hint={
                <>
                  β<sub>mkt</sub> {num(asset.betas.market, 2)} · β<sub>rates</sub> {num(asset.betas.rates, 2)} · β<sub>inf</sub> {num(asset.betas.inflation, 2)}
                </>
              }
            />
          ))}
        </div>

        {/* Mix bar */}
        <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-border">
          {ASSETS.map((asset) => (
            <div key={asset.key} className="h-full transition-[width] duration-300 ease-out" style={{ width: pct(a.weights[asset.key]), background: ASSET_COLOR[asset.key] }} />
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-4 text-zinc-500">
          Moving one slider rescales the other two so the book stays fully invested. Loadings per asset class are stylised long-run figures — see the
          <Term term="factorRegression" className="ml-1">
            factor model
          </Term>
          .
        </p>
      </Card>

      {/* Right: attribution */}
      <div className="space-y-3 lg:col-span-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard card label="Portfolio alpha" term="alpha" value={<span className={a.alpha >= 0 ? "text-good" : "text-bad"}>{signedPct(a.alpha, 2)}</span>} hint={<span className="text-zinc-500">per year, after factor premia</span>} />
          <StatCard card label="Systemic beta" term="systemicBeta" value={num(a.systemicBeta)} hint={<span className="text-zinc-500">loading on equity market</span>} />
          <StatCard card label="R-squared" term="rSquared" value={num(a.rSquared)} hint={<span className="text-zinc-500">{pct(a.rSquared, 0)} explained by factors</span>} />
          <StatCard card label="Volatility" term="volatility" value={pct(a.volatility)} hint={<span className="text-zinc-500">{pct(a.factorVolatility)} from factors</span>} />
        </div>

        <Card padding="sm">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[10px] caps text-zinc-500">Risk contribution by factor</p>
            <p className="text-[10px] caps text-zinc-500">share of variance</p>
          </div>

          {/* Stacked bar */}
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-border">
            {a.contributions.map((c) => (
              <div
                key={c.key}
                className="h-full transition-[width] duration-300 ease-out first:rounded-l-full last:rounded-r-full"
                style={{ width: pct(Math.max(c.share, 0)), background: c.color }}
                title={`${c.label} ${pct(c.share)}`}
              />
            ))}
          </div>

          {/* Per-factor bars */}
          <ul className="mt-4 space-y-3">
            {a.contributions.map((c) => {
              const loading = c.key === "residual" ? null : a.loadings[c.key as FactorKey];
              const factor = FACTORS.find((f) => f.key === c.key);
              return (
                <li key={c.key}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="flex items-center gap-2 text-foreground">
                      <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                      {c.label}
                      {loading !== null && (
                        <span className="text-[10px] tabular-nums text-zinc-500">
                          β {num(loading)}
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums text-foreground">{pct(c.share)}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-border">
                    <div className="h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: pct(Math.max(c.share, 0)), background: c.color }} />
                  </div>
                  {factor && <p className="mt-1 text-[10px] leading-4 text-zinc-500">{factor.describe}</p>}
                </li>
              );
            })}
          </ul>

          <p className="mt-4 border-t border-border pt-3 text-[10px] leading-4 text-zinc-500">
            Each factor&apos;s share is its loading times its marginal contribution to variance, β<sub>i</sub> × (Σβ)<sub>i</sub> ÷ σ²<sub>p</sub>; the shares add
            to 100% with the asset-specific residual. A share can go slightly negative when one factor hedges another (bonds&apos; rate exposure against an
            inflation shock, for example). Expected return {signedPct(a.expectedReturn)} per year. Educational, not investment advice.
          </p>
        </Card>
      </div>
    </div>
  );
}
