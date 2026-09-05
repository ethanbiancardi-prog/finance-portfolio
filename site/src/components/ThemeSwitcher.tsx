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
  const [mode, setMode] = useState<Mode>("system");
  const [accent, setAccent] = useState<Accent>("amber");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedMode = localStorage.getItem("theme-mode");
    const storedAccent = localStorage.getItem("theme-accent");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read from localStorage on mount, to sync the panel's UI with what layout.tsx's inline script already applied to <html>
    if (storedMode === "light" || storedMode === "dark") setMode(storedMode);
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
    if (next === "system") {
      localStorage.removeItem("theme-mode");
    } else {
      localStorage.setItem("theme-mode", next);
    }
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
        className="font-mono text-xs uppercase tracking-wide text-zinc-500 transition-colors duration-150 ease-out hover:text-accent dark:text-zinc-400 sm:tracking-widest"
      >
        Theme
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-52 rounded-md border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <p className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">Mode</p>
          <div className="mt-2 flex gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => applyMode(m.key)}
                className={`rounded-md border px-2 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors duration-150 ease-out ${
                  mode === m.key
                    ? "border-accent text-accent"
                    : "border-zinc-200 text-zinc-600 hover:border-accent/50 dark:border-zinc-800 dark:text-zinc-400"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-zinc-500">Accent</p>
          <div className="mt-2 flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => applyAccent(a.key)}
                aria-label={a.label}
                aria-pressed={accent === a.key}
                className={`h-6 w-6 rounded-full border-2 transition-transform duration-150 ease-out ${
                  accent === a.key
                    ? "scale-110 border-black dark:border-white"
                    : "border-transparent hover:scale-110"
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
