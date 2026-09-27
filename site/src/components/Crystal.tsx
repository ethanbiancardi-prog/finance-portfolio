"use client";

import { useEffect, useRef } from "react";

// Alternative PRISM motif: a quartz cluster. Quartz grows naturally as a
// six-sided prism with a pointed tip, so the crystals are literal prisms,
// drawn only in lines: slim columns with long points, slightly uneven like
// natural crystal, and faint internal lines seen through the glass. On the
// homepage they grow in place, column first and then the point, and then the
// spray of crystals turns slowly.
//
// Which motif the site uses (this or the twisted line prism in Prism.tsx)
// is chosen in one place: components/Motif.ts.

type V3 = [number, number, number];
type Seg = { a: V3; b: V3; kind: "edge" | "fine" };

const add = (p: V3, q: V3): V3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const scl = (p: V3, s: number): V3 => [p[0] * s, p[1] * s, p[2] * s];
const cross = (p: V3, q: V3): V3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const norm = (p: V3): V3 => scl(p, 1 / Math.hypot(...p));
const mix = (p: V3, q: V3, t: number): V3 => add(p, scl(add(q, scl(p, -1)), t));
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

type Crystal = { base: V3; axis: V3; r: number; h: number; tip: number; delay: number };

// A spray of six crystals from a common base: slim columns with long
// points, fanning out at different angles and lengths.
const CLUSTER: Crystal[] = [
  { base: [0, -1, 0], axis: [0.05, 1, 0.02], r: 0.17, h: 1.2, tip: 0.5, delay: 0 },
  { base: [0.12, -1, -0.06], axis: [0.55, 1, -0.15], r: 0.13, h: 0.95, tip: 0.4, delay: 0.1 },
  { base: [-0.12, -1, 0.05], axis: [-0.6, 1, 0.2], r: 0.12, h: 0.82, tip: 0.36, delay: 0.18 },
  { base: [0.05, -1, 0.12], axis: [0.2, 1, 0.7], r: 0.1, h: 0.62, tip: 0.3, delay: 0.26 },
  { base: [-0.06, -1, -0.12], axis: [-0.25, 1, -0.65], r: 0.1, h: 0.55, tip: 0.28, delay: 0.32 },
  { base: [0.2, -1, 0.08], axis: [1, 0.55, 0.2], r: 0.08, h: 0.42, tip: 0.22, delay: 0.4 },
];

// Segments for one crystal at growth g (0 = nothing, 1 = fully grown).
// The column rises over the first 65% of its growth, the tip over the rest.
function crystalSegments(c: Crystal, g: number): Seg[] {
  if (g <= 0) return [];
  const axis = norm(c.axis);
  const u = norm(cross(axis, Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]));
  const v = cross(axis, u);
  // Natural quartz faces are rarely equal; alternate slightly wider and
  // narrower so the section isn't a perfect hexagon.
  const ring = (at: number): V3[] =>
    Array.from({ length: 6 }, (_, k) => {
      const a = (k * Math.PI) / 3;
      const r = c.r * (k % 2 === 0 ? 1.08 : 0.92);
      return add(add(c.base, scl(axis, at)), add(scl(u, r * Math.cos(a)), scl(v, r * Math.sin(a))));
    });

  const body = easeOut(clamp01(g / 0.65));
  const tipG = easeOut(clamp01((g - 0.65) / 0.35));
  const height = c.h * body;
  const bottom = ring(0);
  const top = ring(height);
  const apex = add(c.base, scl(axis, c.h + c.tip));
  const segs: Seg[] = [];

  for (let k = 0; k < 6; k++) {
    const n = (k + 1) % 6;
    segs.push({ a: bottom[k], b: bottom[n], kind: "edge" });
    segs.push({ a: bottom[k], b: top[k], kind: "edge" });
    segs.push({ a: top[k], b: top[n], kind: "edge" });
    // Internal lines seen through the glass: each base corner to the top
    // corner across from it, as the column grows.
    segs.push({ a: bottom[k], b: top[(k + 3) % 6], kind: "fine" });
    if (tipG > 0) {
      segs.push({ a: top[k], b: mix(top[k], apex, tipG), kind: "edge" });
      // From the point straight down through the crystal to each base corner.
      segs.push({ a: mix(apex, bottom[k], 1 - tipG), b: bottom[k], kind: "fine" });
    }
  }
  return segs;
}

// One edge of a fully grown crystal (base corner, top corner, point), for
// the glint that runs up it.
function edgePath(c: Crystal): [V3, V3, V3] {
  const segs = crystalSegments(c, 1);
  const up = segs[1]; // base corner 0 to top corner 0
  const apex = add(c.base, scl(norm(c.axis), c.h + c.tip));
  return [up.a, up.b, apex];
}

// The rock at the base: an uneven ring the crystals rise from, and a
// smaller ring below it, joined by fine lines.
const ROCK: V3[] = Array.from({ length: 9 }, (_, k) => {
  const a = (k / 9) * 2 * Math.PI;
  const r = 0.42 + 0.1 * Math.sin(k * 2.3) + 0.05 * Math.cos(k * 5.1);
  return [r * Math.cos(a), -1.02 + 0.03 * Math.sin(k * 3.7), r * Math.sin(a)];
});
const ROCK_LOW: V3[] = ROCK.map(([x, y, z], k) => [x * 0.62, y - 0.13 - 0.03 * Math.cos(k * 1.7), z * 0.62]);

// Turn about the vertical axis (spin), look down a little (tilt), then
// project with slight perspective. Canvas y grows downward, so y flips.
function project(p: V3, spin: number, tilt: number, scale: number, cx: number, cy: number): [number, number] {
  let [x, y, z] = p;
  [x, z] = [x * Math.cos(spin) + z * Math.sin(spin), -x * Math.sin(spin) + z * Math.cos(spin)];
  [y, z] = [y * Math.cos(tilt) - z * Math.sin(tilt), y * Math.sin(tilt) + z * Math.cos(tilt)];
  const persp = 3.4 / (3.4 + z);
  return [cx + x * scale * persp, cy - y * scale * persp];
}

// Logo mark: one crystal, fully grown, as an SVG in the theme's colours.
export function CrystalMark({ size = 18, className = "" }: { size?: number; className?: string }) {
  const c: Crystal = { base: [0, -1, 0], axis: [0, 1, 0], r: 0.36, h: 1.05, tip: 0.85, delay: 0 };
  const segs = crystalSegments(c, 1).filter((s) => s.kind === "edge");
  const pt = (p: V3) => project(p, 0.45, 0.25, 8.4, 12, 11.2);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {segs.map((s, i) => {
        const [ax, ay] = pt(s.a);
        const [bx, by] = pt(s.b);
        return (
          <line
            key={i}
            x1={ax.toFixed(2)}
            y1={ay.toFixed(2)}
            x2={bx.toFixed(2)}
            y2={by.toFixed(2)}
            stroke={s.kind === "edge" ? "var(--accent)" : "currentColor"}
            strokeWidth={s.kind === "edge" ? 0.9 : 0.45}
            strokeLinecap="round"
            opacity={s.kind === "edge" ? 1 : 0.6}
          />
        );
      })}
    </svg>
  );
}

// Homepage piece. The cluster grows in place over ~2.6s, then turns slowly.
// Canvas, since the geometry changes every frame while growing. Pauses when
// off screen or in a background tab; under prefers-reduced-motion it draws
// the grown cluster once and stays still.
export function CrystalHero({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ?still (used by /lab) shows the finished frame without animating.
    const reduced =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(window.location.search).has("still");
    const GROW_MS = 2600;
    let start = performance.now();
    let raf = 0;
    let visible = true;

    // Theme colours, read once and again only when the theme changes.
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

    // Rotation speed ramps up from rest instead of starting at full speed.
    const SPEED = 0.00014;
    const RAMP_MS = 1800;
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

      const elapsed = reduced ? GROW_MS * 2 : now - start;
      const grow = elapsed / GROW_MS;
      const spin = reduced ? 0.6 : 0.6 + spinAt(elapsed);
      const scale = Math.min(w / 2.0, h / 2.1);
      const { fg, accent } = palette;
      const P = (p: V3) => project(p, spin, 0.22, scale, w / 2, h * 0.4);
      const line = (a: V3, b: V3, color: string, alpha: number, width: number) => {
        const [ax, ay] = P(a);
        const [bx, by] = P(b);
        ctx!.beginPath();
        ctx!.moveTo(ax, ay);
        ctx!.lineTo(bx, by);
        ctx!.strokeStyle = color;
        ctx!.globalAlpha = alpha;
        ctx!.lineWidth = width;
        ctx!.stroke();
      };
      ctx!.lineCap = "round";

      // Soft light inside the cluster, brightening as it grows.
      const [gx, gy] = P([0, -0.2, 0]);
      const glow = ctx!.createRadialGradient(gx, gy, 0, gx, gy, scale * 1.1);
      glow.addColorStop(0, accent);
      glow.addColorStop(1, "transparent");
      ctx!.globalAlpha = 0.13 * clamp01(grow);
      ctx!.fillStyle = glow;
      ctx!.fillRect(0, 0, w, h);

      // The rock the crystals grow out of.
      for (let k = 0; k < ROCK.length; k++) {
        const n = (k + 1) % ROCK.length;
        line(ROCK[k], ROCK[n], fg, 0.45, 0.9);
        line(ROCK_LOW[k], ROCK_LOW[n], fg, 0.2, 0.6);
        line(ROCK[k], ROCK_LOW[k], fg, 0.2, 0.6);
      }

      for (const c of CLUSTER) {
        const g = clamp01((grow - c.delay) / 0.72);
        for (const s of crystalSegments(c, g)) {
          line(s.a, s.b, s.kind === "edge" ? accent : fg, s.kind === "edge" ? 0.95 : 0.18, s.kind === "edge" ? 1.2 : 0.5);
        }
      }

      if (!reduced) {
        CLUSTER.forEach((c, i) => {
          if (clamp01((grow - c.delay) / 0.72) < 1) return;
          const [base, top, apex] = edgePath(c);
          // A glint running up one edge, base to tip, each crystal on its
          // own rhythm, with a pause between runs.
          const cycle = ((elapsed / 3200 + i * 0.37) % 1.6);
          if (cycle < 1) {
            const pos = cycle < 0.7 ? mix(base, top, cycle / 0.7) : mix(top, apex, (cycle - 0.7) / 0.3);
            const tail = cycle < 0.7 ? mix(base, top, Math.max(0, cycle - 0.08) / 0.7) : mix(top, apex, Math.max(0, cycle - 0.78) / 0.3);
            line(tail, pos, fg, 0.9, 2.2);
          }
          // A sparkle on the tip that swells and fades.
          const tw = Math.pow(0.5 + 0.5 * Math.sin(elapsed * 0.0022 + i * 1.9), 4);
          if (tw > 0.05) {
            const [sx, sy] = P(apex);
            const r = 3 + 7 * tw;
            ctx!.globalAlpha = 0.85 * tw;
            ctx!.strokeStyle = fg;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(sx - r, sy);
            ctx!.lineTo(sx + r, sy);
            ctx!.moveTo(sx, sy - r);
            ctx!.lineTo(sx, sy + r);
            ctx!.stroke();
          }
        });
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
      aria-label="A cluster of quartz crystals, six-sided prisms drawn in fine lines, growing and slowly turning"
      className={className}
    />
  );
}
