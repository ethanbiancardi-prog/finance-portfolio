"use client";

import type { ReactNode } from "react";

// A labelled range input with a custom thumb: thin track in the border
// colour, filled to the current value in the accent, a small ring-style
// thumb. Uses the theme tokens so it works in both styles and themes.
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
  hint,
  color,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** Formatted value shown to the right of the label. */
  display: ReactNode;
  hint?: ReactNode;
  /** Track fill / thumb colour; defaults to the accent. */
  color?: string;
}) {
  const pctFilled = ((value - min) / (max - min)) * 100;
  const fill = color ?? "var(--accent)";
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] caps text-zinc-500">{label}</span>
        <span className="text-xs tabular-nums text-foreground">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(to right, ${fill} ${pctFilled}%, var(--border) ${pctFilled}%)`, ["--thumb" as string]: fill }}
        className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full outline-none transition-[box-shadow] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_30%,transparent)]
          [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--thumb)] [&::-webkit-slider-thumb]:bg-panel [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_var(--panel)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150 hover:[&::-webkit-slider-thumb]:scale-125 active:[&::-webkit-slider-thumb]:scale-110
          [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--thumb)] [&::-moz-range-thumb]:bg-panel"
      />
      {hint && <span className="mt-1 block text-[10px] leading-4 text-zinc-500">{hint}</span>}
    </label>
  );
}
