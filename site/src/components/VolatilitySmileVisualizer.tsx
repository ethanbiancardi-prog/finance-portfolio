"use client";

// Implied-volatility smile sandbox: dials for the ATM level ("fear"), skew,
// wing steepness and expiry reshape the curve live; hovering a strike shows its
// IV, moneyness and the Black-Scholes price at that vol. Model and formulas
// live in lib/volSmile.ts.
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { Card, Slider, Term, chartAxisProps, chartGridProps, chartTooltipStyle } from "@/components/ui";
import { DEFAULT_SMILE, blackScholes, moneyness, smileCurve, type OptionType, type SmilePoint, type SmileParams } from "@/lib/volSmile";

const CURVE = { from: "#67e8f9", to: "#818cf8" }; // cyan → indigo
const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
const usd = (v: number) => `$${v.toFixed(2)}`;

export function VolatilitySmileVisualizer() {
  const [p, setP] = useState<SmileParams>(DEFAULT_SMILE);
  const [type, setType] = useState<OptionType>("put");
  const points = smileCurve(p);
  const set = (patch: Partial<SmileParams>) => setP((prev) => ({ ...prev, ...patch }));
  const T = p.days / 365;

  // Y range with a little headroom so the curve floats rather than touching the frame.
  const ivs = points.map((q) => q.iv);
  const yMin = Math.max(0, Math.floor((Math.min(...ivs) - 0.03) * 20) / 20);
  const yMax = Math.ceil((Math.max(...ivs) + 0.03) * 20) / 20;

  return (
    <div className="mt-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Chart */}
        <Card padding="sm" className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] caps text-zinc-500">
              <Term term="impliedVol">Implied volatility</Term> by strike · spot ${p.spot} · {p.days}d
            </p>
            <div className="inline-flex rounded-[var(--radius-sm)] border border-border p-0.5" role="tablist" aria-label="Option type">
              {(["put", "call"] as OptionType[]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={type === t}
                  onClick={() => setType(t)}
                  className={`rounded-[var(--radius-sm)] px-2 py-0.5 text-[10px] caps transition-colors duration-150 ${type === t ? "bg-accent/10 text-accent" : "text-zinc-500 hover:text-foreground"}`}
                >
                  {t === "put" ? "Puts" : "Calls"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="vs-stroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={CURVE.from} />
                    <stop offset="100%" stopColor={CURVE.to} />
                  </linearGradient>
                  <linearGradient id="vs-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CURVE.from} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={CURVE.to} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...chartGridProps} vertical={false} />
                <XAxis dataKey="strike" type="number" domain={["dataMin", "dataMax"]} {...chartAxisProps} tickFormatter={(v: number) => `${v}`} tickCount={9} />
                <YAxis {...chartAxisProps} width={44} domain={[yMin, yMax]} tickFormatter={(v: number) => pct(v, 0)} />
                <ReferenceLine x={p.spot} stroke="var(--chart-muted)" strokeDasharray="3 3" label={{ value: "ATM", position: "insideTopRight", fontSize: 10, fill: "var(--chart-muted)" }} />
                <Tooltip cursor={{ stroke: CURVE.from, strokeOpacity: 0.6, strokeDasharray: "2 2" }} content={<Crosshair type={type} p={p} T={T} />} isAnimationActive={false} />
                <Area
                  type="monotone"
                  dataKey="iv"
                  stroke="url(#vs-stroke)"
                  strokeWidth={2.5}
                  fill="url(#vs-fill)"
                  dot={false}
                  activeDot={{ r: 4, stroke: CURVE.from, strokeWidth: 2, fill: "var(--panel)" }}
                  animationDuration={220}
                  animationEasing="ease-out"
                  style={{ filter: `drop-shadow(0 0 8px ${CURVE.from}55)` }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[10px] text-zinc-500">
            Hover a strike. <Term term="moneyness">ITM / ATM / OTM</Term> is shown for {type === "put" ? "puts" : "calls"}; the price is Black-Scholes at that
            strike&apos;s IV with r = {pct(p.rate, 0)}.
          </p>
        </Card>

        {/* Controls */}
        <Card padding="sm">
          <p className="text-[10px] caps text-zinc-500">Dials</p>
          <div className="mt-3 space-y-4">
            <Slider
              label="Market fear index"
              value={Math.round(p.fear * 100)}
              min={8}
              max={80}
              onChange={(v) => set({ fear: v / 100 })}
              display={pct(p.fear, 0)}
              color={CURVE.from}
              hint="At-the-money implied vol — the VIX dial. Lifts the whole curve."
            />
            <Slider
              label="Skew steepness"
              value={Math.round(p.skew * 100)}
              min={0}
              max={95}
              onChange={(v) => set({ skew: v / 100 })}
              display={`ρ −${p.skew.toFixed(2)}`}
              color={CURVE.to}
              hint="Tilts the curve: low strikes carry more vol than high ones. Zero is a symmetric smile; index options sit around 0.7–0.9."
            />
            <Slider
              label="Wing steepness"
              value={Math.round(p.wings * 100)}
              min={1}
              max={15}
              onChange={(v) => set({ wings: v / 100 })}
              display={p.wings.toFixed(2)}
              hint="How fast vol climbs away from the money on both sides — the market paying extra for big moves either way."
            />
            <Slider
              label="Days to expiry"
              value={p.days}
              min={7}
              max={365}
              onChange={(v) => set({ days: v })}
              display={`${p.days}d`}
              hint="Short-dated smiles are steeper: the same skew in vol units is spread over less time."
            />
          </div>
          <button
            type="button"
            onClick={() => setP(DEFAULT_SMILE)}
            className="mt-4 text-[11px] text-accent underline decoration-border underline-offset-4 hover:decoration-accent"
          >
            Reset to a calm market
          </button>
          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
            {[0.9, 1, 1.1].map((k) => {
              const strike = p.spot * k;
              const iv = points.reduce((best, q) => (Math.abs(q.strike - strike) < Math.abs(best.strike - strike) ? q : best)).iv;
              return (
                <div key={k}>
                  <dt className="text-[10px] caps text-zinc-500">{k === 1 ? "ATM" : `${Math.round(k * 100)}% strike`}</dt>
                  <dd className="text-sm tabular-nums text-foreground">{pct(iv)}</dd>
                </div>
              );
            })}
          </dl>
        </Card>
      </div>

      {/* Educational card */}
      <Card padding="sm" className="mt-3">
        <p className="text-[10px] caps text-zinc-500">Why the curve is never flat</p>
        <div className="mt-2 grid grid-cols-1 gap-4 text-xs leading-5 text-zinc-400 md:grid-cols-3">
          <div>
            <p className="text-foreground">Black-Scholes says it should be.</p>
            <p className="mt-1">
              The model assumes one volatility for the stock, so every strike should imply the same number. Before October 1987 index options roughly
              did. Since then the left side has sat permanently higher — the model is missing something the market prices.
            </p>
          </div>
          <div>
            <p className="text-foreground">Hedging demand is one-sided.</p>
            <p className="mt-1">
              Almost everyone who owns stocks wants insurance against a crash, so there is steady buying of out-of-the-money puts. Nobody needs
              insurance against a rally, and many holders sell calls above the market for income. Heavy bid on the left, steady offer on the right: the
              price of low-strike options — and so their implied vol — is pushed up, and high strikes are pushed down. That is the{" "}
              <Term term="volSkew">skew</Term>.
            </p>
          </div>
          <div>
            <p className="text-foreground">Crashes really are fatter than the model.</p>
            <p className="mt-1">
              Markets fall faster than they rise, and volatility spikes as they fall. A lognormal world gives a 20% drop in a month almost no chance;
              history gives it a real one. Dealers who sell those puts charge for the gap, so the skew persists even in calm markets — and steepens the
              moment fear picks up, which is what the two dials above are doing together.
            </p>
          </div>
        </div>
        <p className="mt-3 border-t border-border pt-2 text-[10px] leading-4 text-zinc-500">
          Model: SVI (Gatheral), the parameterisation desks fit to listed options — total variance w(k) = a + b[ρ(k − m) + √((k − m)² + s²)], k = ln(K/S),
          IV = √(w/T). The fear dial sets a, skew sets ρ, wing steepness sets b; m and s are fixed. A teaching approximation, not a market feed.
          Educational, not investment advice.
        </p>
      </Card>
    </div>
  );
}

// Custom crosshair readout. Recharts hands us the hovered point's payload.
function Crosshair({ active, payload, type, p, T }: { active?: boolean; payload?: { payload: SmilePoint }[]; type: OptionType; p: SmileParams; T: number }) {
  const q = payload?.[0]?.payload;
  if (!active || !q) return null;
  const m = moneyness(type, q.strike, p.spot);
  const { price, delta } = blackScholes(type, p.spot, q.strike, T, p.rate, q.iv);
  const tone = m === "ITM" ? "text-good" : m === "ATM" ? "text-accent" : "text-zinc-400";
  return (
    <div style={chartTooltipStyle} className="min-w-[10rem] tabular-nums">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-foreground">Strike {q.strike.toFixed(0)}</span>
        <span className={`text-[10px] caps ${tone}`}>[{m}]</span>
      </div>
      <p className="mt-1" style={{ color: CURVE.from }}>
        IV {pct(q.iv)}
      </p>
      <p className="text-zinc-500">
        {type === "put" ? "Put" : "Call"} {usd(price)} · Δ {delta.toFixed(2)}
      </p>
      <p className="text-zinc-500">{((q.strike / p.spot - 1) * 100).toFixed(0)}% from spot</p>
    </div>
  );
}
