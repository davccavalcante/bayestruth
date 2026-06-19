/**
 * Special functions for exact Beta-Bernoulli inference.
 *
 * Pure, dependency-free, deterministic implementations of the log-gamma function, the regularized
 * incomplete beta function (the Beta CDF), and its inverse (the Beta quantile). These are what make
 * a credible interval exact rather than approximate. The incomplete beta uses Lentz's continued
 * fraction (Numerical Recipes); the quantile inverts the CDF by bisection, which is slower than
 * Newton but bulletproof across the full parameter range.
 *
 * @packageDocumentation
 */

import { BayesTruthError } from './errors.js';

const LANCZOS_G = 7;
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
] as const;

/** Natural log of the gamma function via the Lanczos approximation. Defined for `x > 0`. */
export function lgamma(x: number): number {
  if (!Number.isFinite(x) || x <= 0) {
    throw new BayesTruthError('ERR_NUMERIC', `lgamma requires x > 0, received ${x}`);
  }
  let a = LANCZOS_COEFFICIENTS[0] as number;
  // Lanczos with the argument shifted by one (z = x - 1): the peak of the series sits at
  // t = z + g + 0.5 = x + g - 0.5, and the leading power uses the same z + 0.5 = x - 0.5 exponent.
  const t = x + LANCZOS_G - 0.5;
  for (let i = 1; i < LANCZOS_COEFFICIENTS.length; i += 1) {
    a += (LANCZOS_COEFFICIENTS[i] as number) / (x + i - 1);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x - 0.5) * Math.log(t) - t + Math.log(a);
}

/** Natural log of the Beta function, `lgamma(a) + lgamma(b) - lgamma(a + b)`. */
export function logBeta(a: number, b: number): number {
  return lgamma(a) + lgamma(b) - lgamma(a + b);
}

const CF_MAX_ITERATIONS = 300;
const CF_EPSILON = 3e-14;
const CF_TINY = 1e-300;

/** Lentz's continued fraction for the regularized incomplete beta function. */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < CF_TINY) {
    d = CF_TINY;
  }
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= CF_MAX_ITERATIONS; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < CF_TINY) {
      d = CF_TINY;
    }
    c = 1 + aa / c;
    if (Math.abs(c) < CF_TINY) {
      c = CF_TINY;
    }
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < CF_TINY) {
      d = CF_TINY;
    }
    c = 1 + aa / c;
    if (Math.abs(c) < CF_TINY) {
      c = CF_TINY;
    }
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < CF_EPSILON) {
      break;
    }
  }
  return h;
}

/**
 * The regularized incomplete beta function `I_x(a, b)`, which is the CDF of a Beta(a, b) distribution
 * evaluated at `x`. Returns a probability in [0, 1].
 */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (a <= 0 || b <= 0) {
    throw new BayesTruthError('ERR_NUMERIC', `incomplete beta requires a > 0 and b > 0`);
  }
  if (x <= 0) {
    return 0;
  }
  if (x >= 1) {
    return 1;
  }
  const front = Math.exp(logBeta(a, b) * -1 + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/**
 * The inverse of the regularized incomplete beta, the quantile of a Beta(a, b) distribution.
 * Returns the `x` in [0, 1] such that `I_x(a, b) = p`. Inverted by bisection.
 */
export function betaQuantile(p: number, a: number, b: number): number {
  if (!Number.isFinite(p) || p < 0 || p > 1) {
    throw new BayesTruthError('ERR_NUMERIC', `betaQuantile requires p in [0, 1], received ${p}`);
  }
  if (p === 0) {
    return 0;
  }
  if (p === 1) {
    return 1;
  }
  let lo = 0;
  let hi = 1;
  let mid = 0.5;
  for (let i = 0; i < 100; i += 1) {
    mid = 0.5 * (lo + hi);
    const cdf = regularizedIncompleteBeta(mid, a, b);
    if (cdf < p) {
      lo = mid;
    } else {
      hi = mid;
    }
    if (hi - lo < 1e-14) {
      break;
    }
  }
  return mid;
}
