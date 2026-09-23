"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Card } from "./Card";
import { GeometricLoader, useLoaderHold } from "./GeometricLoader";

// A page can broadcast "open everything" / "close everything" to the
// sections inside it without threading a prop through each panel.
export const SectionForce = createContext<{ open: boolean; seq: number } | undefined>(undefined);

// A collapsible research section. The header carries a one-line summary of
// what's inside — enough to know whether to open it — and the body holds
// the detail. Summaries are computed from the section's own data by the
// component that renders it, so they're never stale.
export function Section({
  id,
  label,
  summary,
  status,
  defaultOpen = false,
  hideSummaryWhenOpen = false,
  children,
}: {
  id: string;
  label: string;
  summary?: ReactNode; // one line; undefined while loading
  status?: "loading" | "error" | "ready" | "idle";
  defaultOpen?: boolean;
  // For sections whose summary is an excerpt of the body: don't show it twice.
  hideSummaryWhenOpen?: boolean;
  children: ReactNode;
}) {
  const force = useContext(SectionForce);
  // The summary replaces the loader the moment the data lands, so hold the
  // mark on screen long enough for it to reassemble first.
  const busy = status === "loading" && !summary;
  const heldLoader = useLoaderHold(busy);
  const [open, setOpen] = useState(defaultOpen);
  const [seenSeq, setSeenSeq] = useState(force?.seq ?? 0);
  if (force && force.seq !== seenSeq) {
    setSeenSeq(force.seq);
    setOpen(force.open);
  }
  const isOpen = open;

  return (
    <Card as="section" id={id} padding="none" className="mt-3 overflow-hidden scroll-mt-24">
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={`${id}-body`}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-border/30"
      >
        <span className="flex-1 min-w-0">
          <span className="section-title block text-[11px] caps-wide text-accent">{label}</span>
          {!(hideSummaryWhenOpen && isOpen) && (
            <span className="mt-1 block text-xs leading-5 text-foreground">
              {heldLoader ? (
                <GeometricLoader loading={busy} size={13} className="text-zinc-500" />
              ) : (
                summary ?? <span className="text-zinc-500">—</span>
              )}
            </span>
          )}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          aria-hidden="true"
          className={`mt-1 shrink-0 text-zinc-500 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
        >
          <path d="M3 5 L7 9 L11 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {isOpen && (
        <div id={`${id}-body`} className="border-t border-border/60 px-3.5 pb-3.5 pt-3">
          {children}
        </div>
      )}
    </Card>
  );
}
