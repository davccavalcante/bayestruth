/**
 * Time-decay of evidence.
 *
 * A subject that was reliable a year ago should not count the same as one reliable today. Decay pulls
 * the accumulated pseudo-counts back toward the prior by an exponential factor: after one half-life,
 * half the evidence above the prior remains. This is a deliberate departure from pure Beta-Bernoulli,
 * which assumes a stationary success rate; decay is the escape hatch for slow non-stationarity. It is
 * opt-in, and the posterior stays a valid Beta because it never decays below the prior.
 *
 * @packageDocumentation
 */

import { BayesTruthError } from '../errors.js';
import type { Prior, SubjectRecord } from '../types.js';

export type { Prior, SubjectRecord } from '../types.js';

/** How evidence decays: a half-life and the prior it relaxes back toward. */
export interface DecaySpec {
  readonly halfLifeMs: number;
  readonly prior: Prior;
}

/** The retention factor for an elapsed time and half-life, in (0, 1]. 1 when no time has passed. */
export function decayFactor(elapsedMs: number, halfLifeMs: number): number {
  if (!Number.isFinite(halfLifeMs) || halfLifeMs <= 0) {
    throw new BayesTruthError('ERR_INVALID_INPUT', `halfLifeMs must be a finite number > 0`);
  }
  if (elapsedMs <= 0) {
    return 1;
  }
  return 0.5 ** (elapsedMs / halfLifeMs);
}

/**
 * Return a decayed view of a record at time `now`. The pseudo-counts above the prior, and the
 * observed counts, are scaled by the retention factor; the result is stamped with `now` so repeated
 * decays compose. A record at or before its last observation is returned unchanged.
 */
export function decayRecord(record: SubjectRecord, now: number, spec: DecaySpec): SubjectRecord {
  const elapsed = now - record.lastObservedAt;
  if (elapsed <= 0) {
    return record;
  }
  const f = decayFactor(elapsed, spec.halfLifeMs);
  const prior = spec.prior;
  return {
    subject: record.subject,
    posterior: {
      alpha: prior.alpha + (record.posterior.alpha - prior.alpha) * f,
      beta: prior.beta + (record.posterior.beta - prior.beta) * f,
    },
    successes: record.successes * f,
    failures: record.failures * f,
    lastObservedAt: now,
  };
}
