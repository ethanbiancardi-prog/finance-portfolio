// Trains and tests the chart-reading network (lib/ml/cnn.ts) on the S&P 500
// data, next to the boosted trees (no macro) and a 50/50 blend of the two,
// on the same walk-forward and 5-fold tests as train.ts (evaluate.ts).
//
// Each fold trains NETS networks from different random starting weights
// and averages them: one small network's picks depend a lot on its random
// start, and averaging irons that out. Networks train on worker threads
// (cnn-worker.ts), up to one per spare CPU core.
//
// Writes src/lib/ml/cnn-model.json (the final networks, trained on
// everything) and projects/paper-trading/ML_REPORT_CNN.md.
//
// Usage, from site/:  npx tsx scripts/ml/train-cnn.ts      (~30 minutes)
//   --quick  smoke test: core stocks, 1 network, 1 epoch, writes nothing

import { writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { chartWindow, CHANNELS, INPUT_SIZE, WINDOW, type CnnWeights } from "../../src/lib/ml/cnn";
import { FEATURES, groupBy, HORIZON, type PanelRow } from "../../src/lib/ml/features";
import { predict } from "../../src/lib/ml/gbm";
import type { CnnJob, CnnResult } from "./cnn-worker";
import {
  CORE,
  DISCLAIMER,
  FIRST_TEST_YEAR,
  kFoldFolds,
  loadPanel,
  mean,
  pct,
  runTest,
  testSection,
  walkForwardFolds,
  yardsticks,
  type Fold,
} from "./evaluate";
import { fitTrees } from "./train";

const QUICK = process.argv.includes("--quick");
const NETS = QUICK ? 1 : 3;
const MAX_EPOCHS = QUICK ? 1 : 8;
const PATIENCE = 2;
const BATCH = 128;
const VAL_SHARE = 0.15;
const THREADS = Math.max(1, cpus().length - 2);
const NO_MACRO = new Set(FEATURES.flatMap((f, k) => (f.group === "Macro" ? [k] : [])));

// At most THREADS networks training at once; the rest wait their turn.
let running = 0;
const queue: (() => void)[] = [];
async function inPool<T>(work: () => Promise<T>): Promise<T> {
  if (running >= THREADS) await new Promise<void>((go) => queue.push(go));
  running++;
  try {
    return await work();
  } finally {
    running--;
    queue.shift()?.();
  }
}
const runWorker = (job: CnnJob) =>
  inPool(
    () =>
      new Promise<CnnResult>((resolve, reject) => {
        const w = new Worker(join(__dirname, "cnn-worker.ts"), { workerData: job, execArgv: ["--require", "tsx/cjs"] });
        w.once("message", resolve);
        w.once("error", reject);
      }),
  );

async function main() {
  const p = loadPanel(QUICK ? "core" : "sp500");
  const n = p.labelled.length;

  // Every row's chart, plus its return, day and "beat the median" label,
  // in shared memory for the workers.
  console.log("Drawing charts…");
  const windows = new Float32Array(new SharedArrayBuffer(n * INPUT_SIZE * 4));
  const fwd = new Float32Array(new SharedArrayBuffer(n * 4));
  const day = new Int32Array(new SharedArrayBuffer(n * 4));
  const label = new Uint8Array(new SharedArrayBuffer(n));
  const index = new Map<PanelRow, number>();
  const barIndex = new Map([...p.bars].map(([s, b]) => [s, new Map(b.t.map((t, i) => [t, i]))]));
  p.labelled.forEach((r, k) => {
    index.set(r, k);
    chartWindow(p.bars.get(r.symbol)!, barIndex.get(r.symbol)!.get(r.date)!, windows, k * INPUT_SIZE);
    fwd[k] = r.fwd;
    day[k] = r.day;
  });
  for (const rows of p.byDay.values()) {
    const sorted = rows.map((r) => r.fwd).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    for (const r of rows) label[index.get(r)!] = r.fwd > median ? 1 : 0;
  }

  // Trains NETS networks on `rows` (the latest 15% of their weeks held out
  // for early stopping, with a 20-day gap) and averages their scores on
  // `testRows`.
  const trainNets = async (rows: PanelRow[], testRows: PanelRow[]) => {
    const days = [...new Set(rows.map((r) => r.day))].sort((a, b) => a - b);
    const valStart = days[Math.floor(days.length * (1 - VAL_SHARE))];
    const train = rows.filter((r) => r.day + HORIZON < valStart).map((r) => index.get(r)!);
    const val = rows.filter((r) => r.day >= valStart).map((r) => index.get(r)!);
    const test = testRows.map((r) => index.get(r)!);
    const results = await Promise.all(
      Array.from({ length: NETS }, (_, seed) =>
        runWorker({
          windows: windows.buffer as SharedArrayBuffer,
          fwd: fwd.buffer as SharedArrayBuffer,
          day: day.buffer as SharedArrayBuffer,
          label: label.buffer as SharedArrayBuffer,
          train: Int32Array.from(train),
          val: Int32Array.from(val),
          test: Int32Array.from(test),
          seed: seed + 1,
          maxEpochs: MAX_EPOCHS,
          patience: PATIENCE,
          batch: BATCH,
        }),
      ),
    );
    const scores = new Map(testRows.map((r, k) => [r, mean(results.map((res) => res.testScores[k]))]));
    return { scores, results };
  };

  const epochs: number[] = [];
  const models = {
    // Listed first so each fold's networks start before its trees train
    // on this thread.
    "Chart network": async (rows: PanelRow[], fold: Fold) => {
      const { scores, results } = await trainNets(rows, fold.test.flatMap((d) => p.byDay.get(d)!));
      epochs.push(...results.map((r) => r.bestEpoch));
      return (r: PanelRow) => scores.get(r) ?? NaN;
    },
    "Trees (no macro)": async (rows: PanelRow[]) => {
      const m = fitTrees(rows, NO_MACRO);
      return (r: PanelRow) => predict(m, r.x);
    },
  };
  const fixed = yardsticks(p);
  const blends = { "Trees + chart network": ["Trees (no macro)", "Chart network"] };
  console.log(`Training on ${THREADS} threads…`);
  const [walk, kfold, final] = await Promise.all([
    runTest(p, "walk-forward", walkForwardFolds(p), models, fixed, blends),
    runTest(p, "fold", kFoldFolds(p), models, fixed, blends),
    trainNets(p.labelled, []),
  ]);

  if (QUICK) {
    console.log(`Quick run OK. Walk-forward IC: ${walk.ic["Chart network"].ic.toFixed(3)}, 5-fold IC: ${kfold.ic["Chart network"].ic.toFixed(3)}`);
    return;
  }
  writeFileSync(
    "src/lib/ml/cnn-model.json",
    JSON.stringify({
      trainedAt: new Date().toISOString().slice(0, 10),
      trainedThrough: p.lastDate,
      universe: "sp500",
      rows: n,
      window: WINDOW,
      channels: ["high", "low", "close", "volume"],
      horizon: HORIZON,
      test: { walkForwardIc: walk.ic["Chart network"].ic, kfoldIc: kfold.ic["Chart network"].ic, from: `${FIRST_TEST_YEAR}-01-01` },
      nets: final.results.map((r) => ({ bestEpoch: r.bestEpoch, log: r.log, weights: r.weights })) as {
        bestEpoch: number;
        log: CnnResult["log"];
        weights: CnnWeights;
      }[],
    }),
  );

  // What the network learned to like: the average chart of the core stocks
  // it scored highest (top 10%) vs lowest (bottom 10%) each week in the
  // walk-forward test, on the 0–1 scale it sees.
  const top: number[][] = [];
  const bottom: number[][] = [];
  for (const rows of p.byDay.values()) {
    const scored = rows.filter((r) => CORE.has(r.symbol) && walk.scores["Chart network"].has(r));
    if (scored.length < 20) continue;
    scored.sort((a, b) => walk.scores["Chart network"].get(b)! - walk.scores["Chart network"].get(a)!);
    const cut = Math.max(1, Math.floor(scored.length / 10));
    const chart = (r: PanelRow) => Array.from(windows.subarray(index.get(r)! * INPUT_SIZE, (index.get(r)! + 1) * INPUT_SIZE));
    top.push(...scored.slice(0, cut).map(chart));
    bottom.push(...scored.slice(-cut).map(chart));
  }
  const avgChart = (charts: number[][]) => Array.from({ length: CHANNELS * WINDOW }, (_, k) => mean(charts.map((c) => c[k])));
  const [topAvg, bottomAvg] = [avgChart(top), avgChart(bottom)];
  const at = [0, 15, 30, 45, 55, 59];
  const closeRow = (a: number[]) => at.map((t) => a[2 * WINDOW + t].toFixed(2)).join(" | ");
  const volRecent = (a: number[]) => mean(a.slice(3 * WINDOW + 55, 4 * WINDOW)).toFixed(2);
  const rangeRecent = (a: number[]) => mean(at.slice(-3).map((t) => a[t] - a[WINDOW + t])).toFixed(3);

  const perFold = ["Chart network", "Trees (no macro)", "Trees + chart network", "Signal Trader price rules"];
  const epochCounts = groupBy(epochs, (e) => e);
  const lines = [
    "# Chart-reading neural network: test results",
    "",
    `Generated ${new Date().toISOString().slice(0, 10)} by \`site/scripts/ml/train-cnn.ts\`. Trained on ${p.symbols.length} S&P 500 ` +
      `stocks (${n.toLocaleString()} weekly charts, ${p.firstDate} to ${p.lastDate}). Each chart: the last ${WINDOW} days of ` +
      `high, low, close and volume, scaled to fit 0–1. Predicts whether the stock beats the median stock over the next ` +
      `${HORIZON} trading days. ${NETS} networks per test period, averaged.`,
    "",
    DISCLAIMER,
    "",
    ...testSection(`Walk-forward test (${FIRST_TEST_YEAR} onwards, every prediction made blind)`, walk, "Test year", perFold),
    ...testSection("Purged 5-fold cross-validation (train on 4 blocks of time, test on the 5th)", kfold, "Test block", perFold),
    "## What the network learned to favour",
    "",
    "Average chart of the core stocks it ranked in its top 10% vs bottom 10% each week (walk-forward test), " +
      "on its 0–1 scale: 0 = the window's lowest low, 1 = its highest high.",
    "",
    "| Close, days ago → | 59 | 44 | 29 | 14 | 4 | today | Volume, last 5 days | Daily range, recent |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    `| Top 10% | ${closeRow(topAvg)} | ${volRecent(topAvg)} | ${rangeRecent(topAvg)} |`,
    `| Bottom 10% | ${closeRow(bottomAvg)} | ${volRecent(bottomAvg)} | ${rangeRecent(bottomAvg)} |`,
    "",
    `Best epoch per network (training stopped early once validation stopped improving): ` +
      [...epochCounts].sort((a, b) => a[0] - b[0]).map(([e, c]) => `${e}: ${c.length}`).join(", ") + ".",
    "",
  ];
  writeFileSync("../projects/paper-trading/ML_REPORT_CNN.md", lines.join("\n"));
  console.log(`Report: projects/paper-trading/ML_REPORT_CNN.md`);
  console.log(`Walk-forward top 10 / yr: ${perFold.map((m) => `${m} ${pct((walk.portfolios as Record<string, { cagr: number }>)[`Top 10: ${m}`].cagr)}`).join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
