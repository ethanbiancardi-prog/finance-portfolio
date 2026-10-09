"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { prismSegments, project, TWIST, type V3 } from "@/components/Prism";

// The homepage: one full-screen canvas built around the PRISM logo, the
// twisted string-art prism, blown up and alive.
//
//   - The prism turns slowly on its own; drag sideways to spin it, and it
//     keeps the momentum before easing back to its idle speed.
//   - It leans towards the mouse, and the strings near the cursor light up.
//   - Its twist breathes in and out, so the strung surface keeps reshaping.
//   - Faint strings fan out from both ends to the edges of the screen, with
//     sparks running in from the left and out to the right: data in,
//     research out.
//   - Every few seconds, and on every click, a glowing ring travels through
//     the prism from one end to the other.
//   - On load the lines fly in from all around and lock into the prism.
//     "Rebuild" (and a timer, every 40s) blows it apart and builds it again
//     from new scattered places.
//
// Only theme colours (foreground + accent), read from CSS, so every mode and
// accent works. Pauses in a background tab; under prefers-reduced-motion it
// draws one still frame.

export type StageSnapshot = {
  equity: number;
  changePct: number;
  spark: string;
  /** Tickers the algorithm holds now; they ride the incoming sparks. */
  holdings: string[];
  /** When the algorithm last checked the market (ISO). */
  lastCheck: string | null;
};

// What comes out of the prism: the lenses the site's tools look through.
const OUT_WORDS = ["Value", "Risk", "Momentum", "Signals", "Quality", "Volatility"];

const RULINGS = 30; // strings per face
const LENGTH = 2.4;
const RADIUS = 0.62;
const FAN = 16; // background strings per prism corner
const SPARKS = 26;
const RING_EVERY_MS = 6000;
const RING_MS = 3800; // how long a ring takes to travel the prism
const DUST = 70;

type Spark = { side: 0 | 1; corner: number; edge: number; t: number; speed: number; label: string | null; held: boolean };
type Ring = { born: number };

export default function PrismStage({ snapshot, universe }: { snapshot: StageSnapshot | null; universe: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // Set by the animation loop; the Rebuild button calls it.
  const rebuildRef = useRef<(() => void) | null>(null);
  // Read by the animation loop, so new props don't restart it.
  const tickersRef = useRef({ holdings: snapshot?.holdings ?? [], universe });
  useEffect(() => {
    tickersRef.current = { holdings: snapshot?.holdings ?? [], universe };
  }, [snapshot, universe]);

  // Fill the screen exactly: viewport height minus whatever the nav measures.
  useEffect(() => {
    const stage = stageRef.current;
    const nav = document.querySelector("nav");
    if (!stage || !nav) return;
    const fit = () => stage.style.setProperty("--nav-h", `${nav.getBoundingClientRect().height}px`);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let palette = { fg: "#e8e8e6", accent: "#ffb020" };
    let raf = 0;
    let running = true;
    const readColors = () => {
      const css = getComputedStyle(document.documentElement);
      palette = {
        fg: css.getPropertyValue("--foreground").trim() || palette.fg,
        accent: css.getPropertyValue("--accent").trim() || palette.accent,
      };
      if (reduced) frame(performance.now());
    };
    const themeWatch = new MutationObserver(readColors);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode", "data-accent", "data-style"] });

    // Motion state.
    const IDLE_SPEED = 0.00012; // radians per ms
    let spin = 0.5;
    let speed = IDLE_SPEED;
    let yaw = -0.32, tilt = -0.28; // eased towards the mouse
    let mouse: { x: number; y: number } | null = null;
    let drag: { x: number; t: number } | null = null;
    let last = performance.now();
    const start = last;
    let nextRing = start + 1200;
    const rings: Ring[] = [];

    // Construction. Every line has a scattered starting place somewhere
    // around the prism; `assembly` runs 0 → 1 as they fly in and lock into
    // place, in the same sweep order the logo uses. A rebuild runs it back
    // down to 0 (the lines fly apart, last-placed first), picks new scatter
    // places, and builds again, so no two rebuilds look the same.
    const SEG_COUNT = prismSegments(LENGTH, RADIUS, RULINGS).length;
    let scatter: { a: V3; b: V3 }[] = [];
    const rescatter = () => {
      scatter = Array.from({ length: SEG_COUNT }, () => {
        // A random direction, and a distance well outside the prism.
        const th = Math.random() * 2 * Math.PI, ph = Math.acos(2 * Math.random() - 1);
        const dir: V3 = [Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)];
        const dist = 2.2 + Math.random() * 2.5;
        const jitter = () => (Math.random() - 0.5) * 0.9;
        return {
          a: [dir[0] * dist + jitter(), dir[1] * dist + jitter(), dir[2] * dist * 0.4],
          b: [dir[0] * dist * 1.15 + jitter(), dir[1] * dist * 1.15 + jitter(), dir[2] * dist * 0.4],
        };
      });
    };
    rescatter();
    const BUILD_MS = 6000;
    const BREAK_MS = 2600;
    const REBUILD_EVERY_MS = 40000;
    let phase: { mode: "build" | "break"; start: number } = { mode: "build", start: last };
    let nextRebuild = last + REBUILD_EVERY_MS;
    const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
    const lerp3 = (p: V3, q: V3, t: number): V3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    function assembly(now: number) {
      if (reduced) return 1;
      const t = (now - phase.start) / (phase.mode === "build" ? BUILD_MS : BREAK_MS);
      if (phase.mode === "break" && t >= 1) {
        rescatter();
        phase = { mode: "build", start: now };
        return 0;
      }
      return phase.mode === "build" ? easeInOut(clamp01(t)) : 1 - easeInOut(clamp01(t));
    }
    rebuildRef.current = () => {
      if (reduced || phase.mode === "break") return;
      phase = { mode: "break", start: performance.now() };
      nextRebuild = performance.now() + REBUILD_EVERY_MS;
    };

    // Most sparks carry a word. On the way in it's a ticker: any stock the
    // site covers, with the algorithm's current holdings picked a third of
    // the time and drawn brighter. On the way out it's one of the tools'
    // lenses.
    const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];
    function newSpark(t = 0): Spark {
      const side = Math.random() < 0.5 ? 0 : 1;
      const { holdings, universe: all } = tickersRef.current;
      let label: string | null = null;
      let held = false;
      if (Math.random() < 0.7) {
        if (side === 1) label = pick(OUT_WORDS);
        else if (holdings.length && Math.random() < 0.33) {
          label = pick(holdings);
          held = true;
        } else if (all.length) {
          label = pick(all);
          held = holdings.includes(label);
        }
      }
      return {
        side,
        corner: Math.floor(Math.random() * 3),
        edge: Math.floor(Math.random() * FAN),
        t,
        speed: 0.00009 + Math.random() * 0.00013,
        label,
        held,
      };
    }

    // Created after newSpark and pick above: `pick` is a const, so calling
    // newSpark any earlier hits it before it exists and the page crashes.
    const sparks: Spark[] = Array.from({ length: SPARKS }, () => newSpark(Math.random()));

    // Dust: slow specks drifting across the whole stage, for depth.
    const dust = Array.from({ length: DUST }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.3) * 0.000012,
      vy: (Math.random() - 0.5) * 0.000006,
      phase: Math.random() * Math.PI * 2,
      r: 0.5 + Math.random() * 1.1,
    }));
    const font = getComputedStyle(document.body).fontFamily;

    function frame(now: number) {
      const dt = Math.min(64, now - last);
      last = now;
      // Capped: past 1.5x the extra pixels cost far more than they show.
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const w = canvas!.clientWidth, h = canvas!.clientHeight;
      if (canvas!.width !== Math.round(w * dpr) || canvas!.height !== Math.round(h * dpr)) {
        canvas!.width = Math.round(w * dpr);
        canvas!.height = Math.round(h * dpr);
      }
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);
      const { fg, accent } = palette;
      const wide = w >= 768;

      // Placement: right of centre on a wide screen (text sits bottom-left),
      // upper middle on a phone.
      const cx = wide ? w * 0.6 : w * 0.5;
      const cy = wide ? h * 0.42 : h * 0.32;
      const scale = wide ? Math.min(w / 4.4, h / 3) : Math.min(w / 3.4, h / 4);

      if (!reduced) {
        // Spin: drag sets the speed directly; otherwise it eases back to idle.
        if (!drag) speed += (IDLE_SPEED - speed) * Math.min(1, dt / 1400);
        spin += speed * dt;
        // Lean towards the mouse.
        const ty = mouse ? -0.32 + ((mouse.x / w) - 0.5) * 0.7 : -0.32;
        const tt = mouse ? -0.28 + ((mouse.y / h) - 0.5) * 0.5 : -0.28;
        yaw += (ty - yaw) * Math.min(1, dt / 500);
        tilt += (tt - tilt) * Math.min(1, dt / 500);
        if (now >= nextRebuild) rebuildRef.current?.();
      }
      const g = assembly(now);
      const built = g >= 1;
      if (!reduced && built && now >= nextRing) {
        rings.push({ born: now });
        nextRing = now + RING_EVERY_MS;
      }
      if (!built) rings.length = 0;

      // The twist breathes between about 0.7x and 1.3x of the logo's.
      const elapsed = now - start;
      const twist = reduced ? TWIST : TWIST * (1 + 0.3 * Math.sin(elapsed / 5200));
      const segs = prismSegments(LENGTH, RADIUS, RULINGS, twist);
      const P = (p: V3) => project(p, spin, tilt, yaw, scale, cx, cy);
      ctx!.lineCap = "round";

      // 0. Atmosphere: drifting, twinkling dust. (The glow behind the prism
      //    is a CSS gradient under the canvas, which costs nothing per frame.)
      ctx!.fillStyle = fg;
      for (const d of dust) {
        if (!reduced) {
          d.x = (d.x + d.vx * dt + 1) % 1;
          d.y = (d.y + d.vy * dt + 1) % 1;
        }
        ctx!.globalAlpha = 0.1 + 0.12 * Math.sin(elapsed / 1400 + d.phase);
        ctx!.fillRect(d.x * w, d.y * h, d.r * 1.6, d.r * 1.6);
      }

      // 1. Background fans: from each end's corners out to the screen edges.
      const nearC = [0, 1, 2].map((k) => P(segs[k * (RULINGS + 1)].a));
      const farC = [0, 1, 2].map((k) => P(segs[k * (RULINGS + 1)].b));
      const edgeY = (j: number) => (h * (j + 0.5)) / FAN;
      ctx!.strokeStyle = fg;
      ctx!.lineWidth = 0.5;
      ctx!.globalAlpha = 0.05 * g;
      ctx!.beginPath();
      for (let k = 0; k < 3; k++) {
        for (let j = 0; j < FAN; j++) {
          ctx!.moveTo(0, edgeY(j));
          ctx!.lineTo(nearC[k][0], nearC[k][1]);
          ctx!.moveTo(w, edgeY(j));
          ctx!.lineTo(farC[k][0], farC[k][1]);
        }
      }
      ctx!.stroke();

      // 2. Sparks along the fans: inwards on the left, outwards on the right.
      if (!reduced) {
        ctx!.strokeStyle = accent;
        ctx!.lineWidth = 1.4;
        for (let i = 0; i < sparks.length; i++) {
          const s = sparks[i];
          s.t += s.speed * dt;
          if (s.t > 1) {
            sparks[i] = newSpark();
            continue;
          }
          const edge: [number, number] = [s.side === 0 ? 0 : w, edgeY(s.edge)];
          const c = s.side === 0 ? nearC[s.corner] : farC[s.corner];
          const [from, to] = s.side === 0 ? [edge, c] : [c, edge];
          const t0 = s.t, t1 = Math.min(1, s.t + 0.07);
          ctx!.globalAlpha = 0.85 * Math.sin(Math.PI * s.t) * g;
          ctx!.beginPath();
          ctx!.moveTo(from[0] + (to[0] - from[0]) * t0, from[1] + (to[1] - from[1]) * t0);
          ctx!.lineTo(from[0] + (to[0] - from[0]) * t1, from[1] + (to[1] - from[1]) * t1);
          ctx!.stroke();
          if (s.label) {
            // The word rides just above the spark's head, in text colour.
            const hx = from[0] + (to[0] - from[0]) * t1, hy = from[1] + (to[1] - from[1]) * t1;
            ctx!.fillStyle = fg;
            ctx!.globalAlpha *= s.held ? 1 : 0.55;
            ctx!.font = `${s.held ? "600 " : ""}${s.side === 0 ? 11 : 10}px ${font}`;
            ctx!.textAlign = s.side === 0 ? "right" : "left";
            ctx!.fillText(s.side === 0 ? s.label : s.label.toUpperCase(), hx + (s.side === 0 ? -6 : 6), hy - 6);
          }
        }
      }

      // 3. The prism's strings, brighter and warmer near the cursor.
      //    While building, each line is part-way between its scattered place
      //    and its spot on the prism, fading in as it arrives.
      const placed = segs.map((s) => (built ? 1 : easeOut(clamp01((g - s.order * 0.6) / 0.4))));
      const projected = segs.map((s, i) =>
        placed[i] >= 1
          ? ([P(s.a), P(s.b)] as const)
          : ([P(lerp3(scatter[i].a, s.a, placed[i])), P(lerp3(scatter[i].b, s.b, placed[i]))] as const),
      );
      //    Settled, unlit strings all share one style, so they go in a single
      //    path and one stroke; only lit or in-flight lines draw one by one.
      //    Glow is a wide faint stroke under a thin bright one (canvas
      //    shadows are far too slow to use every frame).
      const plain = new Path2D();
      const edges = new Path2D();
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (placed[i] <= 0) continue;
        const [[ax, ay], [bx, by]] = projected[i];
        if (s.accent) {
          if (placed[i] >= 1) {
            edges.moveTo(ax, ay);
            edges.lineTo(bx, by);
            continue;
          }
          ctx!.strokeStyle = accent;
          ctx!.globalAlpha = 0.95 * placed[i];
          ctx!.lineWidth = 2.2;
        } else {
          let glow = 0;
          if (mouse) {
            const d = Math.hypot((ax + bx) / 2 - mouse.x, (ay + by) / 2 - mouse.y);
            glow = Math.max(0, 1 - d / (scale * 0.3));
          }
          if (placed[i] >= 1 && glow === 0) {
            plain.moveTo(ax, ay);
            plain.lineTo(bx, by);
            continue;
          }
          ctx!.strokeStyle = glow > 0.15 ? accent : fg;
          // In flight the lines are a little brighter, so the assembly reads.
          ctx!.globalAlpha = (placed[i] < 1 ? 0.55 : 0.42 + glow * 0.55) * Math.min(1, placed[i] * 2);
          ctx!.lineWidth = 0.85 + glow * 0.6;
        }
        ctx!.beginPath();
        ctx!.moveTo(ax, ay);
        ctx!.lineTo(bx, by);
        ctx!.stroke();
      }
      ctx!.strokeStyle = fg;
      ctx!.globalAlpha = 0.42;
      ctx!.lineWidth = 0.85;
      ctx!.stroke(plain);
      ctx!.strokeStyle = accent;
      ctx!.globalAlpha = 0.28;
      ctx!.lineWidth = 8;
      ctx!.stroke(edges);
      ctx!.globalAlpha = 0.95;
      ctx!.lineWidth = 2.2;
      ctx!.stroke(edges);

      // 4. Rings: a band of light travelling through every string at once,
      //    tracing the twisted cross-section as it goes.
      ctx!.strokeStyle = accent;
      for (let r = rings.length - 1; r >= 0; r--) {
        const u = (now - rings[r].born) / RING_MS;
        if (u > 1) {
          rings.splice(r, 1);
          continue;
        }
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; // ease in-out
        const band = new Path2D();
        for (let i = 0; i < segs.length; i++) {
          if (segs[i].order === 0 || segs[i].order === 1) continue; // end triangles
          const [[ax, ay], [bx, by]] = projected[i];
          const u0 = Math.max(0, e - 0.02), u1 = Math.min(1, e + 0.02);
          band.moveTo(ax + (bx - ax) * u0, ay + (by - ay) * u0);
          band.lineTo(ax + (bx - ax) * u1, ay + (by - ay) * u1);
        }
        const fade = Math.sin(Math.PI * u);
        ctx!.globalAlpha = 0.22 * fade;
        ctx!.lineWidth = 8;
        ctx!.stroke(band);
        ctx!.globalAlpha = fade;
        ctx!.lineWidth = 2;
        ctx!.stroke(band);
      }
      ctx!.globalAlpha = 1;

      if (!reduced && running) raf = requestAnimationFrame(frame);
    }

    // Input. Pointer events cover mouse, pen and touch alike.
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (e.pointerType === "mouse") mouse = p;
      if (drag) {
        const dt = Math.max(1, e.timeStamp - drag.t);
        speed = Math.max(-0.02, Math.min(0.02, ((p.x - drag.x) / dt) * 0.012));
        drag = { x: p.x, t: e.timeStamp };
      }
    };
    let downAt = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => {
      const p = local(e);
      downAt = p;
      drag = { x: p.x, t: e.timeStamp };
    };
    const onUp = (e: PointerEvent) => {
      const p = local(e);
      // A click (not a drag) sends a ring through the prism.
      if (Math.hypot(p.x - downAt.x, p.y - downAt.y) < 6 && !reduced) rings.push({ born: performance.now() });
      drag = null;
    };
    const onLeave = () => {
      mouse = null;
      drag = null;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      running = !document.hidden;
      if (running && !reduced) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const onResize = () => reduced && frame(performance.now());
    window.addEventListener("resize", onResize);

    readColors();
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      themeWatch.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const up = (snapshot?.changePct ?? 0) >= 0;

  return (
    <div
      ref={stageRef}
      className="relative h-[calc(100svh-var(--nav-h,64px))] min-h-[520px] w-full overflow-hidden bg-background"
    >
      {/* The glow behind the prism, centred where the canvas draws it. */}
      <div
        aria-hidden="true"
        className="prism-halo pointer-events-none absolute inset-0"
      />
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="The PRISM logo, a twisted triangular prism strung in fine lines, turning slowly. Drag to spin it, click to send a ring of light through it."
        className="absolute inset-0 h-full w-full cursor-grab touch-pan-y active:cursor-grabbing"
      />

      {/* Fades the bottom so the text reads cleanly over the strings. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background via-background/70 to-transparent" />

      {snapshot && (
        <AlgoStatusLine lastCheck={snapshot.lastCheck} holdings={snapshot.holdings.length} />
      )}

      <div className="absolute right-4 top-4 flex items-center gap-3 text-[10px] caps text-zinc-500 lg:right-10">
        <span className="pointer-events-none hidden sm:inline">Drag to spin · click for a pulse</span>
        <button
          type="button"
          onClick={() => rebuildRef.current?.()}
          className="rounded-[var(--radius-sm)] border border-border bg-background/60 px-2.5 py-1 caps text-foreground backdrop-blur transition-colors duration-150 hover:border-accent hover:text-accent"
        >
          Rebuild
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-6 px-4 pb-8 sm:px-6 sm:pb-10 md:flex-row md:items-end md:justify-between lg:px-10 lg:pb-12">
        <div className="max-w-xl">
          <h1 className="text-[56px] font-semibold leading-none tracking-[0.18em] text-foreground sm:text-[88px] lg:text-[112px]">
            PRISM
          </h1>
          <p className="mt-4 max-w-md text-[13px] leading-[1.6] text-zinc-500 dark:text-zinc-400">
            Finance tools built on real market data, real filings and real AI, by Ethan Biancardi, Bentley ’29.
          </p>
          <div className="pointer-events-auto mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("prism:open-tools"))}
              className="rounded-[var(--radius-sm)] bg-accent px-4 py-2 text-[11px] caps text-background transition-opacity duration-150 hover:opacity-90"
            >
              Explore the tools
            </button>
            <Link
              href="/paper-trading"
              className="rounded-[var(--radius-sm)] border border-border bg-background/60 px-4 py-2 text-[11px] caps text-foreground backdrop-blur transition-colors duration-150 hover:border-accent"
            >
              Watch the algorithm trade →
            </Link>
          </div>
        </div>

        {/* Hidden entirely when the portfolio can't be loaded. */}
        {snapshot && (
          <Link
            href="/paper-trading"
            className="pointer-events-auto hidden w-[240px] shrink-0 rounded-[var(--radius)] border border-border bg-panel/70 p-3.5 backdrop-blur transition-colors duration-150 hover:border-accent sm:block"
          >
            <span className="flex items-center justify-between text-[9px] caps-wide text-zinc-500">
              Paper account
              <span className="inline-flex items-center gap-1.5 text-good">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
                Live
              </span>
            </span>
            <span className="mt-2 flex items-baseline gap-2">
              <span className="text-lg tabular-nums text-foreground">
                ${snapshot.equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={`text-[11px] tabular-nums ${up ? "text-good" : "text-bad"}`}>
                {up ? "+" : "−"}
                {Math.abs(snapshot.changePct * 100).toFixed(1)}%
              </span>
            </span>
            <svg viewBox="0 0 208 40" width="100%" height="40" className="mt-2 block" preserveAspectRatio="none" aria-hidden="true">
              <polyline
                points={snapshot.spark}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span className="mt-1.5 block text-[10px] text-zinc-500">Traded every 15 minutes by my algorithm.</span>
          </Link>
        )}
      </div>
    </div>
  );
}

// "Algorithm checked 4 min ago · 10 holdings", kept current while the page
// sits open. A check within the last 20 minutes counts as active (it runs
// every 15 minutes in market hours), so the dot pulses green; otherwise it
// is grey and the line says when the last check was.
function AlgoStatusLine({ lastCheck, holdings }: { lastCheck: string | null; holdings: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  // Rendered only in the browser, so the server and client agree on "now".
  if (now === null || !lastCheck) return null;
  const mins = Math.max(0, Math.round((now - new Date(lastCheck).getTime()) / 60_000));
  const active = mins <= 20;
  const ago =
    mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 60 * 24 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
  return (
    <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 text-[10px] caps text-zinc-500 sm:left-6 lg:left-10">
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "animate-pulse bg-good" : "bg-zinc-500"}`} />
      <span>
        Algorithm {active ? "trading" : "idle"} · checked {ago} · {holdings} holdings
      </span>
    </div>
  );
}
