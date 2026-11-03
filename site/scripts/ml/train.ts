// Trains and tests the boosted-tree model (lib/ml/gbm.ts) on the data
// fetch-data.ts saved. The tests themselves live in evaluate.ts.
//
//   1. Builds one row per stock per week since 2017: ~50 features (lib/ml/
//      features.ts) and what the stock did over the next 20 trading days
//      relative to SPY.
//   2. Driver report: how strongly each feature, on its own, lined up with
//      the next month's return (its "IC", explained in evaluate.ts).
//   3. Two tests, both scored on the ~94 core stocks the robots trade:
//      - Walk-forward: for each year from 2019, train only on earlier years,
//        then predict that year blind. The realistic one: it's what live
//        trading would have looked like.
//      - Purged 5-fold cross-validation: cut the timeline into 5 blocks;
//        train on 4, test on the 5th, rotate. Uses later years to predict
//        earlier ones, so it asks a different question: do the patterns
//        hold in every era, or only some? Blocks are slices of time, not
//        shuffled weeks, with a 20-day gap cut out either side of the test
//        block, because neighbouring weeks share the same month of returns
//        and shuffling would let the model see the answers.
//   4. Trains the final model on everything and writes it to
//      src/lib/ml/model.json, with the report in projects/paper-trading/.
//
// Usage, from site/:  npx tsx scripts/ml/train.ts [--universe sp500] [--no-macro]
//   --universe sp500  learn from the whole S&P 500 (fetch it first), still
//                     tested on the core stocks
//   --no-macro        hide the market-regime features from the model

import { writeFileSync } from "node:fs";
import { FEATURES, FEATURE_KEYS, groupBy, HORIZON, percentileRanks, type PanelRow } from "../../src/lib/ml/features";
import { DEFAULT_PARAMS, predict, train, type Model } from "../../src/lib/ml/gbm";
import {
  DISCLAIMER,
  f3,
  FIRST_TEST_YEAR,
  icStats,
  kFoldFolds,
  loadPanel,
  pct,
  runTest,
  testSection,
  walkForwardFolds,
  yardsticks,
} from "./evaluate";

const UNIVERSE = process.argv.includes("--universe") ? process.argv[process.argv.indexOf("--universe") + 1] : "core";
const NO_MACRO = process.argv.includes("--no-macro");
const HIDDEN = new Set(FEATURES.flatMap((f, k) => (NO_MACRO && f.group === "Macro" ? [k] : [])));

// Target for training: each stock's rank on that day by next-month return,
// from −0.5 (worst) to +0.5 (best). Ranks, not raw returns, so one stock
// doubling can't dominate the fit, and a falling market can't either.
function rankTargets(rows: PanelRow[]): Float64Array {
  const y = new Float64Array(rows.length);
  const byDay = groupBy(
    rows.map((r, k) => ({ r, k })),
    (e) => e.r.day,
  );
  for (const es of byDay.values()) percentileRanks(es.map((e) => e.r.fwd)).forEach((v, j) => (y[es[j].k] = v - 0.5));
  return y;
}

export function fitTrees(rows: PanelRow[], hidden: Set<number> = HIDDEN): Model {
  // A hidden feature is all-missing, so the model can never split on it.
  const X = FEATURE_KEYS.map((_, f) => Float64Array.from(rows, (r) => (hidden.has(f) ? NaN : r.x[f])));
  return train(X, rankTargets(rows));
}

async function main() {
  const p = loadPanel(UNIVERSE);

  // Each driver on its own, across every stock trained on. Macro features
  // are the same for every stock on a day, so they can't rank stocks alone.
  const drivers = FEATURES.map((f, k) => ({ ...f, ...icStats(p.byDay, (r) => r.x[k]) }))
    .filter((d) => d.group !== "Macro")
    .sort((a, b) => Math.abs(b.t) - Math.abs(a.t));

  const models = {
    "ML model": async (rows: PanelRow[]) => {
      const m = fitTrees(rows);
      return (r: PanelRow) => predict(m, r.x);
    },
  };
  const fixed = yardsticks(p);
  const perFold = ["ML model", "Signal Trader price rules"];
  console.log("Walk-forward test…");
  const walk = await runTest(p, "walk-forward", walkForwardFolds(p), models, fixed);
  console.log("5-fold cross-validation…");
  const kfold = await runTest(p, "fold", kFoldFolds(p), models, fixed);

  console.log("Final model…");
  const final = fitTrees(p.labelled);
  const totalGain = final.gain.reduce((s, v) => s + v, 0);
  const importance = FEATURES.map((f, k) => ({ ...f, share: final.gain[k] / totalGain }))
    .sort((a, b) => b.share - a.share)
    .filter((f) => f.share > 0);
  writeFileSync(
    "src/lib/ml/model.json",
    JSON.stringify({
      trainedAt: new Date().toISOString().slice(0, 10),
      trainedThrough: p.lastDate,
      universe: UNIVERSE,
      rows: p.labelled.length,
      features: FEATURE_KEYS,
      hidden: FEATURE_KEYS.filter((_, k) => HIDDEN.has(k)),
      horizon: HORIZON,
      params: DEFAULT_PARAMS,
      test: { walkForwardIc: walk.ic["ML model"].ic, kfoldIc: kfold.ic["ML model"].ic, from: `${FIRST_TEST_YEAR}-01-01` },
      model: final,
    }),
  );

  const flags = `${UNIVERSE === "sp500" ? " --universe sp500" : ""}${NO_MACRO ? " --no-macro" : ""}`;
  const lines: string[] = [
    `# ML stock model: test results${UNIVERSE === "sp500" ? ", trained on the S&P 500" : ""}${NO_MACRO ? ", market-regime features hidden" : ""}`,
    "",
    `Generated ${new Date().toISOString().slice(0, 10)} by \`site/scripts/ml/train.ts${flags}\`. ${p.symbols.length} stocks, ` +
      `${p.labelled.length.toLocaleString()} stock-weeks, ${p.firstDate} to ${p.lastDate}, ${FEATURES.length} features, ` +
      `predicting each stock's next ${HORIZON} trading days vs SPY.`,
    "",
    DISCLAIMER,
    "",
    ...testSection(`Walk-forward test (${FIRST_TEST_YEAR} onwards, every prediction made blind)`, walk, "Test year", perFold),
    ...testSection("Purged 5-fold cross-validation (train on 4 blocks of time, test on the 5th)", kfold, "Test block", perFold),
    `## Each driver on its own (${p.firstDate.slice(0, 4)} onwards, all ${p.symbols.length} stocks)`,
    "",
    "Positive IC = higher values went with better next-month returns; negative = the opposite. Sorted by t-stat. " +
      "Market-regime features aren't listed: they're the same for every stock on a day, so alone they can't rank stocks.",
    "",
    "| Driver | Group | IC | t-stat | Years same sign |",
    "|---|---|---:|---:|---:|",
    ...drivers.map((d) => `| ${d.label} | ${d.group} | ${f3(d.ic)} | ${d.t.toFixed(1)} | ${d.sameSignYears}/${d.years} |`),
    "",
    "## What the final model leans on",
    "",
    "Share of the model's total improvement that came from splits on each feature.",
    "",
    "| Feature | Group | Share |",
    "|---|---|---:|",
    ...importance.slice(0, 20).map((f) => `| ${f.label} | ${f.group} | ${pct(f.share)} |`),
    "",
  ];
  const file = `ML_REPORT${UNIVERSE === "sp500" ? "_SP500" : ""}${NO_MACRO ? "_NO_MACRO" : ""}.md`;
  writeFileSync(`../projects/paper-trading/${file}`, lines.join("\n"));
  console.log(`Report: projects/paper-trading/${file}`);
}

if (require.main === module) main();
