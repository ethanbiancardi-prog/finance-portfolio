// A small neural network that reads charts: a 1-D convolutional network
// ("CNN"), written from scratch like lib/ml/gbm.ts.
//
// Where the tree model is handed named patterns (lib/ml/patterns.ts), this
// gets the raw chart (the last 60 days of high, low, close and volume) and
// has to find useful shapes by itself. The idea follows Jiang, Kelly & Xiu,
// "(Re-)Imag(in)ing Price Trends" (Journal of Finance, 2023), which trained
// image networks on pictures of stock charts; this reads the same numbers
// directly instead of drawing them first, at a much smaller scale.
//
// How it reads a chart:
//   1. Convolution layers slide small "filters" along the 60 days. A filter
//      is 5 (or 3) days of weights; where the chart's shape matches it, the
//      output is large. Training decides what the filters look for: a sharp
//      drop, a volume spike on an up day, a tightening range.
//   2. After each, ReLU keeps only the positive matches and max-pooling
//      keeps the strongest match in each pair of days, halving the length.
//      Stacked, later filters see combinations of earlier ones spread over
//      more days, i.e. bigger shapes.
//   3. Two ordinary ("dense") layers turn the matches into one number: how
//      likely this stock is to beat the median stock next month.
//
// Shapes:  4×60 → conv 8×60 → pool 8×30 → conv 16×30 → pool 16×15
//          → conv 16×15 → pool 16×5 → dense 16 → 1.   ~5,500 weights.
// Kept this small on purpose: with ~200k charts to learn from, a bigger
// network would memorise them instead of learning anything general.

import type { Bars } from "./data";

export const WINDOW = 60; // trading days of chart per input
export const CHANNELS = 4; // high, low, close, volume
export const INPUT_SIZE = CHANNELS * WINDOW;

// Writes one stock's chart ending on bar `i` into `out` at `offset`, laid
// out channel by channel. Prices are rescaled so the window's lowest low is
// 0 and its highest high is 1, and volume so the busiest day is 1: like a
// chart drawn to fit its frame. The shape survives; the size of the move
// doesn't (the tree model has that). Returns false without enough history.
export function chartWindow(b: Bars, i: number, out: Float32Array, offset = 0): boolean {
  const start = i - WINDOW + 1;
  if (start < 0) return false;
  let lo = Infinity;
  let hi = -Infinity;
  let vMax = 0;
  for (let k = start; k <= i; k++) {
    lo = Math.min(lo, b.l[k]);
    hi = Math.max(hi, b.h[k]);
    vMax = Math.max(vMax, b.v[k]);
  }
  const range = hi - lo || 1;
  for (let k = 0; k < WINDOW; k++) {
    const j = start + k;
    out[offset + k] = (b.h[j] - lo) / range;
    out[offset + WINDOW + k] = (b.l[j] - lo) / range;
    out[offset + 2 * WINDOW + k] = (b.c[j] - lo) / range;
    out[offset + 3 * WINDOW + k] = vMax ? b.v[j] / vMax : 0;
  }
  return true;
}

// --- layers ---------------------------------------------------------------
//
// Each layer works on one chart at a time: forward() computes its output,
// backward() takes "how much the loss changes per unit of my output" and
// works out the same for its input (passed back down) and its weights
// (added to `grad`, summed over a batch). That chain is backpropagation.

type Layer = {
  params: Float64Array;
  grad: Float64Array;
  out: Float64Array;
  forward(input: Float64Array): Float64Array;
  backward(gradOut: Float64Array): Float64Array;
};

// Weights start as small random numbers ("He" initialisation: spread
// √(2 / inputs), which keeps signals from fading or exploding with depth).
function initWeights(n: number, fanIn: number, random: () => number): Float64Array {
  const w = new Float64Array(n);
  const scale = Math.sqrt(2 / fanIn);
  for (let k = 0; k < n; k++) {
    // Box-Muller: two uniform random numbers -> one bell-curve one.
    w[k] = Math.sqrt(-2 * Math.log(random() + 1e-12)) * Math.cos(2 * Math.PI * random()) * scale;
  }
  return w;
}

// Convolution with "same" padding (output as long as input), then ReLU.
function conv(cin: number, cout: number, kernel: number, len: number, random: () => number): Layer {
  const nW = cout * cin * kernel;
  const params = new Float64Array(nW + cout);
  params.set(initWeights(nW, cin * kernel, random));
  const grad = new Float64Array(params.length);
  const out = new Float64Array(cout * len);
  const gradIn = new Float64Array(cin * len);
  const pad = (kernel - 1) >> 1;
  let input: Float64Array<ArrayBufferLike> = new Float64Array(0);
  return {
    params,
    grad,
    out,
    forward(x) {
      input = x;
      for (let o = 0; o < cout; o++) {
        for (let t = 0; t < len; t++) {
          let s = params[nW + o];
          for (let c = 0; c < cin; c++) {
            const wBase = (o * cin + c) * kernel;
            const xBase = c * len + t - pad;
            for (let k = 0; k < kernel; k++) {
              const tt = t - pad + k;
              if (tt >= 0 && tt < len) s += params[wBase + k] * x[xBase + k];
            }
          }
          out[o * len + t] = s > 0 ? s : 0; // ReLU
        }
      }
      return out;
    },
    backward(g) {
      gradIn.fill(0);
      for (let o = 0; o < cout; o++) {
        for (let t = 0; t < len; t++) {
          if (out[o * len + t] <= 0) continue; // ReLU passed nothing back here
          const go = g[o * len + t];
          grad[nW + o] += go;
          for (let c = 0; c < cin; c++) {
            const wBase = (o * cin + c) * kernel;
            const xBase = c * len + t - pad;
            for (let k = 0; k < kernel; k++) {
              const tt = t - pad + k;
              if (tt < 0 || tt >= len) continue;
              grad[wBase + k] += go * input[xBase + k];
              gradIn[xBase + k] += go * params[wBase + k];
            }
          }
        }
      }
      return gradIn;
    },
  };
}

// Max-pooling: keep the strongest value in each group of `size` days.
function pool(channels: number, len: number, size: number): Layer {
  const outLen = Math.floor(len / size);
  const out = new Float64Array(channels * outLen);
  const from = new Int32Array(out.length); // which input won, for backward
  const gradIn = new Float64Array(channels * len);
  return {
    params: new Float64Array(0),
    grad: new Float64Array(0),
    out,
    forward(x) {
      for (let c = 0; c < channels; c++) {
        for (let j = 0; j < outLen; j++) {
          const base = c * len + j * size;
          let best = base;
          for (let k = 1; k < size; k++) if (x[base + k] > x[best]) best = base + k;
          out[c * outLen + j] = x[best];
          from[c * outLen + j] = best;
        }
      }
      return out;
    },
    backward(g) {
      gradIn.fill(0);
      for (let j = 0; j < out.length; j++) gradIn[from[j]] += g[j];
      return gradIn;
    },
  };
}

// Fully connected layer, with ReLU unless it's the last one.
function dense(nIn: number, nOut: number, relu: boolean, random: () => number): Layer {
  const nW = nIn * nOut;
  const params = new Float64Array(nW + nOut);
  params.set(initWeights(nW, nIn, random));
  const grad = new Float64Array(params.length);
  const out = new Float64Array(nOut);
  const gradIn = new Float64Array(nIn);
  let input: Float64Array<ArrayBufferLike> = new Float64Array(0);
  return {
    params,
    grad,
    out,
    forward(x) {
      input = x;
      for (let o = 0; o < nOut; o++) {
        let s = params[nW + o];
        for (let i = 0; i < nIn; i++) s += params[o * nIn + i] * x[i];
        out[o] = relu && s < 0 ? 0 : s;
      }
      return out;
    },
    backward(g) {
      gradIn.fill(0);
      for (let o = 0; o < nOut; o++) {
        if (relu && out[o] <= 0) continue;
        grad[nW + o] += g[o];
        for (let i = 0; i < nIn; i++) {
          grad[o * nIn + i] += g[o] * input[i];
          gradIn[i] += g[o] * params[o * nIn + i];
        }
      }
      return gradIn;
    },
  };
}

// --- the network ----------------------------------------------------------

export type CnnWeights = number[][]; // one array per layer, for model.json

export function createNetwork(seed = 1) {
  let s = seed >>> 0 || 1;
  const random = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const layers: Layer[] = [
    conv(CHANNELS, 8, 5, WINDOW, random),
    pool(8, WINDOW, 2),
    conv(8, 16, 5, WINDOW / 2, random),
    pool(16, WINDOW / 2, 2),
    conv(16, 16, 3, WINDOW / 4, random),
    pool(16, WINDOW / 4, 3),
    dense(16 * 5, 16, true, random),
    dense(16, 1, false, random),
  ];
  const view = new Float64Array(INPUT_SIZE);

  // The network's raw output (a "logit"): above 0 = more likely than not to
  // beat the median stock. Used as the score; only the order matters.
  const forward = (x: Float32Array, offset = 0): number => {
    view.set(x.subarray(offset, offset + INPUT_SIZE));
    let h: Float64Array = view;
    for (const layer of layers) h = layer.forward(h);
    return h[0];
  };

  // Adam: each weight gets its own step size from running averages of its
  // gradient (m) and squared gradient (v), so rarely-used weights still move.
  // Weight decay pulls every weight slightly towards 0 each step, another
  // guard against memorising.
  const adam = layers.map((l) => ({ m: new Float64Array(l.params.length), v: new Float64Array(l.params.length) }));
  let step = 0;

  // Forward and backward for each chart in a batch, leaving each layer's
  // `grad` holding the average gradient. Loss is cross-entropy on "beat the
  // median?" (y = 1 or 0). Returns the batch's average loss.
  const backprop = (x: Float32Array, offsets: number[], y: number[]): number => {
    for (const l of layers) l.grad.fill(0);
    let loss = 0;
    const g = new Float64Array(1);
    for (let k = 0; k < offsets.length; k++) {
      const z = forward(x, offsets[k]);
      const p = 1 / (1 + Math.exp(-z));
      loss += -(y[k] * Math.log(p + 1e-7) + (1 - y[k]) * Math.log(1 - p + 1e-7));
      g[0] = (p - y[k]) / offsets.length; // d(loss)/d(logit) for cross-entropy
      let grad: Float64Array = g;
      for (let j = layers.length - 1; j >= 0; j--) grad = layers[j].backward(grad);
    }
    return loss / offsets.length;
  };

  // One batch: backprop, then one Adam update.
  const trainBatch = (x: Float32Array, offsets: number[], y: number[], lr = 1e-3, decay = 1e-4): number => {
    const loss = backprop(x, offsets, y);
    step++;
    const [b1, b2] = [0.9, 0.999];
    layers.forEach((l, j) => {
      const { m, v } = adam[j];
      for (let k = 0; k < l.params.length; k++) {
        const gk = l.grad[k];
        m[k] = b1 * m[k] + (1 - b1) * gk;
        v[k] = b2 * v[k] + (1 - b2) * gk * gk;
        const mHat = m[k] / (1 - b1 ** step);
        const vHat = v[k] / (1 - b2 ** step);
        l.params[k] -= lr * (mHat / (Math.sqrt(vHat) + 1e-8) + decay * l.params[k]);
      }
    });
    return loss;
  };

  const getWeights = (): CnnWeights => layers.map((l) => Array.from(l.params));
  const setWeights = (w: CnnWeights) => layers.forEach((l, j) => l.params.set(w[j]));
  // The batch's gradient for every weight (scripts/ml/check-cnn.ts).
  const gradients = (x: Float32Array, offsets: number[], y: number[]): CnnWeights => {
    backprop(x, offsets, y);
    return layers.map((l) => Array.from(l.grad));
  };
  return { forward, trainBatch, getWeights, setWeights, gradients };
}
