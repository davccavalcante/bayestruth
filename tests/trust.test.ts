import { describe, expect, it } from 'vitest';
import { JEFFREYS_PRIOR } from '../src/beta/index.js';
import { initialRecord, observeRecord, rankScores, scoreRecord } from '../src/trust/index.js';

describe('initialRecord', () => {
  it('creates an empty record from the default uniform prior', () => {
    const record = initialRecord('a');
    expect(record.posterior).toEqual({ alpha: 1, beta: 1 });
    expect(record.successes).toBe(0);
    expect(record.failures).toBe(0);
    expect(record.lastObservedAt).toBe(0);
  });

  it('accepts a custom prior and timestamp', () => {
    const record = initialRecord('a', JEFFREYS_PRIOR, 1000);
    expect(record.posterior).toEqual({ alpha: 0.5, beta: 0.5 });
    expect(record.lastObservedAt).toBe(1000);
  });
});

describe('observeRecord', () => {
  it('increments the right counts for string and boolean outcomes', () => {
    let record = initialRecord('a');
    record = observeRecord(record, 'success', 1);
    record = observeRecord(record, true, 2);
    record = observeRecord(record, 'failure', 3);
    record = observeRecord(record, false, 4);
    expect(record.successes).toBe(2);
    expect(record.failures).toBe(2);
    expect(record.posterior).toEqual({ alpha: 3, beta: 3 });
    expect(record.lastObservedAt).toBe(4);
  });
});

describe('scoreRecord', () => {
  it('summarizes a record into a calibrated score', () => {
    let record = initialRecord('a');
    for (let i = 0; i < 9; i += 1) {
      record = observeRecord(record, 'success', i);
    }
    record = observeRecord(record, 'failure', 9);
    const score = scoreRecord(record);
    expect(score.subject).toBe('a');
    expect(score.score).toBeCloseTo(10 / 12, 12);
    expect(score.samples).toBe(10);
    expect(score.mode).toBeDefined();
    expect(score.interval.lower).toBeLessThan(score.score);
  });

  it('omits the mode when the posterior has no interior maximum', () => {
    const record = initialRecord('fresh');
    const score = scoreRecord(record);
    expect(score.mode).toBeUndefined();
  });
});

describe('rankScores', () => {
  it('ranks by the conservative lower bound by default', () => {
    const lucky = scoreRecord(observeRecord(initialRecord('lucky'), 'success', 1));
    let proven = initialRecord('proven');
    for (let i = 0; i < 90; i += 1) {
      proven = observeRecord(proven, 'success', i);
    }
    for (let i = 0; i < 10; i += 1) {
      proven = observeRecord(proven, 'failure', 90 + i);
    }
    const provenScore = scoreRecord(proven);
    const ranked = rankScores([lucky, provenScore]);
    expect(ranked[0]?.subject).toBe('proven');
  });

  it('can rank by the posterior mean instead', () => {
    const a = scoreRecord(observeRecord(initialRecord('a'), 'success', 1));
    const b = scoreRecord(observeRecord(initialRecord('b'), 'failure', 1));
    const ranked = rankScores([b, a], 'mean');
    expect(ranked[0]?.subject).toBe('a');
  });
});
