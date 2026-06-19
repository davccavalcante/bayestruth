/**
 * Empirical-Bayes pooling across a category of subjects.
 *
 * A brand-new tool has only its prior, so its trust score is whatever you assumed. That is the cold
 * start problem, and it is where a flat prior is weakest. Pooling fixes it: fit a shared Beta prior to
 * a group of similar subjects (all search tools, all payment providers) by matching the mean and
 * variance of their observed success rates, then score each subject, and any new one, against that
 * fitted prior. A subject with little data is pulled toward the group; a subject with much data barely
 * moves. This partial pooling is the principled middle ground between trusting ten samples on their own
 * and naively averaging everything, and it is the concrete advantage a Bayesian treatment has over a
 * per-subject frequentist interval. Pure, dependency-free, node-free.
 *
 * @packageDocumentation
 */

import { BayesTruthError } from '../errors.js';
import { scoreRecord } from '../trust/index.js';
import type { Prior, SubjectRecord, TrustScore } from '../types.js';

export type { Prior, SubjectRecord, TrustScore } from '../types.js';

const RATE_EPSILON = 1e-6;

/**
 * Fit a shared Beta prior to a group of subjects by method of moments on their observed success rates.
 *
 * @throws {@link BayesTruthError} with code `ERR_INVALID_INPUT` when fewer than two subjects carry
 *   observations, since pooling needs siblings to borrow strength from.
 */
export function fitCategoryPrior(records: ReadonlyArray<SubjectRecord>): Prior {
  const rates: number[] = [];
  for (const record of records) {
    const n = record.successes + record.failures;
    if (n > 0) {
      rates.push(record.successes / n);
    }
  }
  if (rates.length < 2) {
    throw new BayesTruthError(
      'ERR_INVALID_INPUT',
      'fitCategoryPrior needs at least two subjects with observations',
    );
  }
  const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const variance =
    rates.reduce((sum, rate) => sum + (rate - mean) * (rate - mean), 0) / rates.length;

  // Keep the mean strictly interior so the prior stays a valid Beta even when every sibling agrees.
  const m = Math.min(1 - RATE_EPSILON, Math.max(RATE_EPSILON, mean));
  const maxVariance = m * (1 - m);
  // Clamp the spread into (0, maxVariance): zero spread implies a sharp prior, an overdispersed group a
  // weak one. Either way the resulting concentration is finite and positive.
  const v = Math.min(
    maxVariance * (1 - RATE_EPSILON),
    Math.max(maxVariance * RATE_EPSILON, variance),
  );
  const concentration = maxVariance / v - 1;
  return { alpha: m * concentration, beta: (1 - m) * concentration };
}

/** Re-anchor a subject's observed counts on a new prior, returning the pooled record. */
export function pooledRecord(record: SubjectRecord, prior: Prior): SubjectRecord {
  return {
    subject: record.subject,
    posterior: { alpha: prior.alpha + record.successes, beta: prior.beta + record.failures },
    successes: record.successes,
    failures: record.failures,
    lastObservedAt: record.lastObservedAt,
  };
}

/** Score a subject against a pooled prior instead of its original one. */
export function pooledScore(record: SubjectRecord, prior: Prior, level?: number): TrustScore {
  return scoreRecord(pooledRecord(record, prior), level);
}

/** The result of pooling a whole category. */
export interface PooledCategory {
  readonly prior: Prior;
  readonly scores: ReadonlyArray<TrustScore>;
}

/** Fit a category prior and score every subject against it in one call. */
export function poolCategory(
  records: ReadonlyArray<SubjectRecord>,
  level?: number,
): PooledCategory {
  const prior = fitCategoryPrior(records);
  return { prior, scores: records.map((record) => pooledScore(record, prior, level)) };
}
