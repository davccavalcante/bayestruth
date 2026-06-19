/**
 * Thompson-sampling selection across competing subjects.
 *
 * To route between competing tools, draw one sample from each subject's Beta posterior and pick the
 * subject with the highest draw. This balances exploration (an uncertain subject sometimes draws
 * high) and exploitation (a proven subject usually draws high) optimally, the standard result for
 * Bernoulli bandits. Seeding the generator makes the choice reproducible and auditable: the same seed
 * and posteriors always select the same subject.
 *
 * @packageDocumentation
 */

import { sampleFrom } from '../beta/index.js';
import { BayesTruthError } from '../errors.js';
import { mulberry32, type Rng } from '../rng.js';
import type { BanditChoice, SubjectRecord } from '../types.js';

export type { BanditChoice, SubjectRecord } from '../types.js';

/**
 * Select one subject by Thompson sampling, drawing once from each posterior with the given source.
 *
 * @throws {@link BayesTruthError} with code `ERR_NO_SUBJECTS` when the record list is empty.
 */
export function thompsonSelect(records: ReadonlyArray<SubjectRecord>, rng: Rng): BanditChoice {
  if (records.length === 0) {
    throw new BayesTruthError('ERR_NO_SUBJECTS', 'thompsonSelect requires at least one subject');
  }
  const draws: Record<string, number> = {};
  let bestSubject = records[0]?.subject ?? '';
  let bestDraw = Number.NEGATIVE_INFINITY;
  for (const record of records) {
    const draw = sampleFrom(record.posterior, rng);
    draws[record.subject] = draw;
    if (draw > bestDraw) {
      bestDraw = draw;
      bestSubject = record.subject;
    }
  }
  return { subject: bestSubject, draws };
}

/** A stateful bandit that advances its seeded generator across successive selections. */
export interface Bandit {
  select(records: ReadonlyArray<SubjectRecord>): BanditChoice;
}

/** Create a bandit with a persistent seeded generator. The default seed keeps runs reproducible. */
export function createBandit(seed = 1): Bandit {
  const rng = mulberry32(seed);
  return {
    select: (records) => thompsonSelect(records, rng),
  };
}
