"use client";

import { useEffect, useRef } from "react";

// PRISM's visual motif: a long triangular prism drawn entirely in thin
// lines, with its far end twisted against the near one. Straight lines
// strung between the two ends bend into a smooth twisted surface, the way
// string art does. No fills, no colour beyond the theme's own.
//
// One geometry function feeds both the static logo (SVG) and the animated
// homepage piece (canvas).

type V3 = [number, number, number];
type Seg = { a: V3; b: V3; accent: boolean; order: number };

const TWIST = (2 * Math.PI) / 3; // far end turned a third of a turn
const RULINGS = 40; // strings per face; more, finer strings read as a smoother surface

// Corner k of the triangular cross-section at position x along the bar,
// turned by `twist`.
function corner(k: number, x: number, twist: number, r: number): V3 {
  const a = twist + (k * 2 * Math.PI) / 3 - Math.PI / 2;
  return [x, r * Math.cos(a), r * Math.sin(a)];
}
const mix = (p: V3, q: V3, t: number): V3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];

function prismSegments(length = 2.4, r = 0.62): Seg[] {
  const segs: Seg[] = [];
  const x0 = -length / 2, x1 = length / 2;
  const near = [0, 1, 2].map((k) => corner(k, x0, 0, r));
  const far = [0, 1, 2].map((k) => corner(k, x1, TWIST, r));

  // Strings: from each point along a near edge to the matching point on the
  // far edge. These are what bend into the twisted surface.
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i <= RULINGS; i++) {
      const t = i / RULINGS;
      segs.push({
        a: mix(near[k], near[(k + 1) % 3], t),
        b: mix(far[k], far[(k + 1) % 3], t),
        // The three long edges are drawn in the accent.
        accent: i === 0,
        order: (k * (RULINGS + 1) + i) / (3 * (RULINGS + 1)),
      });
    }
  }
  // The two end triangles, in the accent, framing the strings.
  for (const [pts, order] of [[near, 0], [far, 1]] as const) {
    for (let k = 0; k < 3; k++) segs.push({ a: pts[k], b: pts[(k + 1) % 3], accent: true, order });
  }
  return segs;
}

// Rotate about the long axis (spin), tilt towards the viewer, then project
// with a little perspective.
function project(p: V3, spin: number, tilt: number, yaw: number, scale: number, cx: number, cy: number): [number, number] {
  let [x, y, z] = p;
  [y, z] = [y * Math.cos(spin) - z * Math.sin(spin), y * Math.sin(spin) + z * Math.cos(spin)];
  [x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
  [y, z] = [y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)];
  const persp = 3.2 / (3.2 + z);
  return [cx + x * scale * persp, cy + y * scale * persp];
}

// Logo mark: the same shape, still, as an SVG in currentColor.
export function PrismMark({ size = 18, className = "" }: { size?: number; className?: string }) {
  const segs = prismSegments(2.2, 0.72);
  const pt = (p: V3) => project(p, 0.35, -0.35, -0.55, 9.5, 12, 12);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {segs
        .filter((s, i) => s.accent || i % 4 === 0)
        .map((s, i) => {
          const [ax, ay] = pt(s.a);
          const [bx, by] = pt(s.b);
          return (
            <line
              key={i}
              x1={ax.toFixed(2)}
              y1={ay.toFixed(2)}
              x2={bx.toFixed(2)}
              y2={by.toFixed(2)}
              stroke={s.accent ? "var(--accent)" : "currentColor"}
              strokeWidth={s.accent ? 0.9 : 0.45}
              opacity={s.accent ? 1 : 0.7}
            />
          );
        })}
    </svg>
  );
}

// Homepage piece: the lines draw themselves in and the prism assembles,
// then it turns slowly in 3D so the strings sweep across each other.
// Canvas, since ~70 lines re-projected every frame is cheap there and
// heavy as SVG. Pauses when off screen or in a background tab; under
// prefers-reduced-motion it draws the finished shape once and stays still.
export function PrismHero({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const segs = prismSegments();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const BUILD_MS = 2200;
    let start = performance.now();
    let raf = 0;
    let visible = true;

    // Theme colours, read once and again only when the theme changes.
    // Reading computed styles every frame causes small stutters.
    let palette = { fg: "#e8e8e6", accent: "#f5a623" };
    const readColors = () => {
      const css = getComputedStyle(document.documentElement);
      palette = {
        fg: css.getPropertyValue("--foreground").trim() || palette.fg,
        accent: css.getPropertyValue("--accent").trim() || palette.accent,
      };
      if (reduced) raf = requestAnimationFrame(draw); // repaint the still frame
    };
    const themeWatch = new MutationObserver(readColors);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode", "data-accent", "data-style"] });

    const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    // Rotation angle with the speed ramping up smoothly from rest over the
    // first ~1.5s, instead of starting at full speed.
    const SPEED = 0.00016;
    const RAMP_MS = 1500;
    const spinAt = (t: number) => SPEED * (t - RAMP_MS * (1 - Math.exp(-t / RAMP_MS)));

    function draw(now: number) {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas!.clientWidth, h = canvas!.clientHeight;
      if (canvas!.width !== Math.round(w * dpr)) {
        canvas!.width = Math.round(w * dpr);
        canvas!.height = Math.round(h * dpr);
      }
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);

      const elapsed = reduced ? BUILD_MS + 1 : now - start;
      const build = easeInOut(Math.min(1, elapsed / BUILD_MS));
      const spin = reduced ? 0.5 : 0.5 + spinAt(elapsed);
      const scale = Math.min(w / 3.3, h / 2.3);
      const { fg, accent } = palette;
      ctx!.lineCap = "round";

      for (const s of segs) {
        // Each line starts drawing at its own moment and takes 35% of the
        // build to reach full length, so the shape fills in as a sweep.
        const local = easeOut(Math.max(0, Math.min(1, (build - s.order * 0.65) / 0.35)));
        if (local <= 0) continue;
        const [ax, ay] = project(s.a, spin, -0.28, -0.32, scale, w / 2, h / 2);
        const [bx, by] = project(s.b, spin, -0.28, -0.32, scale, w / 2, h / 2);
        ctx!.beginPath();
        ctx!.moveTo(ax, ay);
        ctx!.lineTo(ax + (bx - ax) * local, ay + (by - ay) * local);
        ctx!.strokeStyle = s.accent ? accent : fg;
        ctx!.globalAlpha = s.accent ? 0.95 : 0.2;
        ctx!.lineWidth = s.accent ? 1.3 : 0.55;
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
      if (document.hidden) {
        visible = false;
      } else if (!visible) {
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
  }, []);

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="A long triangular prism drawn in fine lines, twisting as it slowly turns"
      className={className}
    />
  );
}
