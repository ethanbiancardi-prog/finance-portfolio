"use client";

// "Explain simply" for the research page. Two things happen when it's on:
//   1. Finance jargon in any wrapped text gets a dotted underline with a
//      one-sentence definition on hover (no AI, instant).
//   2. AI-written passages can be rewritten in plain English with an
//      everyday analogy, on demand, via /api/research/simplify (cached).
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { JARGON, splitJargon, type JargonKey } from "@/lib/jargon";
import { GeometricLoader } from "@/components/ui";

const SimpleContext = createContext(false);
export const SimpleProvider = SimpleContext.Provider;
export function useSimple() {
  return useContext(SimpleContext);
}

// A jargon term with its definition in a small popover. Same interaction
// model as the site's Term component: hover, focus, or tap.
function JargonTerm({ jargonKey, children }: { jargonKey: JargonKey; children: ReactNode }) {
  const entry = JARGON[jargonKey];
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open || !popRef.current) return;
    setAlignRight(popRef.current.getBoundingClientRect().right > window.innerWidth - 8);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="cursor-help border-b border-dotted border-accent/70 text-inherit [font-size:inherit] [line-height:inherit] hover:border-accent"
      >
        {children}
      </button>
      {open && (
        <span
          ref={popRef}
          id={id}
          role="tooltip"
          className={`absolute bottom-full z-30 mb-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-[var(--radius)] border border-border bg-panel p-3 text-left text-[11px] normal-case leading-5 tracking-normal shadow-lg ${alignRight ? "right-0" : "left-0"}`}
        >
          <span className="block font-semibold text-foreground">{entry.term}</span>
          <span className="mt-1 block text-zinc-500 dark:text-zinc-400">{entry.definition}</span>
        </span>
      )}
    </span>
  );
}

// Text with jargon linked when simple mode is on; plain text otherwise.
export function JargonText({ text }: { text: string }) {
  const simple = useSimple();
  if (!simple) return <>{text}</>;
  return (
    <>
      {splitJargon(text).map((seg, i) =>
        seg.key ? (
          <JargonTerm key={i} jargonKey={seg.key}>
            {seg.text}
          </JargonTerm>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

type Simplified = { simple: string; analogy: string };
const cache = new Map<string, Simplified>();

// An AI-written passage. In simple mode it shows a "Say it simply" control;
// clicking fetches a plain-English rewrite plus an analogy and shows them in
// place of the original (with a way back). Jargon is linked either way.
export function SimpleText({ text, context, className }: { text: string; context?: string; className?: string }) {
  const simple = useSimple();
  const [state, setState] = useState<"original" | "loading" | "simple" | "error">("original");
  const [result, setResult] = useState<Simplified | null>(cache.get(text) ?? null);

  async function simplify() {
    const cached = cache.get(text);
    if (cached) {
      setResult(cached);
      setState("simple");
      return;
    }
    setState("loading");
    try {
      const res = await fetch("/api/research/simplify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't simplify");
      cache.set(text, json);
      setResult(json);
      setState("simple");
    } catch {
      setState("error");
    }
  }

  const showSimple = simple && state === "simple" && result;

  return (
    <span className={className}>
      {showSimple ? (
        <>
          <JargonText text={result.simple} />
          {result.analogy && (
            <span className="mt-2 block rounded-[var(--radius-sm)] border border-border/70 bg-background/60 px-2.5 py-2 text-zinc-500 dark:text-zinc-400">
              <span className="text-accent">Think of it like this: </span>
              <JargonText text={result.analogy} />
            </span>
          )}
        </>
      ) : (
        <JargonText text={text} />
      )}
      {simple && (
        <span className="mt-1.5 block text-[10px] caps">
          {state === "original" && (
            <button type="button" onClick={simplify} className="text-accent hover:underline">
              Say it simply
            </button>
          )}
          {state === "loading" && (
            <GeometricLoader size={12} label="Rewriting" className="text-zinc-500" />
          )}
          {state === "error" && (
            <button type="button" onClick={simplify} className="text-bad hover:underline">
              Couldn&apos;t rewrite — try again
            </button>
          )}
          {state === "simple" && (
            <button type="button" onClick={() => setState("original")} className="text-zinc-500 hover:text-foreground">
              Show original
            </button>
          )}
        </span>
      )}
    </span>
  );
}
