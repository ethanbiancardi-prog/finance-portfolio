import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = {
  variant?: "solid" | "outline";
  loading?: boolean;
  loadingLabel?: ReactNode;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

// Rendered as `[ LABEL ]`. Solid = inverse-video accent block for the
// primary action; outline = plain bracketed text that lights up on hover.
export function Button({
  variant = "solid",
  loading = false,
  loadingLabel = "...",
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  const variantClass =
    variant === "solid"
      ? "bg-accent text-background hover:bg-accent/85"
      : "text-zinc-400 hover:text-accent";

  return (
    <button
      className={`px-2 py-1 text-xs uppercase tracking-[0.12em] transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40 ${variantClass} ${
        className ?? ""
      }`}
      disabled={disabled || loading}
      {...rest}
    >
      <span className="opacity-60">[ </span>
      {loading ? loadingLabel : children}
      <span className="opacity-60"> ]</span>
    </button>
  );
}
