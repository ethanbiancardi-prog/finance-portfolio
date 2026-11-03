// Trains one chart-reading network (lib/ml/cnn.ts) on its own CPU thread,
// for train-cnn.ts. The charts, returns and labels arrive as shared memory,
// so ten of these can run at once without ten copies of ~230 MB of charts.
//
// Early stopping: after each pass over the training charts (an "epoch"),
// the network scores a validation slice (the latest 15% of its training
// weeks, which it doesn't train on) and keeps the weights from its best
// epoch. Training stops once two epochs in a row fail to beat it. Past
// that point a network usually starts memorising its training charts.

import { parentPort, workerData } from "node:worker_threads";
import { createNetwork, INPUT_SIZE, type CnnWeights } from "../../src/lib/ml/cnn";
import { percentileRanks } from "../../src/lib/ml/features";

export type CnnJob = {
  windows: SharedArrayBuffer; // Float32, INPUT_SIZE per row
  fwd: SharedArrayBuffer; // Float32, next-month return vs SPY per row
  day: SharedArrayBuffer; // Int32, trading-day index per row
  label: SharedArrayBuffer; // Uint8, 1 = beat that day's median stock
  train: Int32Array;
  val: Int32Array;
  test: Int32Array;
  seed: number;
  maxEpochs: number;
  patience: number;
  batch: number;
};
export type CnnResult = {
  testScores: Float32Array;
  weights: CnnWeights;
  bestEpoch: number;
  log: { epoch: number; loss: number; valIc: number }[];
};

const job = workerData as CnnJob;
const windows = new Float32Array(job.windows);
const fwd = new Float32Array(job.fwd);
const day = new Int32Array(job.day);
const label = new Uint8Array(job.label);
const net = createNetwork(job.seed);

let s = job.seed * 7919;
const random = () => {
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  return (s >>> 0) / 4294967296;
};

// Mean daily rank correlation between scores and next-month returns (the IC).
const valDays = new Map<number, number[]>();
for (const k of job.val) valDays.set(day[k], [...(valDays.get(day[k]) ?? []), k]);
function valIc(): number {
  let sum = 0;
  let n = 0;
  for (const ks of valDays.values()) {
    if (ks.length < 10) continue;
    const a = percentileRanks(ks.map((k) => net.forward(windows, k * INPUT_SIZE)));
    const b = percentileRanks(ks.map((k) => fwd[k]));
    const ma = a.reduce((x, v) => x + v, 0) / a.length;
    const mb = b.reduce((x, v) => x + v, 0) / b.length;
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    for (let i = 0; i < a.length; i++) {
      sab += (a[i] - ma) * (b[i] - mb);
      saa += (a[i] - ma) ** 2;
      sbb += (b[i] - mb) ** 2;
    }
    if (saa && sbb) {
      sum += sab / Math.sqrt(saa * sbb);
      n++;
    }
  }
  return n ? sum / n : NaN;
}

const order = Array.from(job.train);
const log: CnnResult["log"] = [];
let best = { ic: -Infinity, epoch: 0, weights: net.getWeights() };
for (let epoch = 1; epoch <= job.maxEpochs; epoch++) {
  // Shuffle, so batches mix stocks and years.
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let loss = 0;
  let batches = 0;
  for (let b = 0; b < order.length; b += job.batch) {
    const ks = order.slice(b, b + job.batch);
    loss += net.trainBatch(
      windows,
      ks.map((k) => k * INPUT_SIZE),
      ks.map((k) => label[k]),
    );
    batches++;
  }
  const ic = valIc();
  log.push({ epoch, loss: loss / batches, valIc: ic });
  if (ic > best.ic) best = { ic, epoch, weights: net.getWeights() };
  else if (epoch - best.epoch >= job.patience) break;
}

net.setWeights(best.weights);
const testScores = Float32Array.from(job.test, (k) => net.forward(windows, k * INPUT_SIZE));
parentPort!.postMessage({ testScores, weights: best.weights, bestEpoch: best.epoch, log } satisfies CnnResult);
