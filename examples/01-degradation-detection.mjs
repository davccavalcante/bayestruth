/**
 * Degradation detection.
 *
 * The headline demo: a tool is reliable, then a provider regression makes it start failing. BayesTruth
 * folds each call into a Beta posterior, and a decision policy walks from `trust` to `monitor` to
 * `distrust` as the credible interval drops, on evidence, before a human would notice from logs. Run
 * with: `node examples/01-degradation-detection.mjs`.
 */

import { createBayesTruth } from '@takk/bayestruth';

const trust = createBayesTruth({
  // An illustrative policy: trust above a 0.7 lower bound, distrust below a 0.5 mean.
  // The conservative default (0.9 lower bound) needs far more clean samples to reach `trust`.
  policy: { trustLower: 0.7, distrustMean: 0.5, minSamples: 5 },
});

const subject = 'search-tool';

// Phase 1: healthy. 29 successes out of 30.
observe(29, 1);
report('after a healthy run');

// Phase 2: the regression starts. The tool now fails about half the time.
observe(10, 10);
report('as the regression begins');

// Phase 3: the regression is sustained. The tool mostly fails now.
observe(5, 35);
report('once the regression is sustained');

function observe(successes, failures) {
  for (let i = 0; i < successes; i += 1) {
    trust.observe(subject, 'success');
  }
  for (let i = 0; i < failures; i += 1) {
    trust.observe(subject, 'failure');
  }
}

function report(when) {
  const score = trust.score(subject);
  process.stdout.write(
    `${when}:\n` +
      `  trust score  : ${score.score.toFixed(3)}\n` +
      `  95% interval : [${score.interval.lower.toFixed(3)}, ${score.interval.upper.toFixed(3)}]\n` +
      `  samples      : ${score.samples}\n` +
      `  decision     : ${trust.decide(subject)}\n\n`,
  );
}
