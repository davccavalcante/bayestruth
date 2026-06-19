import { describe, expect, it } from 'vitest';
import { createMemoryStore, decodeStore, encodeStore, loadStore } from '../src/store/index.js';
import { initialRecord, observeRecord } from '../src/trust/index.js';
import type { SubjectRecord } from '../src/types.js';

function sample(): SubjectRecord {
  return observeRecord(initialRecord('a'), 'success', 1);
}

describe('createMemoryStore', () => {
  it('stores, retrieves, lists, and snapshots records', () => {
    const store = createMemoryStore();
    const record = sample();
    store.set(record);
    expect(store.get('a')).toEqual(record);
    expect(store.get('missing')).toBeUndefined();
    expect(store.keys()).toEqual(['a']);
    expect(store.snapshot()).toEqual({ version: 1, subjects: [record] });
  });

  it('seeds from an initial snapshot', () => {
    const record = sample();
    const store = createMemoryStore({ version: 1, subjects: [record] });
    expect(store.get('a')).toEqual(record);
  });
});

describe('encode and decode', () => {
  it('round-trips through JSON', () => {
    const store = createMemoryStore();
    store.set(sample());
    const json = encodeStore(store);
    const restored = loadStore(json);
    expect(restored.snapshot()).toEqual(store.snapshot());
  });

  it('rejects malformed JSON', () => {
    expect(() => decodeStore('{not json')).toThrow();
  });

  it('rejects a non-object snapshot', () => {
    expect(() => decodeStore('42')).toThrow();
  });

  it('rejects a wrong version or missing subjects array', () => {
    expect(() => decodeStore(JSON.stringify({ version: 2, subjects: [] }))).toThrow();
    expect(() => decodeStore(JSON.stringify({ version: 1, subjects: {} }))).toThrow();
  });

  it('rejects records with a bad shape', () => {
    const base = { version: 1 };
    expect(() => decodeStore(JSON.stringify({ ...base, subjects: [null] }))).toThrow();
    expect(() => decodeStore(JSON.stringify({ ...base, subjects: [{ subject: 1 }] }))).toThrow();
    expect(() => decodeStore(JSON.stringify({ ...base, subjects: [{ subject: 'a' }] }))).toThrow();
    expect(() =>
      decodeStore(
        JSON.stringify({
          ...base,
          subjects: [
            {
              subject: 'a',
              posterior: { alpha: 0, beta: 1 },
              successes: 0,
              failures: 0,
              lastObservedAt: 0,
            },
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      decodeStore(
        JSON.stringify({
          ...base,
          subjects: [
            {
              subject: 'a',
              posterior: { alpha: 1, beta: 1 },
              successes: Number.NaN,
              failures: 0,
              lastObservedAt: 0,
            },
          ],
        }),
      ),
    ).toThrow();
  });
});
