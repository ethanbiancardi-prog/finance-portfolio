"use client";

// "Catalysts & what you could do": what's happening at the company right
// now (from the headlines), how it's doing (from the 10-K ratios), and 2-3
// concrete options — each with a button that carries the reader straight
// to the action on this site (paper trade, journal entry, DCF).
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, SectionHeader, StatusBadge, type Rating } from "@/components/ui";

type Catalyst = {
  type: "product" | "earnings" | "guidance" | "deal" | "regulatory" | "management" | "macro" | "other";
  headline: string;
  why: string;
  direction: "positive" | "negative" | "mixed";
};
type Option = {
  title: string;
  rationale: string;
  action: "buy" | "watch" | "journal" | "dcf" | "avoid";
  starterSizePct: number | null;
  invalidation: string;
};
type Playbook = {
  catalysts: Catalyst[];
  financialHealth: { verdict: "strong" | "solid" | "mixed" | "weak"; points: string[] };
  options: Option[];
  basedOn: { priceAsOf: string | null; fiscalYearEnd: string | null; headlines: number };
  generatedAt: string;
};

const TYPE_LABEL: Record<Catalyst["type"], string> = {
  product: "Product",
  earnings: "Earnings",
  guidance: "Guidance",
  deal: "Deal",
  regulatory: "Regulatory",
  management: "Management",
  macro: "Macro",
  other: "Other",
};
const DIRECTION_RATING: Record<Catalyst["direction"], Rating> = { positive: "good", negative: "bad", mixed: "average" };
const HEALTH_RATING: Record<Playbook["financialHealth"]["verdict"], Rating> = { strong: "good", solid: "good", mixed: "average", weak: "bad" };

// Where each option's button goes. The paper-trading page reads these
// params and pre-fills the order or journal form.
function actionLink(o: Option, ticker: string): { href: string; label: string } | null {
  const thesis = encodeURIComponent(`${o.title}. ${o.rationale} Wrong if: ${o.invalidation}`);
  switch (o.action) {
    case "buy":
      return { href: `/paper-trading?ticker=${ticker}&side=buy&thesis=${thesis}`, label: "Buy in paper account" };
    case "journal":
    case "watch":
      return { href: `/paper-trading?journal=${ticker}&thesis=${thesis}#journal`, label: "Log this in the journal" };
    case "dcf":
      return { href: `/dcf-builder?ticker=${ticker}`, label: "Build a DCF" };
    default:
      return null;
  }
}

export function PlaybookPanel({ ticker }: { ticker: string }) {
  const [data, setData] = useState<Playbook | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/research/playbook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Couldn't build the playbook");
        return json;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't build the playbook");
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return (
    <Card as="section" className="mt-4">
      <SectionHeader
        label="catalysts & what you could do"
        description="What's moving the company right now, how it's doing financially, and concrete next steps for the paper account. AI-generated from the same filing, price, and headlines shown on this page — a starting point, not advice."
      />

      {!data && !error && <p className="mt-3 text-xs text-zinc-500">Reading the headlines and the numbers...</p>}
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}

      {data && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="text-[10px] caps text-zinc-500">Catalysts in the news</p>
            {data.catalysts.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">Nothing material in the recent headlines — no launches, deals, or guidance changes.</p>
            ) : (
              <ul className="mt-2 space-y-2.5">
                {data.catalysts.map((c, i) => (
                  <li key={i} className="text-xs leading-5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="rounded-[var(--radius-sm)] border border-border px-1.5 py-0.5 text-[10px] caps text-zinc-500">{TYPE_LABEL[c.type]}</span>
                      <StatusBadge rating={DIRECTION_RATING[c.direction]} label={c.direction} />
                    </span>
                    <span className="mt-1 block text-foreground">{c.headline}</span>
                    <span className="block text-zinc-500">{c.why}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="flex items-center gap-2 text-[10px] caps text-zinc-500">
              Financial health
              <StatusBadge rating={HEALTH_RATING[data.financialHealth.verdict]} label={data.financialHealth.verdict} />
            </p>
            <ul className="mt-2 space-y-1.5">
              {data.financialHealth.points.map((pt, i) => (
                <li key={i} className="text-xs leading-5 text-zinc-500">
                  <span className="mr-1.5 text-accent">•</span>
                  {pt}
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <p className="text-[10px] caps text-zinc-500">Your options</p>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
              {data.options.map((o, i) => {
                const link = actionLink(o, ticker);
                return (
                  <Card key={i} padding="sm" className="flex flex-col">
                    <p className="text-xs text-foreground">
                      <span className="mr-1.5 tabular-nums text-zinc-600">{i + 1}.</span>
                      {o.title}
                      {o.action === "buy" && o.starterSizePct != null && (
                        <span className="ml-1.5 text-[10px] caps text-zinc-500">starter {o.starterSizePct}% of account</span>
                      )}
                    </p>
                    <p className="mt-1.5 flex-1 text-[11px] leading-5 text-zinc-500">{o.rationale}</p>
                    <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                      <span className="text-average">Wrong if:</span> {o.invalidation}
                    </p>
                    {link ? (
                      <Link
                        href={link.href}
                        className="mt-3 inline-block self-start rounded-[var(--radius-sm)] bg-accent px-2 py-1 text-xs caps text-background hover:bg-accent/85"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <span className="mt-3 inline-block self-start rounded-[var(--radius-sm)] border border-border px-2 py-1 text-xs caps text-zinc-500">
                        No action
                      </span>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {data && (
        <p className="mt-3 text-[10px] caps text-zinc-600">
          Based on {data.basedOn.headlines} headlines
          {data.basedOn.fiscalYearEnd ? ` and the 10-K for FY ending ${data.basedOn.fiscalYearEnd}` : ""}
          {data.basedOn.priceAsOf ? `, price as of ${new Date(data.basedOn.priceAsOf).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
        </p>
      )}
    </Card>
  );
}
