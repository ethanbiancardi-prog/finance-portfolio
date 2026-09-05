import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = {
  variant?: "solid" | "outline";
  loading?: boolean;
  loadingLabel?: ReactNode;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

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
      ? "bg-black text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
      : "border border-zinc-200 text-black hover:border-accent/50 dark:border-zinc-800 dark:text-zinc-50";

  return (
    <button
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150 ease-out disabled:opacity-50 ${variantClass} ${
        className ?? ""
      }`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? loadingLabel : children}
    </button>
  );
}
