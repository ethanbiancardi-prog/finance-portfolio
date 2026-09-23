"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { GeometricLoader, useLoaderHold } from "./GeometricLoader";

type ButtonProps = {
  variant?: "solid" | "outline";
  loading?: boolean;
  loadingLabel?: ReactNode;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

// Solid = accent block for the primary action; outline = bordered text
// that lights up on hover.
export function Button({
  variant = "solid",
  loading = false,
  // No default text: the loader mark alone is enough unless a caller wants
  // to name what is happening ("Analyzing", "Scanning").
  loadingLabel,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  // Holds the mark through its reconstruct, so the label comes back once the
  // shape has reassembled rather than cutting it off mid-fold.
  const held = useLoaderHold(loading);

  const variantClass =
    variant === "solid"
      ? "bg-accent text-background hover:bg-accent/85"
      : "border border-border text-zinc-400 hover:border-accent hover:text-accent";

  return (
    <button
      className={`rounded-[var(--radius-sm)] px-2 py-1 text-xs caps transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40 ${variantClass} ${
        className ?? ""
      }`}
      disabled={disabled || loading}
      {...rest}
    >
      {held ? <GeometricLoader loading={loading} size={13} label={loadingLabel} /> : children}
    </button>
  );
}
