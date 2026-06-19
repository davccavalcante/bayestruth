/**
 * Calibration diagnostics.
 *
 * BayesTruth claims its scores are calibrated, which is only true while the modeling assumptions hold
 * (independent Bernoulli trials with a stable rate; decay and the correlated-failure guard mitigate the
 * common violations). This module lets you check that claim in your own environment instead of taking
 * it on faith: record the trust score you acted on and the outcome that followed, then measure the
 * Brier score, the log loss, the expected calibration error, and the full reliability diagram. A
 * well-calibrated source has an observed success rate inside each probability bin close to the bin's
 * mean prediction. This is also the evidence an EU AI Act Article 12 reviewer asks for: not a promise
 * of calibration, a measurement of it. Pure, dependency-free, node-free.
 *
 * @packageDocumentation
 */

import { BayesTruthError } from '../errors.js';
import type { Outcome } from '../types.js';

export type { Outcome } from '../types.js';

/** One predicted probability paired with the outcome that actually occurred. */
export interface Prediction {
  /** The probability of success that was predicted, in [0, 1]. */
  readonly p: number;
  /** The realized outcome. */
  readonly outcome: Outcome | boolean;
}

/** One bin of a reliability diagram. */
export interface ReliabilityBin {
  readonly lower: number;
  readonly upper: number;
  /** Mean predicted probability of the predictions that fell in this bin. */
  readonly meanPredicted: number;
  /** Observed success rate of those predictions. */
  readonly observedRate: number;
  readonly count: number;
}

/** A complete calibration summary. */
export interface CalibrationReport {
  readonly count: number;
  readonly brier: number;
  readonly logLoss: number;
  readonly ece: number;
  readonly bins: ReadonlyArray<ReliabilityBin>;
}

const LOG_LOSS_EPSILON = 1e-15;

function asNumber(outcome: Outcome | boolean): number {
  return outcome === true || outcome === 'success' ? 1 : 0;
}

function assertNonEmpty(predictions: ReadonlyArray<Prediction>): void {
  if (predictions.length === 0) {
    throw new BayesTruthError('ERR_INVALID_INPUT', 'calibration requires at least one prediction');
  }
}

function assertProbability(p: number): void {
  if (!Number.isFinite(p) || p < 0 || p > 1) {
    throw new BayesTruthError(
      'ERR_INVALID_INPUT',
      `predicted probability must be in [0, 1], received ${p}`,
    );
  }
}

/** Mean squared error between predicted probabilities and outcomes. Lower is better; 0 is perfect. */
export function brierScore(predictions: ReadonlyArray<Prediction>): number {
  assertNonEmpty(predictions);
  let total = 0;
  for (const { p, outcome } of predictions) {
    assertProbability(p);
    const error = p - asNumber(outcome);
    total += error * error;
  }
  return total / predictions.length;
}

/** Mean negative log-likelihood of the outcomes under the predictions. Lower is better. */
export function logLoss(predictions: ReadonlyArray<Prediction>): number {
  assertNonEmpty(predictions);
  let total = 0;
  for (const { p, outcome } of predictions) {
    assertProbability(p);
    const clamped = Math.min(1 - LOG_LOSS_EPSILON, Math.max(LOG_LOSS_EPSILON, p));
    total += asNumber(outcome) === 1 ? -Math.log(clamped) : -Math.log(1 - clamped);
  }
  return total / predictions.length;
}

/** Group predictions into equal-width probability bins for a reliability diagram. */
export function reliabilityBins(
  predictions: ReadonlyArray<Prediction>,
  bins = 10,
): ReliabilityBin[] {
  assertNonEmpty(predictions);
  if (!Number.isInteger(bins) || bins < 1) {
    throw new BayesTruthError(
      'ERR_INVALID_INPUT',
      `bins must be a positive integer, received ${bins}`,
    );
  }
  const predictedSum = new Array<number>(bins).fill(0);
  const observedSum = new Array<number>(bins).fill(0);
  const counts = new Array<number>(bins).fill(0);
  for (const { p, outcome } of predictions) {
    assertProbability(p);
    const index = p >= 1 ? bins - 1 : Math.floor(p * bins);
    predictedSum[index] = (predictedSum[index] as number) + p;
    observedSum[index] = (observedSum[index] as number) + asNumber(outcome);
    counts[index] = (counts[index] as number) + 1;
  }
  const result: ReliabilityBin[] = [];
  for (let i = 0; i < bins; i += 1) {
    const count = counts[i] as number;
    result.push({
      lower: i / bins,
      upper: (i + 1) / bins,
      meanPredicted: count > 0 ? (predictedSum[i] as number) / count : 0,
      observedRate: count > 0 ? (observedSum[i] as number) / count : 0,
      count,
    });
  }
  return result;
}

/** Expected calibration error: the count-weighted mean gap between confidence and accuracy per bin. */
export function expectedCalibrationError(
  predictions: ReadonlyArray<Prediction>,
  bins = 10,
): number {
  const diagram = reliabilityBins(predictions, bins);
  let weighted = 0;
  for (const bin of diagram) {
    weighted += bin.count * Math.abs(bin.meanPredicted - bin.observedRate);
  }
  return weighted / predictions.length;
}

/** Compute every calibration diagnostic in one pass-friendly call. */
export function calibrationReport(
  predictions: ReadonlyArray<Prediction>,
  bins = 10,
): CalibrationReport {
  return {
    count: predictions.length,
    brier: brierScore(predictions),
    logLoss: logLoss(predictions),
    ece: expectedCalibrationError(predictions, bins),
    bins: reliabilityBins(predictions, bins),
  };
}
