"use client";

import { useEffect, useRef, useState } from "react";

type Mode = "system" | "light" | "dark";
type Accent = "amber" | "teal" | "green" | "violet";

const MODES: { key: Mode; label: string }[] = [
  { key: "system", label: "Auto" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

// Swatch colors use each theme's dark-mode value — more saturated, reads
// clearly as a color sample against either a light or dark card background.
const ACCENTS: { key: Accent; label: string; swatch: string }[] = [
  { key: "amber", label: "Amber", swatch: "#ffb020" },
  { key: "teal", label: "Teal", swatch: "#2dd4bf" },
  { key: "green", label: "Green", swatch: "#4ade80" },
  { key: "violet", label: "Violet", swatch: "#a78bfa" },
];

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  // Dark is the default when nothing is stored (see layout.tsx init script).
  const [mode, setMode] = useState<Mode>("dark");
  const [accent, setAccent] = useState<Accent>("amber");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedMode = localStorage.getItem("theme-mode");
    const storedAccent = localStorage.getItem("theme-accent");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read from localStorage on mount, to sync the panel's UI with what layout.tsx's inline script already applied to <html>
    if (storedMode === "light" || storedMode === "dark" || storedMode === "system") setMode(storedMode);
    if (storedAccent === "teal" || storedAccent === "green" || storedAccent === "violet") {
      setAccent(storedAccent);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // While "Auto" is selected, keep data-mode in sync if the OS-level
  // preference changes while this tab is open (e.g. the system switches to
  // dark mode at sunset) — data-mode is always concrete, never unset, so
  // this listener is what makes "Auto" actually reactive.
  useEffect(() => {
    if (mode !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    function syncToSystem() {
      document.documentElement.setAttribute("data-mode", query.matches ? "dark" : "light");
    }
    query.addEventListener("change", syncToSystem);
    return () => query.removeEventListener("change", syncToSystem);
  }, [mode]);

  function applyMode(next: Mode) {
    setMode(next);
    // "system" is stored explicitly: an absent key means the dark default.
    localStorage.setItem("theme-mode", next);
    const isDark =
      next === "dark" ||
      (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-mode", isDark ? "dark" : "light");
  }

  function applyAccent(next: Accent) {
    setAccent(next);
    const root = document.documentElement;
    if (next === "amber") {
      root.removeAttribute("data-accent");
      localStorage.removeItem("theme-accent");
    } else {
      root.setAttribute("data-accent", next);
      localStorage.setItem("theme-accent", next);
    }
  }

  return (
    <div ref={panelRef} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Theme settings"
        aria-expanded={open}
        className="font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500 transition-colors duration-150 ease-out hover:text-foreground"
      >
        Theme
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-52 border border-border bg-panel p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Mode</p>
          <div className="mt-2 flex gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => applyMode(m.key)}
                className={`border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-150 ease-out ${
                  mode === m.key
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-zinc-500 hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">Accent</p>
          <div className="mt-2 flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => applyAccent(a.key)}
                aria-label={a.label}
                aria-pressed={accent === a.key}
                className={`h-4 w-4 border transition-colors duration-150 ease-out ${
                  accent === a.key ? "border-foreground" : "border-transparent hover:border-zinc-500"
                }`}
                style={{ backgroundColor: a.swatch }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
