/**
 * Verifying calibration on your own data.
 *
 * BayesTruth claims its scores are calibrated under the model. This example shows how to check that:
 * record the trust score you acted on and the outcome that followed, then measure the Brier score, the
 * log loss, and the expected calibration error. A well-calibrated source has an observed success rate
 * inside each probability bin close to the bin's mean prediction. Run with:
 * `node examples/04-calibration-check.mjs`.
 */

import { calibrationReport } from '@takk/bayestruth/calibration';

// A tiny deterministic generator so the example is reproducible without any dependency.
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a well-calibrated synthetic dataset: a prediction of p succeeds with probability p.
const rng = seeded(123);
const predictions = [];
for (let i = 0; i < 5000; i += 1) {
  const p = Math.round(rng() * 10) / 10; // a predicted probability in {0, 0.1, ..., 1}
  const outcome = rng() < p ? 'success' : 'failure';
  predictions.push({ p, outcome });
}

const report = calibrationReport(predictions, 10);

process.stdout.write(`predictions : ${report.count}\n`);
process.stdout.write(`brier score : ${report.brier.toFixed(4)} (lower is better)\n`);
process.stdout.write(`log loss    : ${report.logLoss.toFixed(4)} (lower is better)\n`);
process.stdout.write(`ECE         : ${report.ece.toFixed(4)} (near 0 means well calibrated)\n\n`);
process.stdout.write('reliability diagram (predicted vs observed per bin):\n');
for (const bin of report.bins) {
  if (bin.count === 0) {
    continue;
  }
  process.stdout.write(
    `  [${bin.lower.toFixed(1)}, ${bin.upper.toFixed(1)}): ` +
      `predicted ${bin.meanPredicted.toFixed(3)}, observed ${bin.observedRate.toFixed(3)} ` +
      `(n=${bin.count})\n`,
  );
}
