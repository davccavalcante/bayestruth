/**
 * Calibrated decision policies.
 *
 * A trust score is a posterior; a decision is a threshold on that posterior. The default policy is
 * deliberately conservative: a subject is `trust` only when the lower bound of its credible interval
 * clears the bar (so a single lucky success cannot earn trust), `distrust` when its posterior mean
 * falls below the floor, and `monitor` otherwise, including while the sample is still too small to
 * judge. The thresholds are yours; the calibration is the library's.
 *
 * @packageDocumentation
 */

import type { TrustDecision, TrustPolicy, TrustScore } from '../types.js';

export type { TrustDecision, TrustPolicy, TrustScore } from '../types.js';

/** A conservative default: trust at a 0.9 lower bound, distrust below a 0.5 mean, after 5 samples. */
export const DEFAULT_TRUST_POLICY: TrustPolicy = {
  trustLower: 0.9,
  distrustMean: 0.5,
  minSamples: 5,
};

/** Decide whether to trust, monitor, or distrust a subject given its score and a policy. */
export function decideTrust(
  score: TrustScore,
  policy: TrustPolicy = DEFAULT_TRUST_POLICY,
): TrustDecision {
  if (score.samples < policy.minSamples) {
    return 'monitor';
  }
  if (score.interval.lower >= policy.trustLower) {
    return 'trust';
  }
  if (score.score < policy.distrustMean) {
    return 'distrust';
  }
  return 'monitor';
}

/** A partition of subjects by decision. */
export interface TrustPartition {
  readonly trust: ReadonlyArray<TrustScore>;
  readonly monitor: ReadonlyArray<TrustScore>;
  readonly distrust: ReadonlyArray<TrustScore>;
}

/** Partition a set of scores into trust, monitor, and distrust buckets. */
export function partition(
  scores: ReadonlyArray<TrustScore>,
  policy: TrustPolicy = DEFAULT_TRUST_POLICY,
): TrustPartition {
  const trust: TrustScore[] = [];
  const monitor: TrustScore[] = [];
  const distrust: TrustScore[] = [];
  for (const score of scores) {
    const decision = decideTrust(score, policy);
    if (decision === 'trust') {
      trust.push(score);
    } else if (decision === 'distrust') {
      distrust.push(score);
    } else {
      monitor.push(score);
    }
  }
  return { trust, monitor, distrust };
}
