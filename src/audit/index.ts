/**
 * Audit logger.
 *
 * An append-only record of every observation, decision, and selection, with a tamper-evident SHA-256
 * hash chain you can seal and later verify. The chain uses the Web Crypto API (not node:crypto), so
 * the audit surface stays node-free and runs in Node, edge runtimes, and the browser. This is the
 * compliance evidence the NSA MCP security guidance and EU AI Act Article 12 ask for: a verifiable
 * log that trust decisions were made on the recorded evidence. It is an integrity seal, not a digital
 * signature: it proves a log was not altered after sealing, not who produced it.
 *
 * @packageDocumentation
 */

import { canonicalize } from '../canonical.js';
import { BayesTruthError } from '../errors.js';
import { cyrb53 } from '../hash.js';
import type {
  AuditEntry,
  AuditEventType,
  AuditLog,
  AuditSeal,
  Clock,
  VerifyResult,
} from '../types.js';

export type { AuditEntry, AuditEventType, AuditLog, AuditSeal, VerifyResult } from '../types.js';

const CHAIN_PREFIX = 'bayestruth-audit-v1';

/** A live, append-only audit logger. */
export interface AuditLogger {
  append(type: AuditEventType, summary: string, data?: unknown): AuditEntry;
  entries(): ReadonlyArray<AuditEntry>;
  log(): AuditLog;
  seal(): Promise<AuditSeal>;
  verify(seal: AuditSeal): Promise<VerifyResult>;
}

/** Options for {@link createAuditLog}. */
export interface CreateAuditLogOptions {
  readonly id?: string;
  readonly clock?: Clock;
}

/** Create a live, append-only audit logger. */
export function createAuditLog(options: CreateAuditLogOptions = {}): AuditLogger {
  const clock = options.clock ?? Date.now;
  // The default id is derived from the chain prefix, not the clock, so enabling auditing never shifts
  // the observation timestamps. Pass an explicit id when you need to distinguish concurrent logs.
  const id = options.id ?? `audit_${cyrb53(CHAIN_PREFIX)}`;
  const entries: AuditEntry[] = [];
  let seq = 0;

  function append(type: AuditEventType, summary: string, data?: unknown): AuditEntry {
    const at = clock();
    const entry: AuditEntry =
      data === undefined ? { seq, at, type, summary } : { seq, at, type, summary, data };
    entries.push(entry);
    seq += 1;
    return entry;
  }

  function log(): AuditLog {
    return { id, entries: [...entries] };
  }

  return {
    append,
    entries: () => [...entries],
    log,
    seal: () => sealAuditLog(log()),
    verify: (seal) => verifyAuditLog(log(), seal),
  };
}

function getSubtle(): SubtleCrypto {
  const provider = (globalThis as { crypto?: Crypto }).crypto;
  if (!provider?.subtle) {
    throw new BayesTruthError(
      'ERR_INVALID_AUDIT',
      'Web Crypto SubtleCrypto is unavailable in this runtime',
    );
  }
  return provider.subtle;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await getSubtle().digest('SHA-256', bytes);
  let hex = '';
  for (const byte of new Uint8Array(digest)) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

async function chainRoot(log: AuditLog): Promise<string> {
  let prev = await sha256Hex(`${CHAIN_PREFIX}:${log.id}`);
  for (const entry of log.entries) {
    prev = await sha256Hex(`${prev}\n${canonicalize(entry)}`);
  }
  return prev;
}

/** Seal a log into a tamper-evident SHA-256 hash-chain root. */
export async function sealAuditLog(log: AuditLog): Promise<AuditSeal> {
  if (typeof log.id !== 'string' || !Array.isArray(log.entries)) {
    throw new BayesTruthError(
      'ERR_INVALID_AUDIT',
      'log must have a string id and an entries array',
    );
  }
  const root = await chainRoot(log);
  return { algorithm: 'sha-256', root, count: log.entries.length };
}

/** Verify a log against a seal. */
export async function verifyAuditLog(log: AuditLog, seal: AuditSeal): Promise<VerifyResult> {
  if (seal.algorithm !== 'sha-256') {
    throw new BayesTruthError(
      'ERR_INVALID_AUDIT',
      `unsupported seal algorithm "${seal.algorithm}"`,
    );
  }
  if (log.entries.length !== seal.count) {
    return { valid: false, brokenAt: Math.min(log.entries.length, seal.count) };
  }
  const root = await chainRoot(log);
  return root === seal.root ? { valid: true } : { valid: false };
}
