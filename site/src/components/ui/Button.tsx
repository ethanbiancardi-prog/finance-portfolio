import type { ButtonHTMLAttributes, ReactNode } from "react";

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
  loadingLabel = "...",
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
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
      {loading ? loadingLabel : children}
    </button>
  );
}
