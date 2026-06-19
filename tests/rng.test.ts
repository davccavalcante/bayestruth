import { describe, expect, it } from 'vitest';
import { mulberry32, sampleBeta, sampleGamma, sampleNormal } from '../src/rng.js';

describe('mulberry32', () => {
  it('is deterministic for a fixed seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i += 1) {
      expect(a()).toBe(b());
    }
  });

  it('produces values in [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('diverges for different seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('sampleNormal', () => {
  it('produces a finite sample with an approximately zero mean', () => {
    const rng = mulberry32(11);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) {
      const value = sampleNormal(rng);
      expect(Number.isFinite(value)).toBe(true);
      sum += value;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.05);
  });
});

describe('sampleGamma', () => {
  it('returns positive samples for shape >= 1', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 500; i += 1) {
      expect(sampleGamma(2.5, rng)).toBeGreaterThan(0);
    }
  });

  it('handles the shape < 1 boosting branch', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 500; i += 1) {
      expect(sampleGamma(0.3, rng)).toBeGreaterThan(0);
    }
  });

  it('has a mean near the shape (since scale is 1)', () => {
    const rng = mulberry32(5);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) {
      sum += sampleGamma(3, rng);
    }
    expect(sum / n).toBeCloseTo(3, 0);
  });
});

describe('sampleBeta', () => {
  it('produces values within the unit interval', () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 1000; i += 1) {
      const value = sampleBeta(2, 5, rng);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('has a mean near a / (a + b)', () => {
    const rng = mulberry32(321);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) {
      sum += sampleBeta(8, 2, rng);
    }
    expect(sum / n).toBeCloseTo(0.8, 1);
  });

  it('is reproducible across two generators with the same seed', () => {
    const a = mulberry32(55);
    const b = mulberry32(55);
    expect(sampleBeta(3, 4, a)).toBe(sampleBeta(3, 4, b));
  });
});
