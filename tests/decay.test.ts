import { describe, expect, it } from 'vitest';
import { UNIFORM_PRIOR } from '../src/beta/index.js';
import { decayFactor, decayRecord } from '../src/decay/index.js';
import { initialRecord, observeRecord } from '../src/trust/index.js';

describe('decayFactor', () => {
  it('returns 1 when no time has elapsed', () => {
    expect(decayFactor(0, 1000)).toBe(1);
    expect(decayFactor(-50, 1000)).toBe(1);
  });

  it('halves at one half-life and quarters at two', () => {
    expect(decayFactor(1000, 1000)).toBeCloseTo(0.5, 12);
    expect(decayFactor(2000, 1000)).toBeCloseTo(0.25, 12);
  });

  it('throws for a non-positive or non-finite half-life', () => {
    expect(() => decayFactor(100, 0)).toThrow();
    expect(() => decayFactor(100, -10)).toThrow();
    expect(() => decayFactor(100, Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('decayRecord', () => {
  function evidenced() {
    let record = initialRecord('a', UNIFORM_PRIOR, 0);
    for (let i = 0; i < 10; i += 1) {
      record = observeRecord(record, 'success', i);
    }
    return record;
  }

  it('returns the record unchanged when no time has passed', () => {
    const record = evidenced();
    expect(
      decayRecord(record, record.lastObservedAt, { halfLifeMs: 1000, prior: UNIFORM_PRIOR }),
    ).toBe(record);
  });

  it('pulls the posterior halfway back toward the prior after one half-life', () => {
    const record = evidenced();
    const decayed = decayRecord(record, record.lastObservedAt + 1000, {
      halfLifeMs: 1000,
      prior: UNIFORM_PRIOR,
    });
    // alpha excess over prior was 10; after one half-life it should be 5, so alpha = 6.
    expect(decayed.posterior.alpha).toBeCloseTo(6, 9);
    expect(decayed.successes).toBeCloseTo(5, 9);
    expect(decayed.lastObservedAt).toBe(record.lastObservedAt + 1000);
  });

  it('never decays below the prior', () => {
    const record = evidenced();
    const decayed = decayRecord(record, record.lastObservedAt + 1_000_000, {
      halfLifeMs: 1000,
      prior: UNIFORM_PRIOR,
    });
    expect(decayed.posterior.alpha).toBeGreaterThanOrEqual(UNIFORM_PRIOR.alpha);
    expect(decayed.posterior.beta).toBeGreaterThanOrEqual(UNIFORM_PRIOR.beta);
  });
});
