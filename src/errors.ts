/**
 * The single error type for @takk/bayestruth.
 *
 * Every failure raised by the library is a {@link BayesTruthError} carrying a stable, machine-readable
 * {@link BayesTruthErrorCode}. Callers branch on `error.code`, never on message text.
 *
 * @packageDocumentation
 */

/** Stable, machine-readable error codes. Branch on these, not on message strings. */
export type BayesTruthErrorCode =
  | 'ERR_INVALID_INPUT'
  | 'ERR_INVALID_PRIOR'
  | 'ERR_NO_SUBJECTS'
  | 'ERR_NOT_FOUND'
  | 'ERR_INVALID_AUDIT'
  | 'ERR_NUMERIC';

/** The single error type thrown across the whole library. */
export class BayesTruthError extends Error {
  readonly code: BayesTruthErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: BayesTruthErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'BayesTruthError';
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
    Object.setPrototypeOf(this, BayesTruthError.prototype);
  }
}

/** Type guard for {@link BayesTruthError}. */
export function isBayesTruthError(value: unknown): value is BayesTruthError {
  return value instanceof BayesTruthError;
}
