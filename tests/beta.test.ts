import { describe, expect, it } from 'vitest';
import {
  assertPosterior,
  betaCdf,
  betaMean,
  betaMode,
  betaPdf,
  betaQuantileOf,
  betaStddev,
  betaVariance,
  credibleInterval,
  DEFAULT_CREDIBLE_LEVEL,
  JEFFREYS_PRIOR,
  sampleFrom,
  UNIFORM_PRIOR,
  update,
  updateBatch,
} from '../src/beta/index.js';
import { mulberry32 } from '../src/rng.js';

describe('priors and constants', () => {
  it('exposes the uniform and Jeffreys priors and the default level', () => {
    expect(UNIFORM_PRIOR).toEqual({ alpha: 1, beta: 1 });
    expect(JEFFREYS_PRIOR).toEqual({ alpha: 0.5, beta: 0.5 });
    expect(DEFAULT_CREDIBLE_LEVEL).toBe(0.95);
  });
});

describe('assertPosterior', () => {
  it('accepts valid posteriors', () => {
    expect(() => assertPosterior({ alpha: 2, beta: 3 })).not.toThrow();
  });

  it('rejects non-positive or non-finite parameters', () => {
    expect(() => assertPosterior({ alpha: 0, beta: 1 })).toThrow();
    expect(() => assertPosterior({ alpha: 1, beta: -1 })).toThrow();
    expect(() => assertPosterior({ alpha: Number.NaN, beta: 1 })).toThrow();
  });
});

describe('moments', () => {
  it('computes mean, variance, and standard deviation', () => {
    expect(betaMean({ alpha: 2, beta: 2 })).toBeCloseTo(0.5, 12);
    expect(betaVariance({ alpha: 1, beta: 1 })).toBeCloseTo(1 / 12, 12);
    expect(betaStddev({ alpha: 1, beta: 1 })).toBeCloseTo(Math.sqrt(1 / 12), 12);
  });

  it('returns the mode only when both parameters exceed 1', () => {
    expect(betaMode({ alpha: 3, beta: 3 })).toBeCloseTo(0.5, 12);
    expect(betaMode({ alpha: 1, beta: 5 })).toBeUndefined();
    expect(betaMode({ alpha: 5, beta: 1 })).toBeUndefined();
  });
});

describe('density and distribution', () => {
  it('returns a flat density of 1 for the uniform prior inside the support', () => {
    expect(betaPdf(0.3, UNIFORM_PRIOR)).toBeCloseTo(1, 9);
    expect(betaPdf(0, UNIFORM_PRIOR)).toBeCloseTo(1, 9);
    expect(betaPdf(1, UNIFORM_PRIOR)).toBeCloseTo(1, 9);
  });

  it('is zero outside the support', () => {
    expect(betaPdf(-0.1, UNIFORM_PRIOR)).toBe(0);
    expect(betaPdf(1.1, UNIFORM_PRIOR)).toBe(0);
  });

  it('diverges at the boundary when a shape parameter is below 1', () => {
    expect(betaPdf(0, { alpha: 0.5, beta: 2 })).toBe(Number.POSITIVE_INFINITY);
    expect(betaPdf(1, { alpha: 2, beta: 0.5 })).toBe(Number.POSITIVE_INFINITY);
  });

  it('is zero at the boundary when a shape parameter exceeds 1', () => {
    expect(betaPdf(0, { alpha: 2, beta: 2 })).toBe(0);
    expect(betaPdf(1, { alpha: 2, beta: 2 })).toBe(0);
  });

  it('computes the CDF and its inverse consistently', () => {
    const p = { alpha: 4, beta: 6 };
    const x = betaQuantileOf(0.4, p);
    expect(betaCdf(x, p)).toBeCloseTo(0.4, 8);
  });
});

describe('credibleInterval', () => {
  it('brackets the mean and uses the default level', () => {
    const p = { alpha: 8, beta: 4 };
    const interval = credibleInterval(p);
    expect(interval.level).toBe(0.95);
    expect(interval.lower).toBeLessThan(betaMean(p));
    expect(interval.upper).toBeGreaterThan(betaMean(p));
  });

  it('widens at higher levels', () => {
    const p = { alpha: 5, beta: 5 };
    const narrow = credibleInterval(p, 0.5);
    const wide = credibleInterval(p, 0.99);
    expect(wide.upper - wide.lower).toBeGreaterThan(narrow.upper - narrow.lower);
  });

  it('rejects levels outside (0, 1)', () => {
    expect(() => credibleInterval({ alpha: 2, beta: 2 }, 0)).toThrow();
    expect(() => credibleInterval({ alpha: 2, beta: 2 }, 1)).toThrow();
  });
});

describe('conjugate updates', () => {
  it('adds to alpha on success and beta on failure', () => {
    expect(update(UNIFORM_PRIOR, 'success')).toEqual({ alpha: 2, beta: 1 });
    expect(update(UNIFORM_PRIOR, 'failure')).toEqual({ alpha: 1, beta: 2 });
    expect(update(UNIFORM_PRIOR, true)).toEqual({ alpha: 2, beta: 1 });
    expect(update(UNIFORM_PRIOR, false)).toEqual({ alpha: 1, beta: 2 });
  });

  it('folds in a batch of counts', () => {
    expect(updateBatch(UNIFORM_PRIOR, 9, 1)).toEqual({ alpha: 10, beta: 2 });
  });

  it('rejects negative or non-finite batch counts', () => {
    expect(() => updateBatch(UNIFORM_PRIOR, -1, 0)).toThrow();
    expect(() => updateBatch(UNIFORM_PRIOR, 0, Number.NaN)).toThrow();
  });
});

describe('sampleFrom', () => {
  it('draws a value in the unit interval from a seeded source', () => {
    const rng = mulberry32(17);
    const value = sampleFrom({ alpha: 3, beta: 7 }, rng);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });
});
