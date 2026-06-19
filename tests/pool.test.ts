import { describe, expect, it } from 'vitest';
import { assertPosterior, betaMean } from '../src/beta/index.js';
import { fitCategoryPrior, poolCategory, pooledRecord, pooledScore } from '../src/pool/index.js';
import { initialRecord, observeRecord, scoreRecord } from '../src/trust/index.js';
import type { SubjectRecord } from '../src/types.js';

function record(subject: string, successes: number, failures: number): SubjectRecord {
  let r = initialRecord(subject);
  for (let i = 0; i < successes; i += 1) {
    r = observeRecord(r, 'success', i);
  }
  for (let i = 0; i < failures; i += 1) {
    r = observeRecord(r, 'failure', successes + i);
  }
  return r;
}

describe('fitCategoryPrior', () => {
  it('requires at least two observed subjects', () => {
    expect(() => fitCategoryPrior([])).toThrow();
    expect(() => fitCategoryPrior([record('only', 5, 5)])).toThrow();
    expect(() => fitCategoryPrior([record('a', 0, 0), record('b', 0, 0)])).toThrow();
  });

  it('returns a valid Beta prior centered near the group mean', () => {
    const group = [record('a', 90, 10), record('b', 85, 15), record('c', 95, 5)];
    const prior = fitCategoryPrior(group);
    expect(() => assertPosterior(prior)).not.toThrow();
    expect(betaMean(prior)).toBeGreaterThan(0.8);
    expect(betaMean(prior)).toBeLessThan(0.95);
  });

  it('produces a sharp prior when every sibling agrees', () => {
    const group = [record('a', 80, 20), record('b', 80, 20), record('c', 80, 20)];
    const prior = fitCategoryPrior(group);
    // Near-zero spread implies a high concentration, a confident prior at the shared mean.
    expect(prior.alpha + prior.beta).toBeGreaterThan(100);
    expect(betaMean(prior)).toBeCloseTo(0.8, 2);
  });
});

describe('pooledRecord and pooledScore', () => {
  it('re-anchors observed counts on the pooled prior', () => {
    const prior = { alpha: 8, beta: 2 };
    const pooled = pooledRecord(record('new', 1, 0), prior);
    expect(pooled.posterior).toEqual({ alpha: 9, beta: 2 });
  });

  it('pulls a sparse subject toward the group it belongs to', () => {
    const group = [record('a', 90, 10), record('b', 88, 12), record('c', 92, 8)];
    const prior = fitCategoryPrior(group);
    const sparse = record('fresh', 1, 1);
    const rawMean = scoreRecord(sparse).score;
    const pooledMean = pooledScore(sparse, prior).score;
    const groupMean = betaMean(prior);
    expect(rawMean).toBeCloseTo(0.5, 6);
    expect(pooledMean).toBeGreaterThan(rawMean);
    expect(pooledMean).toBeLessThan(groupMean);
  });
});

describe('poolCategory', () => {
  it('fits a prior and scores every subject', () => {
    const group = [record('a', 90, 10), record('b', 10, 90)];
    const result = poolCategory(group);
    expect(() => assertPosterior(result.prior)).not.toThrow();
    expect(result.scores.map((s) => s.subject)).toEqual(['a', 'b']);
  });
});
