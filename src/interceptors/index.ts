/**
 * Observation hooks.
 *
 * The mechanics of turning a function call into a Bernoulli outcome. Wrap any sync or async callable
 * and every invocation emits an {@link Observation} (success or failure) to a sink, which the facade
 * folds into the posterior store. A resolved call is a success and a thrown call is a failure by
 * default; pass a classifier to score a returned value instead, so an HTTP 500 or a tool result
 * flagged as an error counts against trust even though it did not throw.
 *
 * @packageDocumentation
 */

import type { Clock, Outcome } from '../types.js';

export type { Clock, Outcome } from '../types.js';

/** A single recorded outcome of one observed call. */
export interface Observation {
  readonly subject: string;
  readonly outcome: Outcome;
  /** Epoch milliseconds the outcome was recorded, from the injected clock. */
  readonly at: number;
  /** The thrown error, present only on a failure that threw. */
  readonly error?: unknown;
}

/** A consumer of observations, typically the facade folding them into the store. */
export type OutcomeSink = (observation: Observation) => void;

/** Decide whether a returned value counts as a success. Defaults to treating any value as success. */
export type SuccessClassifier<T> = (value: T) => boolean;

/** Options shared by the observation helpers. */
export interface ObserveOptions<T> {
  readonly clock?: Clock;
  readonly isSuccess?: SuccessClassifier<T>;
  readonly sink?: OutcomeSink;
}

/**
 * A monotonic, deterministic clock for tests and reproducible audits. Each call returns the next
 * value, starting at `start` and advancing by `step`.
 */
export function createDeterministicClock(start = 0, step = 1): Clock {
  let current = start;
  return () => {
    const value = current;
    current += step;
    return value;
  };
}

function emit<T>(
  subject: string,
  outcome: Outcome,
  options: ObserveOptions<T>,
  error?: unknown,
): Observation {
  const at = (options.clock ?? Date.now)();
  const observation: Observation =
    error === undefined ? { subject, outcome, at } : { subject, outcome, at, error };
  options.sink?.(observation);
  return observation;
}

/** Observe one async call: classify the outcome, emit it, and return the original value or rethrow. */
export async function observe<T>(
  subject: string,
  fn: () => Promise<T>,
  options: ObserveOptions<T> = {},
): Promise<T> {
  try {
    const value = await fn();
    const success = options.isSuccess ? options.isSuccess(value) : true;
    emit(subject, success ? 'success' : 'failure', options);
    return value;
  } catch (error) {
    emit(subject, 'failure', options, error);
    throw error;
  }
}

/** Observe one synchronous call: classify the outcome, emit it, and return the value or rethrow. */
export function observeSync<T>(subject: string, fn: () => T, options: ObserveOptions<T> = {}): T {
  try {
    const value = fn();
    const success = options.isSuccess ? options.isSuccess(value) : true;
    emit(subject, success ? 'success' : 'failure', options);
    return value;
  } catch (error) {
    emit(subject, 'failure', options, error);
    throw error;
  }
}

/** Wrap an async function so every call to it is observed under `subject`. */
export function wrap<A extends unknown[], T>(
  subject: string,
  fn: (...args: A) => Promise<T>,
  options: ObserveOptions<T> = {},
): (...args: A) => Promise<T> {
  return (...args: A) => observe(subject, () => fn(...args), options);
}

/** Wrap a synchronous function so every call to it is observed under `subject`. */
export function wrapSync<A extends unknown[], T>(
  subject: string,
  fn: (...args: A) => T,
  options: ObserveOptions<T> = {},
): (...args: A) => T {
  return (...args: A) => observeSync(subject, () => fn(...args), options);
}

/** A classifier for HTTP-like results: a status below 400 is a success. */
export function httpStatusIsSuccess(result: { status: number }): boolean {
  return result.status < 400;
}
