/**
 * Node file-backed posterior store.
 *
 * The default store lives in memory, which is enough for one process but loses every accumulated
 * posterior on restart. This adapter persists the whole store to a single JSON file and reloads it on
 * construction, so trust survives restarts with no database. Writes are atomic: the snapshot is written
 * to a temporary file and renamed over the target, so a crash mid-write never corrupts the store. This
 * is the only entry point that touches a Node built-in (`node:fs`); the rest of BayesTruth stays
 * node-free. For higher throughput or sharing across processes, implement {@link PosteriorStore} over
 * SQLite, Postgres, or Redis instead; this file store is the zero-dependency reference.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createMemoryStore, decodeStore, encodeStore } from '../store/index.js';
import type { PosteriorStore, StoreSnapshot, SubjectRecord } from '../types.js';

export type { PosteriorStore, StoreSnapshot, SubjectRecord } from '../types.js';

/**
 * Create a posterior store backed by a JSON file at `path`. Existing contents are loaded on creation;
 * every write is flushed atomically.
 *
 * @throws {@link BayesTruthError} with code `ERR_INVALID_INPUT` when the existing file is not a valid
 *   store snapshot.
 */
export function createFileStore(path: string): PosteriorStore {
  const initial = existsSync(path) ? decodeStore(readFileSync(path, 'utf8')) : undefined;
  const memory = createMemoryStore(initial);

  function persist(): void {
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, encodeStore(memory), 'utf8');
    renameSync(temporary, path);
  }

  return {
    get: (subject: string): SubjectRecord | undefined => memory.get(subject),
    set: (record: SubjectRecord): void => {
      memory.set(record);
      persist();
    },
    keys: (): ReadonlyArray<string> => memory.keys(),
    snapshot: (): StoreSnapshot => memory.snapshot(),
  };
}
