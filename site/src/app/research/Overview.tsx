"use client";

// The strip at the top of a research result: who the company is, the live
// price, a one-line "at a glance" once the playbook has read the news and
// numbers, jump links to each section, and the reading controls.
import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { QuoteBadge, type Company } from "./Fundamentals";
import { JargonText } from "./SimpleMode";

const SECTIONS: { id: string; label: string }[] = [
  { id: "about", label: "About" },
  { id: "whats-happening", label: "What's happening" },
  { id: "fundamentals", label: "Fundamentals" },
  { id: "red-flags", label: "Red flags" },
  { id: "news", label: "News" },
  { id: "analysts", label: "Analysts" },
];

export function Overview({
  company,
  glance,
  simple,
  onSimple,
  onExpandAll,
  onCollapseAll,
}: {
  company: Company;
  glance: string | null;
  simple: boolean;
  onSimple: (v: boolean) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <Card as="section" className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-foreground">
          <span className="text-accent">{company.ticker}</span>
          <span className="ml-2 font-normal text-zinc-500">{company.title}</span>
        </h2>
        <QuoteBadge key={company.ticker} ticker={company.ticker} />
      </div>

      <p className="mt-2 text-xs leading-5 text-foreground">
        <span className="text-[10px] caps text-zinc-500">At a glance · </span>
        {glance ? <JargonText text={glance} /> : <span className="text-zinc-500">Reading the latest filing, price, and headlines...</span>}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex flex-wrap gap-1.5">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-[var(--radius-sm)] border border-border px-2 py-0.5 text-[11px] caps text-zinc-500 transition-colors hover:border-accent hover:text-foreground"
            >
              {s.label}
            </a>
          ))}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-zinc-500">
          <button type="button" onClick={onExpandAll} className="hover:text-foreground">
            Expand all
          </button>
          <span>·</span>
          <button type="button" onClick={onCollapseAll} className="hover:text-foreground">
            Collapse all
          </button>
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Chip active={simple} onClick={() => onSimple(!simple)}>
            {simple ? "Explaining simply" : "Explain simply"}
          </Chip>
          <Link
            href={`/dcf-builder?ticker=${company.ticker}`}
            className="text-[11px] text-accent underline decoration-border underline-offset-4 hover:decoration-accent"
          >
            Build a DCF →
          </Link>
        </span>
      </div>
      {simple && (
        <p className="mt-2 text-[11px] leading-5 text-zinc-500">
          Jargon is underlined, hover or tap for a plain definition. Any AI-written passage has a &ldquo;Say it simply&rdquo; link that rewrites it
          without the jargon and adds an everyday example.
        </p>
      )}
    </Card>
  );
}
