// Gradient-boosted decision trees, from scratch (no ML library: the site has
// no Python, and every line here can be explained).
//
// The idea in three sentences. A decision tree is a short chain of "is
// feature X above Y?" questions that ends in a prediction. Boosting builds
// a few hundred small trees one after another, each fitted to the mistakes
// the trees before it still make, and adds up their (shrunken) answers. The
// result can pick up interactions a straight-line model can't, like
// "momentum helps, but only when the VIX is low".
//
// Loss is squared error. Speed comes from binning: each feature's values are
// sorted into at most 32 buckets once, so finding a split means scanning
// bucket totals instead of every row.
//
// Missing values (NaN) get bucket 0, and every split learns which side they
// should go to.

export type Node = { f: number; t: number; nanLeft: boolean; l: number; r: number } | { v: number };
export type Model = { base: number; rate: number; trees: Node[][]; gain: number[] };

export type Params = {
  trees: number;
  rate: number; // learning rate: how much of each tree's answer is kept
  depth: number; // questions per tree
  minLeaf: number; // smallest group of rows a leaf may describe
  lambda: number; // shrinks leaves built on few rows towards zero
  subsample: number; // share of rows each tree sees (randomness fights overfitting)
  colsample: number; // share of features each tree may use
  seed: number;
};
export const DEFAULT_PARAMS: Params = {
  trees: 300,
  rate: 0.03,
  depth: 3,
  minLeaf: 400,
  lambda: 50,
  subsample: 0.7,
  colsample: 0.7,
  seed: 1,
};

const BINS = 32;

// A small seeded random number generator, so training is repeatable.
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// Bucket boundaries for one feature: quantiles of its non-missing values.
function cutPoints(values: Float64Array): number[] {
  const v = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
  const cuts: number[] = [];
  for (let k = 1; k < BINS; k++) {
    const c = v[Math.floor((k * v.length) / BINS)];
    if (c !== undefined && c !== cuts[cuts.length - 1] && c !== v[v.length - 1]) cuts.push(c);
  }
  return cuts;
}

// Bucket of a value: 0 if missing, else 1 + the number of cut points below it.
function bucket(x: number, cuts: number[]): number {
  if (!Number.isFinite(x)) return 0;
  let lo = 0;
  let hi = cuts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (x > cuts[mid]) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}

// `X[f]` is feature f's column; `y` the targets.
export function train(X: Float64Array[], y: Float64Array, p: Params = DEFAULT_PARAMS): Model {
  const nRows = y.length;
  const nFeat = X.length;
  const random = rng(p.seed);
  const cuts = X.map(cutPoints);
  const bins = X.map((col, f) => Uint8Array.from(col, (x) => bucket(x, cuts[f])));

  const base = y.reduce((s, v) => s + v, 0) / nRows;
  const pred = new Float64Array(nRows).fill(base);
  const grad = new Float64Array(nRows);
  const gain = new Array(nFeat).fill(0);
  const trees: Node[][] = [];
  const sumG = new Float64Array(BINS + 1);
  const count = new Float64Array(BINS + 1);

  for (let t = 0; t < p.trees; t++) {
    // What's left to explain: prediction minus truth, for every row.
    for (let i = 0; i < nRows; i++) grad[i] = pred[i] - y[i];
    const rows: number[] = [];
    for (let i = 0; i < nRows; i++) if (random() < p.subsample) rows.push(i);
    const feats: number[] = [];
    for (let f = 0; f < nFeat; f++) if (random() < p.colsample) feats.push(f);

    const nodes: Node[] = [];
    // Split nodes also keep the bucket they split at, for updating `pred`.
    const splitBin: number[] = [];
    const grow = (idx: number[], depth: number): number => {
      const id = nodes.length;
      nodes.push({ v: 0 });
      splitBin.push(-1);
      let G = 0;
      for (const i of idx) G += grad[i];
      const leaf = () => {
        // The value that best fixes these rows' errors, shrunk by lambda.
        nodes[id] = { v: (-G / (idx.length + p.lambda)) * p.rate };
        return id;
      };
      if (depth >= p.depth || idx.length < 2 * p.minLeaf) return leaf();

      const parentScore = (G * G) / (idx.length + p.lambda);
      let best = { gain: 0, f: -1, bin: 0, nanLeft: false };
      for (const f of feats) {
        sumG.fill(0);
        count.fill(0);
        const col = bins[f];
        for (const i of idx) {
          sumG[col[i]] += grad[i];
          count[col[i]]++;
        }
        // Try "bucket ≤ b goes left", with the missing rows on either side.
        for (const nanLeft of [false, true]) {
          let gl = nanLeft ? sumG[0] : 0;
          let nl = nanLeft ? count[0] : 0;
          for (let b = 1; b < cuts[f].length + 1; b++) {
            gl += sumG[b];
            nl += count[b];
            const nr = idx.length - nl;
            if (nl < p.minLeaf || nr < p.minLeaf) continue;
            const gr = G - gl;
            const score = (gl * gl) / (nl + p.lambda) + (gr * gr) / (nr + p.lambda) - parentScore;
            if (score > best.gain) best = { gain: score, f, bin: b, nanLeft };
          }
          if (count[0] === 0) break; // no missing values: one pass is enough
        }
      }
      if (best.f < 0) return leaf();

      gain[best.f] += best.gain;
      const col = bins[best.f];
      const goesLeft = (i: number) => (col[i] === 0 ? best.nanLeft : col[i] <= best.bin);
      const left = idx.filter(goesLeft);
      const right = idx.filter((i) => !goesLeft(i));
      splitBin[id] = best.bin;
      const l = grow(left, depth + 1);
      const r = grow(right, depth + 1);
      // Stored as a real threshold so predicting needs no buckets.
      nodes[id] = { f: best.f, t: cuts[best.f][best.bin - 1], nanLeft: best.nanLeft, l, r };
      return id;
    };
    grow(rows, 0);
    trees.push(nodes);

    // Every row (not just this tree's sample) gets the new tree's answer.
    for (let i = 0; i < nRows; i++) {
      let k = 0;
      for (;;) {
        const node = nodes[k];
        if ("v" in node) {
          pred[i] += node.v;
          break;
        }
        const b = bins[node.f][i];
        k = (b === 0 ? node.nanLeft : b <= splitBin[k]) ? node.l : node.r;
      }
    }
  }
  return { base, rate: p.rate, trees, gain };
}

// One row's prediction: the starting average plus every tree's answer.
export function predict(model: Model, x: ArrayLike<number>): number {
  let out = model.base;
  for (const nodes of model.trees) {
    let k = 0;
    for (;;) {
      const node = nodes[k];
      if ("v" in node) {
        out += node.v;
        break;
      }
      const v = x[node.f];
      k = (Number.isFinite(v) ? v <= node.t : node.nanLeft) ? node.l : node.r;
    }
  }
  return out;
}
