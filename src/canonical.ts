/**
 * Deterministic canonical JSON serialization.
 *
 * Produces a stable string for any JSON-serializable value by sorting object keys recursively, so
 * the same logical value always hashes to the same bytes regardless of key insertion order. Used by
 * the audit seal to build a reproducible hash chain. Arrays preserve order; undefined and function
 * values are dropped from objects, matching `JSON.stringify`.
 *
 * @packageDocumentation
 */

/** Serialize `value` to a deterministic, key-sorted JSON string. */
export function canonicalize(value: unknown): string {
  return write(value);
}

function write(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  const kind = typeof value;
  if (kind === 'number') {
    return Number.isFinite(value as number) ? JSON.stringify(value) : 'null';
  }
  if (kind === 'boolean' || kind === 'string') {
    return JSON.stringify(value);
  }
  if (kind === 'bigint') {
    return JSON.stringify((value as bigint).toString());
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => write(item === undefined ? null : item)).join(',')}]`;
  }
  if (kind === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => {
        const entry = record[key];
        return entry !== undefined && typeof entry !== 'function';
      })
      .sort();
    const body = keys.map((key) => `${JSON.stringify(key)}:${write(record[key])}`).join(',');
    return `{${body}}`;
  }
  return 'null';
}
