"use client";

// Sub-navigation for the quant tools: a row of tabs under the main nav with
// one sliding indicator bar that glides to whichever tab matches the current
// route. Colors come from the site's CSS tokens (panel / border / accent), so
// it follows the Theme and Modern/Terminal style switches like everything
// else — dark-first by default.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

export type QuantTool = {
  key: string;
  label: string;
  /** Shorter label used below the lg breakpoint. */
  short?: string;
  href: string;
};

export const QUANT_TOOLS = [
  { key: "backtester", label: "Regime Backtester", short: "Backtester", href: "/quant/backtester" },
  { key: "optimizer", label: "Portfolio Optimizer", short: "Optimizer", href: "/optimizer" },
  { key: "factor-risk", label: "Factor Risk Attribution", short: "Factor Risk", href: "/quant/factor-risk" },
  { key: "monte-carlo", label: "Monte Carlo Forecast", short: "Monte Carlo", href: "/monte-carlo" },
  { key: "vol-smile", label: "Options Volatility Smile", short: "Vol Smile", href: "/quant/vol-smile" },
] as const satisfies readonly QuantTool[];

export type QuantToolKey = (typeof QUANT_TOOLS)[number]["key"];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function QuantHubHeader({
  tools = QUANT_TOOLS,
  title,
  right,
}: {
  tools?: readonly QuantTool[];
  /** Optional eyebrow on the left; off by default to leave room for the tabs. */
  title?: string;
  /** Optional content on the right (a status stamp, a button). */
  right?: React.ReactNode;
}) {
  const pathname = usePathname();
  const scroller = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef(new Map<string, HTMLAnchorElement>());
  const activeKey = tools.find((t) => isActive(pathname, t.href))?.key ?? null;

  // Move the indicator under the active tab. Written straight to the
  // element's style (no state) so it animates via CSS transitions and never
  // re-renders the row; re-measured on route change and on resize.
  useLayoutEffect(() => {
    const bar = indicator.current;
    const row = scroller.current;
    if (!bar || !row) return;

    const place = (animate: boolean) => {
      const el = activeKey ? tabRefs.current.get(activeKey) : undefined;
      bar.style.transition = animate ? "" : "none";
      if (!el) {
        bar.style.opacity = "0";
        return;
      }
      bar.style.opacity = "1";
      bar.style.transform = `translateX(${el.offsetLeft}px)`;
      bar.style.width = `${el.offsetWidth}px`;
      // Keep the active tab in view when the row scrolls on small screens.
      const target = el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2;
      row.scrollTo({ left: Math.max(0, target), behavior: animate ? "smooth" : "auto" });
    };

    place(true);
    const onResize = () => place(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeKey, tools]);

  return (
    <header className="sticky top-[37px] z-30 sm:top-[63px] border-b border-border bg-panel/95 backdrop-blur supports-[backdrop-filter]:bg-panel/80">
      <div className="flex w-full items-center gap-4 px-4 sm:px-6 lg:px-10">
        {title && <span className="hidden shrink-0 text-[10px] caps text-zinc-500 lg:block">{title}</span>}

        <div
          ref={scroller}
          className="relative -mb-px flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)]"
        >
          <nav aria-label={title ?? "Quant tools"} className="flex">
            {tools.map((t) => {
              const active = t.key === activeKey;
              return (
                <Link
                  key={t.key}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  ref={(el) => {
                    if (el) tabRefs.current.set(t.key, el);
                    else tabRefs.current.delete(t.key);
                  }}
                  className={`group flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 py-2.5 text-[11px] caps transition-colors duration-150 ease-out ${
                    active ? "text-accent" : "text-zinc-500 hover:text-foreground"
                  }`}
                >
                  {/* Indicator light: scales in on the active tab, faint on hover. */}
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ease-out ${
                      active
                        ? "scale-100 bg-accent opacity-100 shadow-[0_0_8px_var(--accent)]"
                        : "scale-50 bg-zinc-500 opacity-0 group-hover:scale-75 group-hover:opacity-60"
                    }`}
                  />
                  <span className="lg:hidden">{t.short ?? t.label}</span>
                  <span className="hidden lg:inline">{t.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Sliding underline; positioned by the effect above. */}
          <span
            ref={indicator}
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 h-px w-0 bg-accent opacity-0 transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          />
        </div>

        {right && <div className="hidden shrink-0 items-center text-[11px] text-zinc-500 lg:flex">{right}</div>}
      </div>
    </header>
  );
}
