import { describe, expect, it } from 'vitest';
import { BayesTruthError, isBayesTruthError } from '../src/errors.js';

describe('BayesTruthError', () => {
  it('carries a code and optional details', () => {
    const error = new BayesTruthError('ERR_INVALID_INPUT', 'bad', { field: 'x' });
    expect(error.name).toBe('BayesTruthError');
    expect(error.code).toBe('ERR_INVALID_INPUT');
    expect(error.details).toEqual({ field: 'x' });
    expect(error.message).toBe('bad');
    expect(error).toBeInstanceOf(Error);
  });

  it('omits details when none are given', () => {
    const error = new BayesTruthError('ERR_NUMERIC', 'overflow');
    expect(error.details).toBeUndefined();
  });
});

describe('isBayesTruthError', () => {
  it('narrows only genuine instances', () => {
    expect(isBayesTruthError(new BayesTruthError('ERR_NOT_FOUND', 'x'))).toBe(true);
    expect(isBayesTruthError(new Error('x'))).toBe(false);
    expect(isBayesTruthError('x')).toBe(false);
    expect(isBayesTruthError(null)).toBe(false);
  });
});
