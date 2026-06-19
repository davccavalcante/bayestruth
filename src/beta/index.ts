/**
 * The Beta distribution, the conjugate prior for Bernoulli trials.
 *
 * Exact closed-form summaries (mean, variance, mode), the density, the CDF via the regularized
 * incomplete beta, the quantile via its inverse, equal-tailed credible intervals, the conjugate
 * update, and seeded sampling. This is the mathematical core every other layer builds on. A
 * Beta(alpha, beta) posterior over a success rate has mean alpha / (alpha + beta); each success adds
 * one to alpha, each failure adds one to beta. Nothing here approximates; the credible interval is
 * the true Beta quantile.
 *
 * @packageDocumentation
 */

import { BayesTruthError } from '../errors.js';
import { betaQuantile, logBeta, regularizedIncompleteBeta } from '../mathspecial.js';
import { type Rng, sampleBeta } from '../rng.js';
import type { CredibleInterval, Outcome, Posterior } from '../types.js';

export type { CredibleInterval, Outcome, Posterior } from '../types.js';

/** The uniform, non-informative prior Beta(1, 1): all success rates equally likely a priori. */
export const UNIFORM_PRIOR: Posterior = { alpha: 1, beta: 1 };

/** The Jeffreys prior Beta(0.5, 0.5): the reference objective prior for a Bernoulli rate. */
export const JEFFREYS_PRIOR: Posterior = { alpha: 0.5, beta: 0.5 };

/** Default mass for a credible interval. */
export const DEFAULT_CREDIBLE_LEVEL = 0.95;

/** Throw unless `p` is a valid Beta posterior (both shape parameters finite and positive). */
export function assertPosterior(p: Posterior): void {
  if (!Number.isFinite(p.alpha) || p.alpha <= 0 || !Number.isFinite(p.beta) || p.beta <= 0) {
    throw new BayesTruthError(
      'ERR_INVALID_PRIOR',
      `Beta requires alpha > 0 and beta > 0, received alpha=${p.alpha} beta=${p.beta}`,
    );
  }
}

/** Posterior mean, the point trust estimate. */
export function betaMean(p: Posterior): number {
  return p.alpha / (p.alpha + p.beta);
}

/** Posterior variance. */
export function betaVariance(p: Posterior): number {
  const sum = p.alpha + p.beta;
  return (p.alpha * p.beta) / (sum * sum * (sum + 1));
}

/** Posterior standard deviation. */
export function betaStddev(p: Posterior): number {
  return Math.sqrt(betaVariance(p));
}

/** Posterior mode, defined only when both shape parameters exceed 1. */
export function betaMode(p: Posterior): number | undefined {
  if (p.alpha > 1 && p.beta > 1) {
    return (p.alpha - 1) / (p.alpha + p.beta - 2);
  }
  return undefined;
}

/** Probability density at `x` in [0, 1]. Returns 0 outside the support. */
export function betaPdf(x: number, p: Posterior): number {
  assertPosterior(p);
  if (x < 0 || x > 1) {
    return 0;
  }
  if (x === 0) {
    return p.alpha < 1
      ? Number.POSITIVE_INFINITY
      : p.alpha === 1
        ? Math.exp(-logBeta(p.alpha, p.beta))
        : 0;
  }
  if (x === 1) {
    return p.beta < 1
      ? Number.POSITIVE_INFINITY
      : p.beta === 1
        ? Math.exp(-logBeta(p.alpha, p.beta))
        : 0;
  }
  return Math.exp(
    (p.alpha - 1) * Math.log(x) + (p.beta - 1) * Math.log(1 - x) - logBeta(p.alpha, p.beta),
  );
}

/** Cumulative probability at `x`, the Beta CDF. */
export function betaCdf(x: number, p: Posterior): number {
  assertPosterior(p);
  return regularizedIncompleteBeta(x, p.alpha, p.beta);
}

/** The `q`-quantile of the posterior, the inverse CDF. */
export function betaQuantileOf(q: number, p: Posterior): number {
  assertPosterior(p);
  return betaQuantile(q, p.alpha, p.beta);
}

/** Equal-tailed credible interval at the given level (default 0.95). */
export function credibleInterval(
  p: Posterior,
  level: number = DEFAULT_CREDIBLE_LEVEL,
): CredibleInterval {
  assertPosterior(p);
  if (!Number.isFinite(level) || level <= 0 || level >= 1) {
    throw new BayesTruthError(
      'ERR_INVALID_INPUT',
      `credible level must be in (0, 1), received ${level}`,
    );
  }
  const tail = (1 - level) / 2;
  return {
    lower: betaQuantile(tail, p.alpha, p.beta),
    upper: betaQuantile(1 - tail, p.alpha, p.beta),
    level,
  };
}

/** Conjugate update: fold one Bernoulli outcome into the posterior. */
export function update(p: Posterior, outcome: Outcome | boolean): Posterior {
  assertPosterior(p);
  const success = outcome === true || outcome === 'success';
  return success ? { alpha: p.alpha + 1, beta: p.beta } : { alpha: p.alpha, beta: p.beta + 1 };
}

/** Conjugate update: fold a batch of successes and failures into the posterior. */
export function updateBatch(p: Posterior, successes: number, failures: number): Posterior {
  assertPosterior(p);
  if (!Number.isFinite(successes) || successes < 0 || !Number.isFinite(failures) || failures < 0) {
    throw new BayesTruthError(
      'ERR_INVALID_INPUT',
      `updateBatch requires non-negative finite counts, received successes=${successes} failures=${failures}`,
    );
  }
  return { alpha: p.alpha + successes, beta: p.beta + failures };
}

/** Draw a sample from the posterior using the given seeded source. */
export function sampleFrom(p: Posterior, rng: Rng): number {
  assertPosterior(p);
  return sampleBeta(p.alpha, p.beta, rng);
}
