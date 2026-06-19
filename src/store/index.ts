/**
 * Posterior store.
 *
 * Holds one {@link SubjectRecord} per subject. The default is in-process memory; the
 * {@link PosteriorStore} interface lets you back it with SQLite, Postgres, Redis, or anything else.
 * A store serializes to a portable JSON snapshot and back, so trust accumulated in one process can be
 * restored in another, which is what makes trust durable across restarts and exportable as evidence.
 *
 * @packageDocumentation
 */

import { assertPosterior } from '../beta/index.js';
import { BayesTruthError } from '../errors.js';
import type { PosteriorStore, StoreSnapshot, SubjectRecord } from '../types.js';

export type { PosteriorStore, StoreSnapshot, SubjectRecord } from '../types.js';

/** Create an in-memory posterior store, optionally seeded from a snapshot. */
export function createMemoryStore(initial?: StoreSnapshot): PosteriorStore {
  const map = new Map<string, SubjectRecord>();
  if (initial) {
    for (const record of initial.subjects) {
      map.set(record.subject, record);
    }
  }
  return {
    get: (subject) => map.get(subject),
    set: (record) => {
      map.set(record.subject, record);
    },
    keys: () => [...map.keys()],
    snapshot: () => ({ version: 1, subjects: [...map.values()] }),
  };
}

/** Serialize a store to a portable JSON string. */
export function encodeStore(store: PosteriorStore): string {
  return JSON.stringify(store.snapshot());
}

/**
 * Parse and validate a store snapshot from JSON.
 *
 * @throws {@link BayesTruthError} with code `ERR_INVALID_INPUT` when the shape is wrong.
 */
export function decodeStore(json: string): StoreSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new BayesTruthError('ERR_INVALID_INPUT', `invalid store JSON: ${describe(error)}`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new BayesTruthError('ERR_INVALID_INPUT', 'store snapshot must be an object');
  }
  const snapshot = parsed as { version?: unknown; subjects?: unknown };
  if (snapshot.version !== 1 || !Array.isArray(snapshot.subjects)) {
    throw new BayesTruthError(
      'ERR_INVALID_INPUT',
      'store snapshot must have version 1 and a subjects array',
    );
  }
  for (const record of snapshot.subjects) {
    assertRecord(record);
  }
  return { version: 1, subjects: snapshot.subjects as SubjectRecord[] };
}

/** Load a store directly from a JSON string. */
export function loadStore(json: string): PosteriorStore {
  return createMemoryStore(decodeStore(json));
}

function assertRecord(value: unknown): void {
  if (typeof value !== 'object' || value === null) {
    throw new BayesTruthError('ERR_INVALID_INPUT', 'each subject record must be an object');
  }
  const record = value as SubjectRecord;
  if (typeof record.subject !== 'string') {
    throw new BayesTruthError('ERR_INVALID_INPUT', 'subject record must have a string subject');
  }
  if (typeof record.posterior !== 'object' || record.posterior === null) {
    throw new BayesTruthError('ERR_INVALID_INPUT', `record "${record.subject}" has no posterior`);
  }
  assertPosterior(record.posterior);
  if (
    !Number.isFinite(record.successes) ||
    !Number.isFinite(record.failures) ||
    !Number.isFinite(record.lastObservedAt)
  ) {
    throw new BayesTruthError(
      'ERR_INVALID_INPUT',
      `record "${record.subject}" has non-finite counts or timestamp`,
    );
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
