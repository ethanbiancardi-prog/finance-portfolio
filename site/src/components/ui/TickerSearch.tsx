"use client";

import { useEffect, useId, useRef, useState } from "react";
import { inputClasses, labelClasses } from "./Field";

type Match = { symbol: string; name: string; exchange: string };

// Typeahead ticker input. `endpoint` is a GET route that takes ?q= and returns
// { matches: Match[] } (or { error }) — the page decides the data source.
// Typing a bare ticker and pressing Enter still submits the parent form as
// before; Enter only picks a result when one is highlighted.
export function TickerSearch({
  label,
  value,
  onChange,
  onSelect,
  endpoint,
  placeholder = "AAPL or Apple",
  required,
  className,
  wrapperClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (symbol: string) => void;
  endpoint: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  wrapperClassName?: string;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const skipNextSearch = useRef(false);
  const listId = useId();

  // Debounced search: wait 200ms after the last keystroke, and drop responses
  // that arrive after the query has moved on (or after a pick).
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const q = value.trim();
    if (!q) {
      setMatches([]);
      setOpen(false);
      setError("");
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        setMatches(data.matches ?? []);
        setActive(-1);
        setOpen(true);
      } catch (err) {
        if (cancelled) return;
        setMatches([]);
        setError(err instanceof Error ? err.message : "Search failed");
        setOpen(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, endpoint]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function pick(m: Match) {
    skipNextSearch.current = true;
    onChange(m.symbol);
    setOpen(false);
    setMatches([]);
    onSelect(m.symbol);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className={`relative ${wrapperClassName ?? ""}`}>
      <label className="block">
        <span className={labelClasses}>{label}</span>
        <input
          className={`${inputClasses} ${className ?? "w-full"}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => matches.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
        />
      </label>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 z-30 mt-1 min-w-full max-w-[90vw] border border-border bg-panel text-xs shadow-none sm:min-w-[22rem]"
        >
          {loading && matches.length === 0 && !error && (
            <li className="px-2.5 py-1.5 text-zinc-500">
              <span className="cursor-blink">▌</span> searching
            </li>
          )}
          {error && <li className="px-2.5 py-1.5 text-bad">{error}</li>}
          {!loading && !error && matches.length === 0 && (
            <li className="px-2.5 py-1.5 text-zinc-500">-- no matches</li>
          )}
          {matches.map((m, i) => (
            <li
              key={`${m.symbol}-${m.exchange}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(m)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline gap-3 px-2.5 py-1.5 ${
                i === active ? "bg-accent text-background" : "hover:bg-border/60"
              }`}
            >
              <span className={`w-14 shrink-0 ${i === active ? "" : "text-foreground"}`}>{m.symbol}</span>
              <span className={`min-w-0 flex-1 truncate ${i === active ? "opacity-80" : "text-zinc-400"}`}>
                {m.name}
              </span>
              <span className={`shrink-0 text-[10px] uppercase tracking-[0.1em] ${i === active ? "opacity-70" : "text-zinc-600"}`}>
                {m.exchange}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
