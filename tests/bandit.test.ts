import { describe, expect, it } from 'vitest';
import { createBandit, thompsonSelect } from '../src/bandit/index.js';
import { isBayesTruthError } from '../src/errors.js';
import { mulberry32 } from '../src/rng.js';
import { initialRecord, observeRecord } from '../src/trust/index.js';

function record(subject: string, successes: number, failures: number) {
  let r = initialRecord(subject);
  for (let i = 0; i < successes; i += 1) {
    r = observeRecord(r, 'success', i);
  }
  for (let i = 0; i < failures; i += 1) {
    r = observeRecord(r, 'failure', successes + i);
  }
  return r;
}

describe('thompsonSelect', () => {
  it('throws ERR_NO_SUBJECTS for an empty list', () => {
    try {
      thompsonSelect([], mulberry32(1));
      throw new Error('expected throw');
    } catch (error) {
      expect(isBayesTruthError(error)).toBe(true);
      if (isBayesTruthError(error)) {
        expect(error.code).toBe('ERR_NO_SUBJECTS');
      }
    }
  });

  it('returns a draw for every subject and selects the argmax', () => {
    const records = [record('strong', 40, 2), record('weak', 2, 40)];
    const choice = thompsonSelect(records, mulberry32(2));
    expect(Object.keys(choice.draws).sort()).toEqual(['strong', 'weak']);
    const winner = choice.draws[choice.subject];
    expect(winner).toBe(Math.max(...Object.values(choice.draws)));
  });

  it('is reproducible for a fixed seed', () => {
    const records = [record('a', 5, 5), record('b', 6, 4)];
    const first = thompsonSelect(records, mulberry32(9)).subject;
    const second = thompsonSelect(records, mulberry32(9)).subject;
    expect(first).toBe(second);
  });

  it('usually prefers the clearly stronger subject', () => {
    const records = [record('strong', 90, 1), record('weak', 1, 90)];
    const bandit = createBandit(123);
    let strong = 0;
    for (let i = 0; i < 50; i += 1) {
      if (bandit.select(records).subject === 'strong') {
        strong += 1;
      }
    }
    expect(strong).toBeGreaterThan(45);
  });
});

describe('createBandit', () => {
  it('advances its generator across selections', () => {
    const records = [record('a', 10, 10), record('b', 10, 10)];
    const bandit = createBandit(1);
    const a = bandit.select(records);
    const b = bandit.select(records);
    expect(a.draws.a).not.toBe(b.draws.a);
  });
});
