"use client";

import Link from "next/link";
import { useRef } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, MouseEvent, ReactNode } from "react";

type CardOwnProps = {
  as?: "div" | "section" | "button";
  href?: string;
  padding?: "sm" | "md";
  interactive?: boolean;
  className?: string;
  children: ReactNode;
};

type CardProps = CardOwnProps & HTMLAttributes<HTMLElement> & ButtonHTMLAttributes<HTMLButtonElement>;

// Mouse-tracked "spotlight" glow for interactive cards — an accent-tinted
// radial gradient that follows the cursor. Purely additive to the existing
// lift/shadow/border hover treatment below; never touches `transform`, so
// there's no risk of two transform sources clobbering each other.
function Spotlight() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(200px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in srgb, var(--accent) 7%, transparent), transparent 70%)",
        opacity: "var(--spot-opacity, 0)",
        transition: "opacity 200ms ease-out",
      }}
    />
  );
}

export function Card({
  as = "div",
  href,
  padding = "md",
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  const rectRef = useRef<DOMRect | null>(null);

  const classes = [
    "border border-border bg-panel",
    padding === "sm" ? "p-3" : "p-3.5",
    interactive
      ? "relative overflow-hidden block w-full text-left transition-colors duration-150 ease-out hover:border-accent/60"
      : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  function handleMouseEnter(e: MouseEvent<HTMLElement>) {
    rectRef.current = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--spot-opacity", "1");
  }

  function handleMouseMove(e: MouseEvent<HTMLElement>) {
    const rect = rectRef.current;
    if (!rect) return;
    e.currentTarget.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  }

  function handleMouseLeave(e: MouseEvent<HTMLElement>) {
    e.currentTarget.style.setProperty("--spot-opacity", "0");
  }

  const interactiveProps = interactive
    ? {
        "data-cursor-interactive": "",
        onMouseEnter: handleMouseEnter,
        onMouseMove: handleMouseMove,
        onMouseLeave: handleMouseLeave,
      }
    : {};

  const content = interactive ? (
    <>
      <Spotlight />
      {children}
    </>
  ) : (
    children
  );

  if (href) {
    return (
      <Link href={href} className={classes} {...interactiveProps}>
        {content}
      </Link>
    );
  }

  if (as === "button") {
    return (
      <button type="button" className={classes} {...interactiveProps} {...rest}>
        {content}
      </button>
    );
  }

  if (as === "section") {
    return (
      <section className={classes} {...interactiveProps} {...rest}>
        {content}
      </section>
    );
  }

  return (
    <div className={classes} {...interactiveProps} {...rest}>
      {content}
    </div>
  );
}
