import { describe, expect, it } from 'vitest';
import { isBayesTruthError } from '../src/errors.js';
import { betaQuantile, lgamma, logBeta, regularizedIncompleteBeta } from '../src/mathspecial.js';

describe('lgamma', () => {
  it('matches known factorial identities (lgamma(n) = ln((n-1)!))', () => {
    expect(Math.exp(lgamma(1))).toBeCloseTo(1, 9);
    expect(Math.exp(lgamma(2))).toBeCloseTo(1, 9);
    expect(Math.exp(lgamma(5))).toBeCloseTo(24, 6);
    expect(Math.exp(lgamma(6))).toBeCloseTo(120, 5);
  });

  it('reproduces the half-integer value lgamma(0.5) = ln(sqrt(pi))', () => {
    expect(lgamma(0.5)).toBeCloseTo(0.5 * Math.log(Math.PI), 9);
  });

  it('throws ERR_NUMERIC for non-positive or non-finite input', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      try {
        lgamma(bad);
        throw new Error('expected throw');
      } catch (error) {
        expect(isBayesTruthError(error)).toBe(true);
        if (isBayesTruthError(error)) {
          expect(error.code).toBe('ERR_NUMERIC');
        }
      }
    }
  });
});

describe('logBeta', () => {
  it('is symmetric in its arguments', () => {
    expect(logBeta(2, 5)).toBeCloseTo(logBeta(5, 2), 12);
  });

  it('matches the closed form B(1, 1) = 1', () => {
    expect(Math.exp(logBeta(1, 1))).toBeCloseTo(1, 12);
  });
});

describe('regularizedIncompleteBeta', () => {
  it('clamps the support to 0 and 1', () => {
    expect(regularizedIncompleteBeta(0, 2, 3)).toBe(0);
    expect(regularizedIncompleteBeta(-0.5, 2, 3)).toBe(0);
    expect(regularizedIncompleteBeta(1, 2, 3)).toBe(1);
    expect(regularizedIncompleteBeta(1.5, 2, 3)).toBe(1);
  });

  it('is the identity CDF for the uniform Beta(1, 1)', () => {
    expect(regularizedIncompleteBeta(0.25, 1, 1)).toBeCloseTo(0.25, 10);
    expect(regularizedIncompleteBeta(0.5, 1, 1)).toBeCloseTo(0.5, 10);
    expect(regularizedIncompleteBeta(0.8, 1, 1)).toBeCloseTo(0.8, 10);
  });

  it('satisfies the reflection identity I_x(a, b) = 1 - I_{1-x}(b, a)', () => {
    const x = 0.37;
    expect(regularizedIncompleteBeta(x, 3, 7)).toBeCloseTo(
      1 - regularizedIncompleteBeta(1 - x, 7, 3),
      12,
    );
  });

  it('throws ERR_NUMERIC for non-positive shape parameters', () => {
    expect(() => regularizedIncompleteBeta(0.5, 0, 3)).toThrow();
    expect(() => regularizedIncompleteBeta(0.5, 3, -1)).toThrow();
  });
});

describe('betaQuantile', () => {
  it('returns the boundary for p = 0 and p = 1', () => {
    expect(betaQuantile(0, 2, 3)).toBe(0);
    expect(betaQuantile(1, 2, 3)).toBe(1);
  });

  it('inverts the CDF (quantile then CDF is the identity)', () => {
    for (const p of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const x = betaQuantile(p, 4, 6);
      expect(regularizedIncompleteBeta(x, 4, 6)).toBeCloseTo(p, 8);
    }
  });

  it('matches the uniform median at 0.5', () => {
    expect(betaQuantile(0.5, 1, 1)).toBeCloseTo(0.5, 10);
  });

  it('throws ERR_NUMERIC when p is outside [0, 1]', () => {
    expect(() => betaQuantile(-0.1, 2, 3)).toThrow();
    expect(() => betaQuantile(1.1, 2, 3)).toThrow();
    expect(() => betaQuantile(Number.NaN, 2, 3)).toThrow();
  });
});
