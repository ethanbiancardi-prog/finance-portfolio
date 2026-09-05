import Link from "next/link";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type CardOwnProps = {
  as?: "div" | "section" | "button";
  href?: string;
  padding?: "sm" | "md";
  interactive?: boolean;
  className?: string;
  children: ReactNode;
};

type CardProps = CardOwnProps & HTMLAttributes<HTMLElement> & ButtonHTMLAttributes<HTMLButtonElement>;

export function Card({
  as = "div",
  href,
  padding = "md",
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  const classes = [
    "rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
    padding === "sm" ? "p-4" : "p-5",
    interactive
      ? "block w-full text-left transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-sm hover:border-accent/50 dark:hover:shadow-none"
      : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  if (as === "button") {
    return (
      <button type="button" className={classes} {...rest}>
        {children}
      </button>
    );
  }

  if (as === "section") {
    return (
      <section className={classes} {...rest}>
        {children}
      </section>
    );
  }

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
