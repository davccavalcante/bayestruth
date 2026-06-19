import { describe, expect, it } from 'vitest';
import { DEFAULT_TRUST_POLICY, decideTrust, partition } from '../src/policy/index.js';
import { initialRecord, observeRecord, scoreRecord } from '../src/trust/index.js';
import type { TrustScore } from '../src/types.js';

function scoreOf(subject: string, successes: number, failures: number): TrustScore {
  let record = initialRecord(subject);
  for (let i = 0; i < successes; i += 1) {
    record = observeRecord(record, 'success', i);
  }
  for (let i = 0; i < failures; i += 1) {
    record = observeRecord(record, 'failure', successes + i);
  }
  return scoreRecord(record);
}

describe('DEFAULT_TRUST_POLICY', () => {
  it('is conservative', () => {
    expect(DEFAULT_TRUST_POLICY).toEqual({ trustLower: 0.9, distrustMean: 0.5, minSamples: 5 });
  });
});

describe('decideTrust', () => {
  it('monitors while there are too few samples', () => {
    expect(decideTrust(scoreOf('a', 2, 0))).toBe('monitor');
  });

  it('trusts when the lower bound clears the bar', () => {
    expect(decideTrust(scoreOf('a', 300, 1))).toBe('trust');
  });

  it('distrusts when the mean falls below the floor', () => {
    expect(decideTrust(scoreOf('a', 2, 20))).toBe('distrust');
  });

  it('monitors a mid-range subject that is neither trusted nor distrusted', () => {
    expect(decideTrust(scoreOf('a', 7, 3))).toBe('monitor');
  });

  it('honors a custom policy', () => {
    // Beta(9, 3) has a 95% lower bound near 0.48, so a 0.4 bar trusts where the default 0.9 would not.
    const lenient = { trustLower: 0.4, distrustMean: 0.2, minSamples: 1 };
    expect(decideTrust(scoreOf('a', 8, 2), lenient)).toBe('trust');
  });
});

describe('partition', () => {
  it('buckets scores by decision', () => {
    const scores = [scoreOf('trusted', 300, 1), scoreOf('bad', 1, 30), scoreOf('mid', 7, 3)];
    const result = partition(scores);
    expect(result.trust.map((s) => s.subject)).toEqual(['trusted']);
    expect(result.distrust.map((s) => s.subject)).toEqual(['bad']);
    expect(result.monitor.map((s) => s.subject)).toEqual(['mid']);
  });
});
