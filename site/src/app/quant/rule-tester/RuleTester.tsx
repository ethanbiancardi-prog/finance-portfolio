"use client";

// The Rule Tester: four plain-English switches for the Signal Trader's rules,
// and how $100,000 would have done under each combination, next to SPY.
//
// Nothing is computed here. Every combination (3 x 3 x 2 x 2 = 36) was run
// ahead of time by `site/scripts/backtest-timing.ts --export` on daily prices
// for the ~94 sector-list stocks, and the page reads the result from
// public/data/rule-tester.json. That backtest is a price-only copy of the bot
// (trend + momentum score; no 10-K history), see the "How this was tested"
// box. The AI section's numbers are copied from the ML reports
// (projects/paper-trading/ML_REPORT_*.md), a separate test.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Callout, Card, ChartLoading, Chip, SectionHeader, StatCard } from "@/components/ui";
import { formatPercent } from "@/lib/format";
import type { ChartPoint } from "./RuleChart";

const RuleChart = dynamic(() => import("./RuleChart"), {
  ssr: false,
  loading: () => <ChartLoading className="h-64 sm:h-80" />,
});

type Half = { cagr: number; sharpe: number; maxDrawdown: number };
type Summary = {
  finalValue: number;
  cagr: number; // per year, compounded
  sharpe: number;
  maxDrawdown: number; // worst fall from a peak, e.g. -0.26
  firstHalf: Half;
  secondHalf: Half;
  yearly: Record<string, number>;
  curve: number[]; // weekly account value, starting at $100,000
};
type Combo = Summary & { sectorCap: 0 | 2 | 3; stopLoss: 0 | 8 | 12; trailing: boolean; marketFilter: boolean };
type Data = { start: string; end: string; split: string; stocks: number; dates: string[]; spy: Summary; combos: Combo[] };
type Rules = Pick<Combo, "sectorCap" | "stopLoss" | "trailing" | "marketFilter">;

// The bot's live rules since Nov 2026, and what it used before.
const TODAY: Rules = { sectorCap: 2, stopLoss: 8, trailing: false, marketFilter: false };
const OLD: Rules = { sectorCap: 0, stopLoss: 8, trailing: true, marketFilter: false };
const same = (a: Rules, b: Rules) =>
  a.sectorCap === b.sectorCap && a.stopLoss === b.stopLoss && a.trailing === b.trailing && a.marketFilter === b.marketFilter;

// The four switches, each as a question with its choices and a one-line why.
const QUESTIONS: {
  key: keyof Rules;
  question: string;
  why: string;
  options: { label: string; value: Rules[keyof Rules] }[];
}[] = [
  {
    key: "sectorCap",
    question: "How many stocks from the same industry can it own?",
    why: "Owning five drug companies means one bad week for drug stocks hits half the account.",
    options: [
      { label: "No limit", value: 0 },
      { label: "3", value: 3 },
      { label: "2", value: 2 },
    ],
  },
  {
    key: "stopLoss",
    question: "Sell a stock once it falls this far below what it paid:",
    why: "A stop-loss caps each loss, but sells on dips that would have recovered.",
    options: [
      { label: "8%", value: 8 },
      { label: "12%", value: 12 },
      { label: "Never", value: 0 },
    ],
  },
  {
    key: "trailing",
    question: "Sell a winner once it falls 15% from its highest price?",
    why: "Locks in gains, but can sell a winner that was only taking a breather.",
    options: [
      { label: "Yes", value: true },
      { label: "No", value: false },
    ],
  },
  {
    key: "marketFilter",
    question: "Stop buying while the whole market is in a downtrend?",
    why: "Downtrend = the S&P 500 below its average price of the last 200 days.",
    options: [
      { label: "Yes", value: true },
      { label: "No", value: false },
    ],
  },
];

const signed = (x: number, decimals = 1) => `${x >= 0 ? "+" : ""}${formatPercent(x, { decimals })}`;
const Colored = ({ value, text }: { value: number; text?: string }) => (
  <span style={{ color: `var(--status-${value >= 0 ? "good" : "bad"})` }}>{text ?? signed(value)}</span>
);
const yearRange = (from: string, to: string) => `${from.slice(0, 4)}–${to.slice(0, 4)}`;

export default function RuleTester() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [rules, setRules] = useState<Rules>(TODAY);

  useEffect(() => {
    fetch("/data/rule-tester.json")
      .then((res) => {
        if (!res.ok) throw new Error("The results couldn't load.");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "The results couldn't load."));
  }, []);

  const combo = data?.combos.find((c) => same(c, rules));
  const chart = useMemo<ChartPoint[]>(
    () => (data && combo ? data.dates.map((date, i) => ({ date, rules: combo.curve[i], spy: data.spy.curve[i] })) : []),
    [data, combo],
  );

  return (
    <>
      <Card as="section" className="mt-4">
        <SectionHeader label="1. pick the rules" description="The bot buys stocks that are trending up and selling well. These four switches decide when it stops buying and when it sells." />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-500">Start from:</span>
          <Chip active={same(rules, TODAY)} onClick={() => setRules(TODAY)}>The bot&apos;s rules today</Chip>
          <Chip active={same(rules, OLD)} onClick={() => setRules(OLD)}>Its old rules</Chip>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {QUESTIONS.map((q) => (
            <div key={q.key} className="rounded-[var(--radius-sm)] border border-border p-3">
              <p className="text-xs text-foreground">{q.question}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {q.options.map((o) => (
                  <Chip key={String(o.value)} active={rules[q.key] === o.value} onClick={() => setRules({ ...rules, [q.key]: o.value })}>
                    {o.label}
                  </Chip>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-4 text-zinc-500">{q.why}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card as="section" className="mt-4">
        <SectionHeader
          label="2. what $100,000 would have become"
          description={data ? `Starting ${new Date(`${data.start}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}, through today. The dashed line is simply buying the S&P 500 and holding it.` : undefined}
        />
        {error && <p className="mt-3 text-xs text-bad">{error}</p>}
        {data && combo ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                size="lg"
                label="Ended with"
                value={`$${combo.finalValue.toLocaleString()}`}
                hint={<span className="text-zinc-500">S&amp;P 500: ${data.spy.finalValue.toLocaleString()}</span>}
              />
              <StatCard
                size="lg"
                label="Per year"
                value={<Colored value={combo.cagr} />}
                hint={<span className="text-zinc-500">S&amp;P 500: {signed(data.spy.cagr)}</span>}
              />
              <StatCard
                size="lg"
                label="Worst drop"
                value={<Colored value={combo.maxDrawdown} text={formatPercent(combo.maxDrawdown, { decimals: 0 })} />}
                hint={<span className="text-zinc-500">The most it fell from a high point. S&amp;P 500: {formatPercent(data.spy.maxDrawdown, { decimals: 0 })}</span>}
              />
              <StatCard
                size="lg"
                label="Years it beat the market"
                value={`${Object.keys(combo.yearly).filter((y) => combo.yearly[y] > data.spy.yearly[y]).length} of ${Object.keys(combo.yearly).length}`}
                hint={<span className="text-zinc-500">{yearRange(data.start, data.end)}; this year so far</span>}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block w-4" style={{ borderTop: "2px solid var(--series-1)" }} />
                Your rules
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block w-4" style={{ borderTop: "2px dashed var(--chart-muted)" }} />
                S&amp;P 500 (SPY)
              </span>
            </div>
            <div className="mt-2">
              <RuleChart data={chart} />
            </div>
          </>
        ) : (
          !error && <ChartLoading className="mt-3 h-64 sm:h-80" />
        )}
      </Card>

      {data && combo && <LuckyOrReal data={data} combo={combo} />}

      <AiSection />

      <Callout label="how this was tested" className="mt-4">
        <ul className="list-disc space-y-1 pl-4">
          <li>
            {`${data?.stocks ?? "~94"} large US stocks from the site's sector lists, replayed day by day on real prices. `}
            Trades happen at the next morning&apos;s price, with a small cost on every trade.
          </li>
          <li>
            A simplified copy of the bot: it scores stocks on price trend and momentum only, because there&apos;s no history of the 10-K stories the
            live bot also reads.
          </li>
          <li>
            The stock lists are today&apos;s, so no company that collapsed along the way is in them. That flatters every result here: compare the
            rule settings with each other, not with what you&apos;d really have earned.
          </li>
          <li>Educational, not investment advice.</li>
        </ul>
      </Callout>
    </>
  );
}

// Split the years in two and check the rules beat the market in both. Rules
// that only won in one half may just have been lucky.
function LuckyOrReal({ data, combo }: { data: Data; combo: Combo }) {
  const halves = [
    { label: yearRange(data.start, "2021"), rules: combo.firstHalf, spy: data.spy.firstHalf },
    { label: yearRange(data.split, data.end), rules: combo.secondHalf, spy: data.spy.secondHalf },
  ];
  const wins = halves.filter((h) => h.rules.cagr > h.spy.cagr).length;
  const verdict =
    wins === 2
      ? "Beat the market in both halves. A good sign these rules work, not just that they got lucky once."
      : wins === 1
        ? "Beat the market in only one half. That could be luck, so be careful trusting these rules."
        : "Lost to the market in both halves.";
  return (
    <Card as="section" className="mt-4">
      <SectionHeader
        label="3. lucky or real?"
        description="Any rule can look good over one stretch of time by luck. So the years are split in two: rules that really work should beat the market in both halves."
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {halves.map((h) => (
          <div key={h.label} className="rounded-[var(--radius-sm)] border border-border p-3">
            <p className="text-[10px] caps text-zinc-500">{h.label}</p>
            <p className="mt-1 text-sm text-foreground">
              Your rules <Colored value={h.rules.cagr} /> a year
            </p>
            <p className="text-xs text-zinc-500">S&amp;P 500 {signed(h.spy.cagr)} a year</p>
            <p className="mt-1 text-[11px]">
              {h.rules.cagr > h.spy.cagr ? <span className="text-good">Beat the market</span> : <span className="text-bad">Lost to the market</span>}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-foreground">{verdict}</p>
    </Card>
  );
}

// Can AI pick better? Results of three machine-learning models against simple
// rules, from the walk-forward test in projects/paper-trading/ML_REPORT_CNN.md
// and ML_REPORT_SP500_NO_MACRO.md: 2019 to 2026, each model's top 10 of the
// ~94 stocks, swapped every 20 trading days, after costs, every pick made
// using only data from before it.
const AI_RESULTS: { name: string; what: string; perYear: number; ai: boolean }[] = [
  { name: "Plain momentum", what: "Buy last year's 10 best performers", perYear: 0.36, ai: false },
  { name: "Simple rules", what: "Price trend + momentum score, like the bot", perYear: 0.34, ai: false },
  { name: "AI: two models combined", what: "The two AI models below, averaged", perYear: 0.263, ai: true },
  { name: "AI: decision trees", what: "Learned from 50 clues: prices, company reports, chart patterns", perYear: 0.249, ai: true },
  { name: "AI: chart reader", what: "A neural network that looks at the last 60 days of each price chart", perYear: 0.171, ai: true },
  { name: "S&P 500 (SPY)", what: "Buy and hold the market", perYear: 0.168, ai: false },
];

function AiSection() {
  const max = Math.max(...AI_RESULTS.map((r) => r.perYear));
  return (
    <Card as="section" className="mt-4">
      <SectionHeader
        label="4. can AI pick better?"
        description="Three AI models were trained on 10 years of data from all ~500 S&P 500 stocks and asked to pick the 10 best stocks each month. Every pick used only information available at the time. Here's how they did against simple rules, 2019–2026."
      />
      <div className="mt-3 space-y-2.5">
        {AI_RESULTS.map((r) => (
          <div key={r.name}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs text-foreground">{r.name}</p>
              <p className="text-xs tabular-nums text-foreground">{signed(r.perYear)} / yr</p>
            </div>
            <div className="mt-1 h-2 rounded-full bg-border/60">
              <div
                className="h-2 rounded-full"
                style={{ width: `${(r.perYear / max) * 100}%`, background: r.ai ? "var(--series-2)" : r.name.startsWith("S&P") ? "var(--chart-muted)" : "var(--series-1)" }}
              />
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">{r.what}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-foreground">The simple rules won. Why the AI fell short:</p>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] leading-5 text-zinc-500">
        <li>Stock prices are mostly noise. Any pattern that reliably predicted them would be spotted and traded away by big firms.</li>
        <li>AI needs millions of examples. Ten years of stocks is a few hundred thousand, so the models memorised random wiggles instead of real patterns.</li>
        <li>
          The one pattern that has held up for decades, that stocks going up tend to keep going up for a while, is exactly what the simple rules
          use. The AI had to rediscover it from scratch.
        </li>
      </ul>
      <p className="mt-3 text-[11px] leading-5 text-zinc-500">
        This test was set up differently from the Rule Tester above (always 10 stocks, swapped monthly, no stop-losses, from 2019), so its numbers
        don&apos;t compare directly with the ones up there. The same caveat applies: today&apos;s stock lists flatter every result.
      </p>
    </Card>
  );
}
