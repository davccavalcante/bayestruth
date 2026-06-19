import { describe, expect, it } from 'vitest';
import { canonicalize } from '../src/canonical.js';

describe('canonicalize', () => {
  it('sorts object keys so logical equality implies byte equality', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
    expect(canonicalize({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it('preserves array order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });

  it('serializes primitives like JSON', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize('x')).toBe('"x"');
    expect(canonicalize(42)).toBe('42');
  });

  it('maps non-finite numbers to null', () => {
    expect(canonicalize(Number.NaN)).toBe('null');
    expect(canonicalize(Number.POSITIVE_INFINITY)).toBe('null');
  });

  it('stringifies bigint values', () => {
    expect(canonicalize(10n)).toBe('"10"');
  });

  it('drops undefined and function members from objects', () => {
    expect(canonicalize({ a: 1, b: undefined, c: () => 1 })).toBe('{"a":1}');
  });

  it('replaces undefined array members with null', () => {
    expect(canonicalize([1, undefined, 3])).toBe('[1,null,3]');
  });

  it('nests deterministically', () => {
    expect(canonicalize({ z: { y: 1, x: 2 }, a: [{ d: 1, c: 2 }] })).toBe(
      '{"a":[{"c":2,"d":1}],"z":{"x":2,"y":1}}',
    );
  });
});
