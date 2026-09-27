"use client";

import { useEffect, useRef } from "react";

// Shared engine for the experimental line-art motifs on /lab. A scene is a
// function of time that returns 3D line segments; this component projects
// and draws them every frame with the theme's colours, rotating the scene
// slowly. It handles the canvas plumbing once so each design is only
// geometry: sizing for sharp lines, theme changes, pausing off screen or in
// a background tab, and a still frame under prefers-reduced-motion.

export type V3 = [number, number, number];
// edge: the main outline, in the accent. fine: faint detail in the text
// colour. glint: a bright highlight, in the text colour at full strength.
export type Seg = { a: V3; b: V3; kind: "edge" | "fine" | "glint" };
export type Scene = {
  // ms since start → segments to draw this frame.
  segments: (t: number) => Seg[];
  // ms the build takes; after this the scene just turns (and the reduced-
  // motion still frame is taken here).
  buildMs: number;
  // Camera: how far to look down, how big, and where the centre sits.
  tilt?: number;
  zoom?: number;
  centerY?: number;
  // Radians per ms of rotation once running.
  spinSpeed?: number;
  // Or full control of the turn angle over time (e.g. a gentle sway).
  spin?: (t: number) => number;
  // Extra rotation about the horizontal axis, for tumbling objects.
  tumble?: (t: number) => number;
};

export const add = (p: V3, q: V3): V3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
export const scl = (p: V3, s: number): V3 => [p[0] * s, p[1] * s, p[2] * s];
export const mix = (p: V3, q: V3, t: number): V3 => add(p, scl(add(q, scl(p, -1)), t));
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// A segment drawn from a toward b, fraction p of the way (for draw-in).
export const partial = (a: V3, b: V3, p: number, kind: Seg["kind"]): Seg | null =>
  p <= 0 ? null : { a, b: mix(a, b, clamp01(p)), kind };

// Deterministic randomness, so a scene looks the same on every visit.
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function project(p: V3, spin: number, tilt: number, tumble: number, scale: number, cx: number, cy: number): [number, number] {
  let [x, y, z] = p;
  [y, z] = [y * Math.cos(tumble) - z * Math.sin(tumble), y * Math.sin(tumble) + z * Math.cos(tumble)];
  [x, z] = [x * Math.cos(spin) + z * Math.sin(spin), -x * Math.sin(spin) + z * Math.cos(spin)];
  [y, z] = [y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)];
  const persp = 3.4 / (3.4 + z);
  return [cx + x * scale * persp, cy - y * scale * persp];
}

export function LineArt({ scene, className = "", label }: { scene: Scene; className?: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ?still on the URL shows each finished frame without animating, for
    // comparing designs at a glance (the same path reduced motion takes).
    const reduced =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(window.location.search).has("still");
    let start = performance.now();
    let raf = 0;
    let visible = true;
    let palette = { fg: "#e8e8e6", accent: "#f5a623" };
    const readColors = () => {
      const css = getComputedStyle(document.documentElement);
      palette = {
        fg: css.getPropertyValue("--foreground").trim() || palette.fg,
        accent: css.getPropertyValue("--accent").trim() || palette.accent,
      };
      if (reduced) raf = requestAnimationFrame(draw);
    };
    const themeWatch = new MutationObserver(readColors);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode", "data-accent", "data-style"] });

    const speed = scene.spinSpeed ?? 0.00014;
    const RAMP = 1800;
    const spinAt = (t: number) => speed * (t - RAMP * (1 - Math.exp(-t / RAMP)));

    function draw(now: number) {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas!.clientWidth, h = canvas!.clientHeight;
      if (canvas!.width !== Math.round(w * dpr)) {
        canvas!.width = Math.round(w * dpr);
        canvas!.height = Math.round(h * dpr);
      }
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);

      const t = reduced ? scene.buildMs : now - start;
      const spin = scene.spin ? scene.spin(t) : 0.6 + (reduced ? 0 : spinAt(t));
      const tumble = scene.tumble ? scene.tumble(t) : 0;
      const scale = Math.min(w, h) * 0.5 * (scene.zoom ?? 1);
      const cy = h * (scene.centerY ?? 0.5);
      const { fg, accent } = palette;
      ctx!.lineCap = "round";

      for (const s of scene.segments(t)) {
        const [ax, ay] = project(s.a, spin, scene.tilt ?? 0.3, tumble, scale, w / 2, cy);
        const [bx, by] = project(s.b, spin, scene.tilt ?? 0.3, tumble, scale, w / 2, cy);
        ctx!.beginPath();
        ctx!.moveTo(ax, ay);
        ctx!.lineTo(bx, by);
        ctx!.strokeStyle = s.kind === "edge" ? accent : fg;
        ctx!.globalAlpha = s.kind === "edge" ? 0.95 : s.kind === "glint" ? 0.9 : 0.2;
        ctx!.lineWidth = s.kind === "edge" ? 1.2 : s.kind === "glint" ? 2 : 0.55;
        ctx!.stroke();
      }
      ctx!.globalAlpha = 1;
      if (!reduced && visible) raf = requestAnimationFrame(draw);
    }

    const observer = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.isIntersecting && !document.hidden;
      if (visible && !was && !reduced) raf = requestAnimationFrame(draw);
    });
    observer.observe(canvas);
    const onVisibility = () => {
      if (document.hidden) visible = false;
      else if (!visible) {
        visible = true;
        if (!reduced) raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    readColors();
    start = performance.now();
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      themeWatch.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [scene]);

  return <canvas ref={ref} role="img" aria-label={label} className={className} />;
}
