import { describe, expect, it } from 'vitest';
import { createAuditLog, sealAuditLog, verifyAuditLog } from '../src/audit/index.js';
import { createDeterministicClock } from '../src/interceptors/index.js';
import type { AuditLog } from '../src/types.js';

describe('createAuditLog', () => {
  it('appends entries with monotonic sequence numbers and timestamps', () => {
    const logger = createAuditLog({ clock: createDeterministicClock(100, 10) });
    logger.append('observation', 'a', { value: 1 });
    logger.append('decision', 'b');
    const entries = logger.entries();
    expect(entries.map((e) => e.seq)).toEqual([0, 1]);
    expect(entries.map((e) => e.at)).toEqual([100, 110]);
    expect(entries[0]?.data).toEqual({ value: 1 });
    expect(entries[1]?.data).toBeUndefined();
  });

  it('derives a stable id and returns a fresh entries copy each call', () => {
    const logger = createAuditLog({ id: 'fixed', clock: createDeterministicClock(1) });
    logger.append('note', 'x');
    const first = logger.log();
    expect(first.id).toBe('fixed');
    expect(first.entries).not.toBe(logger.log().entries);
    expect(logger.log().entries).toHaveLength(1);
  });
});

describe('seal and verify', () => {
  it('seals and verifies a log', async () => {
    const logger = createAuditLog({ clock: createDeterministicClock(1) });
    logger.append('observation', 'a');
    logger.append('decision', 'b');
    const seal = await logger.seal();
    expect(seal.algorithm).toBe('sha-256');
    expect(seal.count).toBe(2);
    expect(seal.root).toMatch(/^[0-9a-f]{64}$/);
    expect(await logger.verify(seal)).toEqual({ valid: true });
  });

  it('detects a tampered entry', async () => {
    const logger = createAuditLog({ clock: createDeterministicClock(1) });
    logger.append('observation', 'original');
    const seal = await logger.seal();
    const original = logger.log();
    const tampered: AuditLog = {
      id: original.id,
      entries: original.entries.map((entry) => ({ ...entry, summary: 'forged' })),
    };
    expect(await verifyAuditLog(tampered, seal)).toEqual({ valid: false });
  });

  it('reports a broken position on a count mismatch', async () => {
    const logger = createAuditLog({ clock: createDeterministicClock(1) });
    logger.append('observation', 'a');
    logger.append('observation', 'b');
    const seal = await logger.seal();
    const shortened: AuditLog = {
      id: logger.log().id,
      entries: logger.log().entries.slice(0, 1),
    };
    expect(await verifyAuditLog(shortened, seal)).toEqual({ valid: false, brokenAt: 1 });
  });

  it('rejects an unsupported seal algorithm', async () => {
    const logger = createAuditLog();
    await expect(
      verifyAuditLog(logger.log(), { algorithm: 'md5' as 'sha-256', root: 'x', count: 0 }),
    ).rejects.toThrow();
  });

  it('rejects a malformed log when sealing', async () => {
    await expect(sealAuditLog({ id: 1 as unknown as string, entries: [] })).rejects.toThrow();
  });
});
