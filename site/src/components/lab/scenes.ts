// Experimental PRISM motifs for /lab, drawn by LineArt.tsx. Each scene is
// pure geometry: a function of time returning 3D line segments.

import { add, clamp01, easeOut, mix, partial, scl, seeded, type Scene, type Seg, type V3 } from "./LineArt";

const keep = (segs: (Seg | null)[]): Seg[] => segs.filter((s): s is Seg => s !== null);

// ---------------------------------------------------------------------------
// Basalt columns: a patch of six-sided stone columns (like the Giant's
// Causeway) rising from the ground to heights that follow a price walk, left
// to right, so the rock is secretly a bar chart.
// ---------------------------------------------------------------------------
function basalt(): Scene {
  const R = 0.2; // column radius
  const cells: { x: number; z: number }[] = [];
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) {
      if (Math.abs(q + r) > 2) continue;
      cells.push({ x: R * Math.sqrt(3) * (q + r / 2), z: R * 1.5 * r });
    }
  }
  cells.sort((a, b) => a.x - b.x || a.z - b.z);
  // Heights: a random walk in left-to-right order, like a price series.
  const rand = seeded(11);
  let level = 0.35;
  const heights = cells.map(() => (level = Math.max(0.1, Math.min(1.1, level + (rand() - 0.4) * 0.34))));
  const ring = (x: number, z: number, y: number): V3[] =>
    Array.from({ length: 6 }, (_, k) => {
      const a = (k * Math.PI) / 3 + Math.PI / 6;
      return [x + R * 0.94 * Math.cos(a), y, z + R * 0.94 * Math.sin(a)];
    });
  const BASE = -0.45;

  return {
    buildMs: 2600,
    zoom: 0.95,
    tilt: 0.48,
    centerY: 0.6,
    segments: (t) => {
      const out: (Seg | null)[] = [];
      cells.forEach((c, i) => {
        const g = easeOut(clamp01((t - i * 80) / 700));
        if (g <= 0) return;
        const y = BASE + heights[i] * g;
        const bottom = ring(c.x, c.z, BASE);
        const top = ring(c.x, c.z, y);
        for (let k = 0; k < 6; k++) {
          out.push({ a: top[k], b: top[(k + 1) % 6], kind: "edge" });
          // Solid column sides: the three corners facing the viewer in the
          // accent, the rest faint.
          out.push({ a: bottom[k], b: top[k], kind: k <= 2 ? "edge" : "fine" });
          out.push({ a: bottom[k], b: bottom[(k + 1) % 6], kind: "fine" });
        }
      });
      return keep(out);
    },
  };
}

// ---------------------------------------------------------------------------
// Cut diamond: a round brilliant. Flat octagonal table on top, crown facets
// down to a sixteen-sided girdle, pavilion facets down to the point. The
// facets draw in from the table outward, then it turns and a glint travels
// around the girdle.
// ---------------------------------------------------------------------------
function diamond(): Scene {
  const ringAt = (n: number, r: number, y: number, offset = 0): V3[] =>
    Array.from({ length: n }, (_, k) => {
      const a = ((k + offset) / n) * 2 * Math.PI;
      return [r * Math.cos(a), y, r * Math.sin(a)];
    });
  const table = ringAt(8, 0.5, 0.42);
  const star = ringAt(8, 0.74, 0.3, 0.5); // star facet points, between table corners
  const girdle = ringAt(16, 1, 0.05);
  const girdleLow = ringAt(16, 1, -0.02);
  const lowerMid = ringAt(8, 0.46, -0.5, 0.5);
  const culet: V3 = [0, -0.95, 0];

  // Every edge, tagged with when it draws in (0-1 across the build).
  const edges: { a: V3; b: V3; kind: Seg["kind"]; at: number }[] = [];
  for (let k = 0; k < 8; k++) {
    edges.push({ a: table[k], b: table[(k + 1) % 8], kind: "edge", at: 0 });
    edges.push({ a: table[k], b: star[k], kind: "fine", at: 0.15 });
    edges.push({ a: table[(k + 1) % 8], b: star[k], kind: "fine", at: 0.15 });
    edges.push({ a: table[k], b: girdle[2 * k], kind: "edge", at: 0.25 });
    edges.push({ a: star[k], b: girdle[2 * k + 1], kind: "fine", at: 0.3 });
    edges.push({ a: girdleLow[2 * k], b: culet, kind: "edge", at: 0.55 });
    edges.push({ a: girdleLow[2 * k + 1], b: lowerMid[k], kind: "fine", at: 0.6 });
    edges.push({ a: girdleLow[(2 * k + 2) % 16], b: lowerMid[k], kind: "fine", at: 0.6 });
  }
  for (let k = 0; k < 16; k++) {
    edges.push({ a: girdle[k], b: girdle[(k + 1) % 16], kind: "edge", at: 0.4 });
    edges.push({ a: girdleLow[k], b: girdleLow[(k + 1) % 16], kind: "fine", at: 0.45 });
    edges.push({ a: girdle[k], b: girdleLow[k], kind: "fine", at: 0.45 });
  }

  return {
    buildMs: 2800,
    zoom: 0.8,
    tilt: 0.42,
    centerY: 0.52,
    segments: (t) => {
      const b = t / 2400;
      const out: (Seg | null)[] = edges.map((e) => partial(e.a, e.b, (b - e.at) / 0.3, e.kind));
      // A glint travelling round the girdle after the build.
      if (t > 2800) {
        const pos = ((t - 2800) / 2600) % 1;
        const i = Math.floor(pos * 16);
        const f = pos * 16 - i;
        out.push({ a: mix(girdle[i], girdle[(i + 1) % 16], Math.max(0, f - 0.5)), b: mix(girdle[i], girdle[(i + 1) % 16], f), kind: "glint" });
      }
      return keep(out);
    },
  };
}

// ---------------------------------------------------------------------------
// Low-poly rock: an icosahedron split once into 80 faces, each point pushed
// in or out a little, so it reads as a faceted boulder. The edges draw in
// from the bottom up, then it tumbles slowly. Ridges (edges between two
// points pushed outward) are in the accent.
// ---------------------------------------------------------------------------
function rock(): Scene {
  const p = (1 + Math.sqrt(5)) / 2;
  const base: V3[] = [
    [-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0],
    [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p],
    [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1],
  ];
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const verts: V3[] = base.map((v) => scl(v, 1 / Math.hypot(...v)));
  const mid = new Map<string, number>();
  const midpoint = (i: number, j: number) => {
    const key = i < j ? `${i}-${j}` : `${j}-${i}`;
    if (!mid.has(key)) {
      const m = mix(verts[i], verts[j], 0.5);
      verts.push(scl(m, 1 / Math.hypot(...m)));
      mid.set(key, verts.length - 1);
    }
    return mid.get(key)!;
  };
  const fine: number[][] = [];
  for (const [a, b, c] of faces) {
    const [ab, bc, ca] = [midpoint(a, b), midpoint(b, c), midpoint(c, a)];
    fine.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  const rand = seeded(7);
  const bump = verts.map(() => (rand() - 0.5) * 0.36);
  const pts: V3[] = verts.map((v, i) => {
    const r = 0.78 * (1 + bump[i]);
    return [v[0] * r, v[1] * r * 0.82, v[2] * r];
  });
  const edgeSet = new Map<string, [number, number]>();
  for (const [a, b, c] of fine) {
    for (const [i, j] of [[a, b], [b, c], [c, a]]) edgeSet.set(i < j ? `${i}-${j}` : `${j}-${i}`, [i, j]);
  }
  const edges = [...edgeSet.values()].map(([i, j]) => ({
    a: pts[i],
    b: pts[j],
    kind: (bump[i] > -0.02 && bump[j] > -0.02 ? "edge" : "fine") as Seg["kind"],
    // Draw in from the bottom up.
    at: (Math.min(pts[i][1], pts[j][1]) + 0.8) / 1.6,
  }));

  return {
    buildMs: 2600,
    zoom: 0.95,
    tilt: 0.25,
    spinSpeed: 0.00018,
    tumble: (t) => 0.25 * Math.sin(t * 0.00035),
    segments: (t) => keep(edges.map((e) => partial(e.a, e.b, (t / 2200 - e.at * 0.7) / 0.3, e.kind))),
  };
}

// ---------------------------------------------------------------------------
// Geode: a cracked-open stone, seen face on. A jagged outer shell and inner
// rim with depth behind them, and crystal points growing inward from the
// rim towards the hollow centre, one after another around the ring. It sways
// gently rather than spinning, so it stays face on.
// ---------------------------------------------------------------------------
function geode(): Scene {
  const rand = seeded(23);
  const N = 30;
  const rim = (r0: number, jag: number, z: number): V3[] =>
    Array.from({ length: N }, (_, k) => {
      const a = (k / N) * 2 * Math.PI;
      const r = r0 * (1 + (rand() - 0.5) * jag);
      return [r * Math.cos(a), r * Math.sin(a) * 0.9, z];
    });
  const outer = rim(1, 0.12, 0);
  const inner = rim(0.74, 0.1, 0.02);
  const back = rim(0.62, 0.08, -0.4);
  // Crystal points: from pairs of inner-rim points, reaching inward.
  const crystals = Array.from({ length: N }, (_, k) => {
    const a = inner[k], b = inner[(k + 1) % N];
    const baseMid = mix(a, b, 0.5);
    const len = 0.22 + rand() * 0.28;
    const toCenter = scl(baseMid, -1 / Math.hypot(baseMid[0], baseMid[1]));
    const tip = add(add(baseMid, scl(toCenter, len)), [0, 0, 0.05 + rand() * 0.1]);
    const back3 = add(baseMid, [0, 0, -0.12]);
    return { a, b, back3, tip, delay: ((k * 7) % N) / N };
  });

  return {
    buildMs: 3000,
    zoom: 0.85,
    tilt: 0,
    spin: (t) => 0.22 * Math.sin(t * 0.0004),
    segments: (t) => {
      const shell = clamp01(t / 900);
      const out: (Seg | null)[] = [];
      for (let k = 0; k < N; k++) {
        const n = (k + 1) % N;
        out.push(partial(outer[k], outer[n], shell * 1.2 - (k / N) * 0.2, "fine"));
        out.push(partial(inner[k], inner[n], shell * 1.2 - (k / N) * 0.2, "fine"));
        out.push(partial(back[k], back[n], shell - 0.3, "fine"));
        if (k % 3 === 0) out.push(partial(inner[k], back[k], shell - 0.4, "fine"));
        if (k % 2 === 0) out.push(partial(outer[k], inner[k], shell - 0.2, "fine"));
      }
      for (const c of crystals) {
        const g = easeOut(clamp01((t - 700 - c.delay * 1800) / 600));
        if (g <= 0) continue;
        const tip = mix(mix(c.a, c.b, 0.5), c.tip, g);
        out.push({ a: c.a, b: tip, kind: "edge" }, { a: c.b, b: tip, kind: "edge" }, { a: c.back3, b: tip, kind: "fine" });
      }
      return keep(out);
    },
  };
}

// Built once; scenes are pure functions of time after that.
export const SCENES = {
  basalt: basalt(),
  diamond: diamond(),
  rock: rock(),
  geode: geode(),
};
