import { describe, expect, it } from 'vitest';
import { cyrb53 } from '../src/hash.js';

describe('cyrb53', () => {
  it('returns a 14-character lowercase hex string', () => {
    expect(cyrb53('hello')).toMatch(/^[0-9a-f]{14}$/);
  });

  it('is deterministic for the same input', () => {
    expect(cyrb53('bayestruth')).toBe(cyrb53('bayestruth'));
  });

  it('differs for different inputs and seeds', () => {
    expect(cyrb53('a')).not.toBe(cyrb53('b'));
    expect(cyrb53('a', 1)).not.toBe(cyrb53('a', 2));
  });

  it('handles the empty string', () => {
    expect(cyrb53('')).toMatch(/^[0-9a-f]{14}$/);
  });
});
