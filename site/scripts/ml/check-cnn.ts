// Gradient check for lib/ml/cnn.ts. Backpropagation claims "nudging this
// weight up by a little changes the loss by this much"; this nudges a
// sample of weights each way, measures the change for real, and compares.
// If the backprop maths had a bug, training would quietly learn garbage.
//
// Usage, from site/:  npx tsx scripts/ml/check-cnn.ts

import { createNetwork, INPUT_SIZE } from "../../src/lib/ml/cnn";

const net = createNetwork(7);
// Two made-up charts, one labelled "beat the median", one not.
const x = Float32Array.from({ length: INPUT_SIZE * 2 }, (_, k) => (Math.sin(k * 1.7) + 1) / 2);
const offsets = [0, INPUT_SIZE];
const y = [1, 0];
const loss = () =>
  offsets.reduce((s, o, k) => {
    const p = 1 / (1 + Math.exp(-net.forward(x, o)));
    return s - (y[k] * Math.log(p) + (1 - y[k]) * Math.log(1 - p));
  }, 0) / offsets.length;

const weights = net.getWeights();
const analytic = net.gradients(x, offsets, y);
// The nudge has to be tiny: a bigger one (1e-3) can push a ReLU or a
// max-pool across its switch point, and then the measured slope is wrong.
const eps = 1e-5;
let worst = 0;
let checked = 0;
for (let layer = 0; layer < weights.length; layer++) {
  const step = Math.max(1, Math.floor(weights[layer].length / 20));
  for (let k = 0; k < weights[layer].length; k += step) {
    const nudged = (by: number) => {
      const w = weights.map((a) => a.slice());
      w[layer][k] += by;
      net.setWeights(w);
      return loss();
    };
    const numeric = (nudged(eps) - nudged(-eps)) / (2 * eps);
    net.setWeights(weights);
    const a = analytic[layer][k];
    // Relative error, ignoring weights whose gradient is essentially zero.
    const err = Math.abs(numeric - a) / Math.max(1e-3, Math.abs(numeric) + Math.abs(a));
    worst = Math.max(worst, err);
    if (process.env.DEBUG && err > 2e-2) console.log(`layer ${layer} weight ${k}: backprop ${a.toExponential(3)} vs measured ${numeric.toExponential(3)}`);
    checked++;
  }
}
console.log(`${checked} weights checked, worst relative error ${worst.toExponential(1)}: ${worst < 2e-2 ? "PASS" : "FAIL"}`);
