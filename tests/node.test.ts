import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFileStore } from '../src/node/index.js';
import { initialRecord, observeRecord } from '../src/trust/index.js';

function tempFile(name = 'store.json'): string {
  return join(mkdtempSync(join(tmpdir(), 'bayestruth-node-')), name);
}

function record(subject: string) {
  return observeRecord(initialRecord(subject), 'success', 1);
}

describe('createFileStore', () => {
  it('starts empty when the file does not exist', () => {
    const store = createFileStore(tempFile());
    expect(store.keys()).toEqual([]);
  });

  it('persists every write atomically and reloads on a new instance', () => {
    const path = tempFile();
    const store = createFileStore(path);
    store.set(record('a'));
    expect(existsSync(path)).toBe(true);

    const reopened = createFileStore(path);
    expect(reopened.keys()).toEqual(['a']);
    expect(reopened.get('a')?.successes).toBe(1);
  });

  it('reflects updates in the snapshot', () => {
    const path = tempFile();
    const store = createFileStore(path);
    store.set(record('a'));
    store.set(record('b'));
    expect(
      store
        .snapshot()
        .subjects.map((s) => s.subject)
        .sort(),
    ).toEqual(['a', 'b']);
    const onDisk = JSON.parse(readFileSync(path, 'utf8'));
    expect(onDisk.version).toBe(1);
    expect(onDisk.subjects).toHaveLength(2);
  });

  it('throws when the existing file is not a valid snapshot', () => {
    const path = tempFile();
    writeFileSync(path, 'not a snapshot', 'utf8');
    expect(() => createFileStore(path)).toThrow();
  });
});
