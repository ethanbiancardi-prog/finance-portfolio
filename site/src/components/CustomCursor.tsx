"use client";

import { useEffect, useRef } from "react";

// A small reticle (rounded-square ring + center dot) that tracks the real
// mouse cursor, purely as a visual flourish. Never mounted/enabled on
// touch/coarse-pointer devices — see the matchMedia check below — so it
// costs nothing on mobile and never gets in the way of tapping.
export default function CustomCursor() {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(pointer: fine) and (hover: hover)");

    let cleanup: (() => void) | undefined;

    function enable() {
      document.documentElement.classList.add("cursor-none-active");

      const wrapper = wrapperRef.current;
      if (!wrapper) return;

      function onMouseMove(e: MouseEvent) {
        wrapper!.style.setProperty("--cursor-x", `${e.clientX}px`);
        wrapper!.style.setProperty("--cursor-y", `${e.clientY}px`);
      }

      function onPointerOver(e: PointerEvent) {
        const target = e.target as Element | null;
        const interactive = target?.closest(
          "a, button, input, select, textarea, [data-cursor-interactive]",
        );
        wrapper!.classList.toggle("is-hovering", !!interactive);
      }

      window.addEventListener("mousemove", onMouseMove, { passive: true });
      window.addEventListener("pointerover", onPointerOver, { passive: true });

      cleanup = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("pointerover", onPointerOver);
      };
    }

    function disable() {
      document.documentElement.classList.remove("cursor-none-active");
      cleanup?.();
      cleanup = undefined;
    }

    function handleChange() {
      if (query.matches) enable();
      else disable();
    }

    handleChange();
    query.addEventListener("change", handleChange);

    return () => {
      query.removeEventListener("change", handleChange);
      disable();
    };
  }, []);

  return (
    <div ref={wrapperRef} className="cursor-reticle" aria-hidden="true">
      <div className="cursor-reticle-ring" />
      <div className="cursor-reticle-dot" />
    </div>
  );
}
