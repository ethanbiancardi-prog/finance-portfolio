"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { GLOSSARY, type GlossaryEntry, type GlossaryKey } from "@/lib/glossary";

// A label with a definition behind it. Hover (or focus, or tap on touch
// screens) shows a small popover with the glossary entry and, when a Quant
// Note covers the term, a link to it. The underline is dotted so a reader
// can tell which labels have an explanation without hunting.
export function Term({ term, children, className }: { term: GlossaryKey; children: ReactNode; className?: string }) {
  const entry: GlossaryEntry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [below, setBelow] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  // Opens above the label so it never covers the value underneath it. Flip
  // below when there's no room above (scrolled to the top), and hang it off
  // the right edge when it would run past the viewport (the rightmost stat
  // card, on phones).
  useEffect(() => {
    if (!open || !popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    setAlignRight(rect.right > window.innerWidth - 8);
    setBelow(rect.top < 8);
  }, [open]);

  // Tap-to-toggle needs a way to close: outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={wrapperRef}
      className={`relative inline-block ${className ?? ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        // Always open, never toggle: a tap on touch screens fires a synthetic
        // mouseenter (which opens) right before click, so a toggle would
        // immediately close it again. Closing is outside-tap or Escape.
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="cursor-help border-b border-dotted border-zinc-500 [letter-spacing:inherit] [text-transform:inherit] hover:border-accent hover:text-foreground"
      >
        {children}
      </button>
      {open && (
        <span
          ref={popoverRef}
          id={id}
          role="tooltip"
          className={`absolute z-30 w-72 max-w-[calc(100vw-2rem)] rounded-[var(--radius)] border border-border bg-panel p-3 text-left normal-case tracking-normal shadow-lg ${
            below ? "top-full mt-1.5" : "bottom-full mb-1.5"
          } ${alignRight ? "right-0" : "left-0"}`}
        >
          <span className="block text-[11px] font-semibold text-foreground">{entry.term}</span>
          <span className="mt-1 block text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">{entry.definition}</span>
          {entry.noteSlug && (
            <Link
              href={`/quant-notes/${entry.noteSlug}`}
              className="mt-2 inline-block text-[11px] text-accent underline decoration-border underline-offset-4 hover:decoration-accent"
            >
              Read the note →
            </Link>
          )}
        </span>
      )}
    </span>
  );
}
