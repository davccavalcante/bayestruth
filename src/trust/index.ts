/**
 * Trust scoring over subject records.
 *
 * A subject (a tool, an MCP server, a skill, an agent) carries a Beta posterior plus observed counts.
 * `observeRecord` folds one Bernoulli outcome in with the conjugate update; `scoreRecord` turns the
 * posterior into a calibrated {@link TrustScore} (mean, mode, standard deviation, credible interval,
 * counts). Ranking defaults to the credible-interval lower bound, the conservative choice: a subject
 * with one success out of one is not ranked above a subject with ninety out of a hundred, because its
 * interval is wide.
 *
 * @packageDocumentation
 */

import {
  assertPosterior,
  betaMean,
  betaMode,
  betaStddev,
  credibleInterval,
  DEFAULT_CREDIBLE_LEVEL,
  UNIFORM_PRIOR,
  update,
} from '../beta/index.js';
import type { Outcome, Prior, SubjectRecord, TrustScore } from '../types.js';

export { JEFFREYS_PRIOR, UNIFORM_PRIOR } from '../beta/index.js';
export type { Outcome, Prior, SubjectRecord, TrustScore } from '../types.js';

/** Create a fresh record for a subject from a prior (default the uniform Beta(1, 1)). */
export function initialRecord(
  subject: string,
  prior: Prior = UNIFORM_PRIOR,
  at = 0,
): SubjectRecord {
  assertPosterior(prior);
  return {
    subject,
    posterior: { alpha: prior.alpha, beta: prior.beta },
    successes: 0,
    failures: 0,
    lastObservedAt: at,
  };
}

/** Fold one Bernoulli outcome into a record, returning a new record. */
export function observeRecord(
  record: SubjectRecord,
  outcome: Outcome | boolean,
  at: number,
): SubjectRecord {
  const success = outcome === true || outcome === 'success';
  return {
    subject: record.subject,
    posterior: update(record.posterior, outcome),
    successes: record.successes + (success ? 1 : 0),
    failures: record.failures + (success ? 0 : 1),
    lastObservedAt: at,
  };
}

/** Summarize a record into a calibrated trust score at the given credible level. */
export function scoreRecord(
  record: SubjectRecord,
  level: number = DEFAULT_CREDIBLE_LEVEL,
): TrustScore {
  const posterior = record.posterior;
  const mode = betaMode(posterior);
  return {
    subject: record.subject,
    score: betaMean(posterior),
    ...(mode !== undefined ? { mode } : {}),
    stddev: betaStddev(posterior),
    interval: credibleInterval(posterior, level),
    successes: record.successes,
    failures: record.failures,
    samples: record.successes + record.failures,
    posterior,
  };
}

/** How to order subjects: by posterior mean, or by the conservative credible-interval lower bound. */
export type RankBy = 'mean' | 'lower';

/** Rank trust scores best-first. Defaults to the credible-interval lower bound (conservative). */
export function rankScores(scores: ReadonlyArray<TrustScore>, by: RankBy = 'lower'): TrustScore[] {
  return [...scores].sort((a, b) =>
    by === 'mean' ? b.score - a.score : b.interval.lower - a.interval.lower,
  );
}
